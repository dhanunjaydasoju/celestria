// AI astronomer orchestration — owner: AI (implemented by LEAD in M5 Phase 2).
//
//   question ──► limits ──► cache ──► pre-retrieval (planets, systems and
//   concepts named in the question) ──► model ⇄ read-only tools ──► JSON
//   answer ──► validate ──┬─ ok ──────────────► answer (+ links, sources)
//                         └─ fail ─► repair ──► … ──► safe "unverified" reply
//
// Guarantees:
//   • Nothing the model writes reaches the user unless validate.js accepts
//     it. Clarifications, "insufficient data" and "unverified" replies are
//     built deterministically from tool results, never from model text.
//   • Tools are read-only functions over the canonical catalogue.
//   • Primary model Qwen3-32B (/no_think); the fallback model is used only
//     after a retryable provider failure, and its answers are validated
//     exactly the same way.
//   • Every model call reserves spend first (limits.js).
//   • Progress: `onProgress` receives an event only when a stage really
//     starts or finishes on the server (queued, admitted, retrieved, model,
//     tools, fallback, validating, repair, cached). Model text is never
//     streamed; the validated result is returned at the end.

import { CONCEPTS, findConceptsIn } from './knowledge/concepts.js'
import { LimitError } from './limits.js'
import { ProviderError } from './featherless.js'
import { FINAL_INSTRUCTION, ISSUE_LABELS, repairPrompt, systemPrompt } from './prompts.js'
import { findMentions } from './tools/catalog.js'
import { runTool, TOOL_DEFINITIONS } from './tools/index.js'
import { buildEvidence, validateAnswer } from './validate.js'

export class AskError extends Error {
  constructor(code, message, status) {
    super(message)
    this.name = 'AskError'
    this.code = code
    this.status = status
  }
}

const ANSWER_TYPES = new Set(['answer', 'clarification', 'insufficient_data'])
const MAX_PRE_PLANETS = 4
const HABITABILITY_QUESTION = /\b(habitab\w*|life|alive|liv(e|ing) on|goldilocks|temperate|liquid water)\b/i
const MAX_PRE_SYSTEMS = 2
const CACHE_MAX = 200
const TOOLS_CHARS = JSON.stringify(TOOL_DEFINITIONS).length
const estimateTokens = (messages) => Math.ceil((JSON.stringify(messages).length + TOOLS_CHARS) / 3)

/** Extract the JSON answer from model text (tolerates <think> blocks and fences). */
export function parseModelAnswer(content, finishReason = null) {
  if (finishReason === 'length') return { ok: false, issue: 'The reply was cut off by the length limit; answer more briefly.' }
  const text = String(content ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return { ok: false, issue: 'Reply with one JSON object in the given format.' }
  let json
  try {
    json = JSON.parse(text.slice(start, end + 1))
  } catch {
    return { ok: false, issue: 'The JSON could not be parsed; reply with valid JSON only.' }
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { ok: false, issue: 'Reply with one JSON object.' }
  const type = json.type ?? 'answer'
  if (!ANSWER_TYPES.has(type)) return { ok: false, issue: `"type" must be answer, clarification or insufficient_data.` }
  return { ok: true, answer: { ...json, type } }
}

/** Human-readable label for a tool call (progress events; no values). */
export function toolLabel({ name, args, result }) {
  const ok = result?.status === 'ok'
  switch (name) {
    case 'get_planet':
      return `NASA record: ${ok ? result.name : args?.name ?? '?'}`
    case 'get_system':
      return `System: ${ok ? result.host : args?.host ?? '?'}`
    case 'compare_planets':
      return `Comparison: ${(args?.names ?? []).join(', ')}`
    case 'compute_orbit':
      return `Orbit calculation: ${ok ? result.planet : args?.name ?? '?'}`
    case 'search_planets':
      return 'Catalogue search'
    case 'catalog_facts':
      return 'Catalogue statistics'
    case 'assess_habitability':
      return `Habitability indicators: ${ok ? result.planet : args?.name ?? '?'}`
    case 'explain_concept':
      return `Reference: ${ok ? result.title : args?.concept ?? '?'}`
    default:
      return name
  }
}
const toolSummary = (e) => ({ name: e.name, label: toolLabel(e), status: e.result?.status ?? 'error' })

const normQuestion = (q) => q.toLowerCase().replace(/\s+/g, ' ').replace(/[?!.]+$/, '').trim()

/**
 * @param {{
 *   config: ReturnType<typeof import('./config.js').loadAiConfig>,
 *   client: ReturnType<typeof import('./featherless.js').createFeatherlessClient>,
 *   limiter: ReturnType<typeof import('./limits.js').createLimiter>,
 *   getToolContext: () => ({ ctx: object, version: string } | null),
 *   log?: (entry: object) => void,
 *   now?: () => number,
 * }} deps
 */
export function createAstronomer({ config, client, limiter, getToolContext, log = () => {}, now = Date.now }) {
  const L = config.limits
  const cache = new Map()

  const cacheGet = (key) => {
    const hit = cache.get(key)
    if (!hit) return null
    if (hit.expires <= now()) {
      cache.delete(key)
      return null
    }
    return hit.value
  }
  const cachePut = (key, value) => {
    if (L.AI_CACHE_TTL_SECONDS <= 0) return
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
    cache.set(key, { value, expires: now() + L.AI_CACHE_TTL_SECONDS * 1000 })
  }

  function checkInput({ question, planetId, host, compareIds, history }) {
    if (typeof question !== 'string' || !question.trim()) throw new AskError('BAD_REQUEST', 'Ask a question.', 400)
    if (question.length > L.AI_MAX_INPUT_CHARS) throw new AskError('BAD_REQUEST', `Questions are limited to ${L.AI_MAX_INPUT_CHARS} characters.`, 400)
    if (planetId != null && (typeof planetId !== 'string' || planetId.length > 120)) throw new AskError('BAD_REQUEST', 'planetId must be a planet id string.', 400)
    if (host != null && (typeof host !== 'string' || host.length > 120)) throw new AskError('BAD_REQUEST', 'host must be a host star name.', 400)
    if (compareIds != null && (!Array.isArray(compareIds) || compareIds.length > 4 || compareIds.some((id) => typeof id !== 'string' || id.length > 120))) {
      throw new AskError('BAD_REQUEST', 'compareIds must be at most 4 planet ids.', 400)
    }
    if (history != null) {
      if (!Array.isArray(history)) throw new AskError('BAD_REQUEST', 'history must be an array.', 400)
      for (const h of history) {
        if (!h || !['user', 'assistant'].includes(h.role) || typeof h.content !== 'string') throw new AskError('BAD_REQUEST', 'history items need role (user|assistant) and content.', 400)
      }
    }
  }

  /** Deterministic lookups for what the question (and page) names. */
  function preRetrieve(ctx, question, { planetId, host, compareIds }) {
    const calls = []
    const mentions = findMentions(ctx, question)
    const planets = []
    const context = [planetId, ...(compareIds ?? [])].map((id) => (id ? ctx.byId.get(id) : null))
    for (const p of [...context, ...mentions.planets]) if (p && !planets.includes(p)) planets.push(p)
    for (const p of planets.slice(0, MAX_PRE_PLANETS)) calls.push(['get_planet', { name: p.id }])
    // Habitability questions get the deterministic indicators up front.
    if (HABITABILITY_QUESTION.test(question)) for (const p of planets.slice(0, 2)) calls.push(['assess_habitability', { name: p.id }])
    const covered = new Set(planets.map((p) => p.host))
    // The page's system is always retrieved (its sibling planets matter);
    // systems merely mentioned are skipped when one of their planets is.
    const contextHost = host && ctx.byHost.has(host) ? [host] : []
    const hosts = [...contextHost, ...mentions.hosts.filter((h) => !covered.has(h) && !contextHost.includes(h))]
    for (const h of hosts.slice(0, MAX_PRE_SYSTEMS)) calls.push(['get_system', { host: h }])
    for (const key of findConceptsIn(question)) calls.push(['explain_concept', { concept: CONCEPTS[key].title }])
    return calls.map(([name, args]) => runTool(ctx, name, args))
  }

  /**
   * @param {{ question: string, planetId?: string|null, host?: string|null, compareIds?: string[]|null, history?: {role: string, content: string}[], clientKey: string, signal?: AbortSignal, onProgress?: (event: object) => void }} req
   */
  async function ask({ question, planetId = null, host = null, compareIds = null, history = [], clientKey, signal, onProgress }) {
    const started = now()
    const emit = (stage, data = {}) => {
      try {
        onProgress?.({ stage, at: now() - started, ...data })
      } catch {
        /* a progress listener must never break the question */
      }
    }
    checkInput({ question, planetId, host, compareIds, history })
    if (!config.configured) throw new AskError('AI_UNAVAILABLE', 'The AI astronomer is not configured on this server.', 503)
    limiter.checkClient(clientKey)

    const tc = getToolContext()
    if (!tc) throw new AskError('UNAVAILABLE', 'Catalogue is loading.', 503)
    const { ctx, version } = tc
    const turns = (history ?? []).slice(-L.AI_MAX_HISTORY_TURNS * 2)
    const cacheKey = turns.length ? null : JSON.stringify([version, planetId, host, compareIds, normQuestion(question)])
    const cached = cacheKey && cacheGet(cacheKey)
    if (cached) {
      emit('cached')
      return { ...cached, cached: true, ms: now() - started }
    }

    const ticket = await limiter.admit(signal, { onQueued: (position) => emit('queued', { position }) })
    emit('admitted')
    const deadline = AbortSignal.timeout(L.AI_REQUEST_TIMEOUT_MS)
    const runSignal = signal ? AbortSignal.any([signal, deadline]) : deadline
    const stats = { calls: 0, costUsd: 0, providerErrors: [], fallbackUsed: false }
    let model = config.model
    let result
    try {
      result = await run()
    } catch (err) {
      if (err instanceof ProviderError) {
        if (deadline.aborted) throw new AskError('TIMEOUT', 'The AI astronomer took too long to answer. Please try again.', 504)
        if (err.code === 'aborted') throw new AskError('CANCELLED', 'Request cancelled.', 499)
        throw new AskError('PROVIDER_ERROR', 'The AI service is not responding right now. Please try again shortly.', 502)
      }
      throw err
    } finally {
      ticket.release()
      log({ event: 'ask', status: result?.status ?? 'error', model, fallbackUsed: stats.fallbackUsed, calls: stats.calls, costUsd: Number(stats.costUsd.toFixed(6)), providerErrors: stats.providerErrors, ms: now() - started })
    }
    if (cacheKey && result.status !== 'unverified') cachePut(cacheKey, result)
    return { ...result, ms: now() - started }

    // ── one question ────────────────────────────────────────────────────
    async function callModel(messages, tools, purpose) {
      for (;;) {
        const remaining = L.AI_REQUEST_TIMEOUT_MS - (now() - started)
        if (remaining <= 50 || deadline.aborted) throw new AskError('TIMEOUT', 'The AI astronomer took too long to answer. Please try again.', 504)
        if (runSignal.aborted) throw new AskError('CANCELLED', 'Request cancelled.', 499)
        ticket.reserveCall() // throws LimitError when the daily spend limit is reached
        stats.calls++
        emit('model', { call: stats.calls, model, purpose, withTools: Boolean(tools) })
        try {
          const r = await client.chat({ model, messages, tools, maxTokens: L.AI_MAX_OUTPUT_TOKENS, timeoutMs: Math.min(L.AI_CALL_TIMEOUT_MS, remaining), signal: runSignal })
          stats.costUsd += ticket.settleCall(r.usage.costUsd)
          return r
        } catch (err) {
          stats.costUsd += ticket.settleCall(null)
          if (!(err instanceof ProviderError)) throw err
          stats.providerErrors.push({ model, code: err.code })
          // Fallback only for retryable failures, once, and then stay on it.
          if (err.retryable && !stats.fallbackUsed && model !== config.fallbackModel && !runSignal.aborted) {
            stats.fallbackUsed = true
            emit('fallback', { from: model, to: config.fallbackModel, reason: err.code })
            model = config.fallbackModel
            continue
          }
          throw err
        }
      }
    }

    async function run() {
      const evidence = preRetrieve(ctx, question, { planetId, host, compareIds })
      emit('retrieved', { tools: evidence.map(toolSummary) })
      const contextPlanet = planetId ? ctx.byId.get(planetId) : null
      const contextNote = [
        contextPlanet && `The user is viewing the profile of ${contextPlanet.name}, id "${contextPlanet.id}".`,
        host && !contextPlanet && ctx.byHost.has(host) && `The user is viewing the ${host} system.`,
        compareIds?.length && `The user is comparing: ${compareIds.map((id) => ctx.byId.get(id)?.name).filter(Boolean).join(', ')}.`,
      ].filter(Boolean)
      const messages = [
        { role: 'system', content: systemPrompt() },
        ...turns.map((h) => ({ role: h.role, content: h.content.slice(0, L.AI_MAX_INPUT_CHARS) })),
        { role: 'user', content: question.trim() + (contextNote.length ? `\n\n(${contextNote.join(' ')})` : '') },
      ]
      if (evidence.length) {
        const ids = evidence.map((_, i) => `pre_${i}`)
        messages.push({ role: 'assistant', content: '', tool_calls: evidence.map((e, i) => ({ id: ids[i], type: 'function', function: { name: e.name, arguments: JSON.stringify(e.args) } })) })
        evidence.forEach((e, i) => messages.push({ role: 'tool', tool_call_id: ids[i], name: e.name, content: JSON.stringify(e.result) }))
      }

      let rounds = 0
      let repairs = 0
      let lastIssues = []
      let forceFinal = false
      let purpose = 'draft'
      const maxCalls = L.AI_MAX_TOOL_ROUNDS + L.AI_MAX_REPAIR_ATTEMPTS + 2

      while (stats.calls < maxCalls) {
        const toolsAllowed = !forceFinal && rounds < L.AI_MAX_TOOL_ROUNDS && estimateTokens(messages) < L.AI_PROMPT_TOKEN_BUDGET * 0.85
        const r = await callModel(messages, toolsAllowed ? TOOL_DEFINITIONS : undefined, forceFinal && purpose === 'draft' ? 'final' : purpose)
        const calls = r.message.tool_calls ?? []

        if (calls.length && toolsAllowed) {
          rounds++
          const toolCalls = calls.map((c, i) => ({ id: c.id || `call_${rounds}_${i}`, type: 'function', function: { name: c.function.name, arguments: typeof c.function.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function.arguments ?? {}) } }))
          messages.push({ role: 'assistant', content: r.message.content || '', tool_calls: toolCalls })
          const executedThisRound = []
          toolCalls.forEach((c, i) => {
            let out
            if (i >= L.AI_MAX_TOOL_CALLS_PER_ROUND) out = { status: 'error', error: `At most ${L.AI_MAX_TOOL_CALLS_PER_ROUND} tool calls per round.` }
            else {
              const executed = runTool(ctx, c.function.name, c.function.arguments)
              evidence.push(executed)
              executedThisRound.push(executed)
              out = executed.result
            }
            let content = JSON.stringify(out)
            if (estimateTokens(messages) + content.length / 3 > L.AI_PROMPT_TOKEN_BUDGET) {
              content = JSON.stringify({ status: 'error', error: 'Context budget reached; answer with the data you already have.' })
              forceFinal = true
            }
            messages.push({ role: 'tool', tool_call_id: c.id, name: c.function.name, content })
          })
          emit('tools', { tools: executedThisRound.map(toolSummary) })
          if (rounds >= L.AI_MAX_TOOL_ROUNDS || forceFinal) {
            forceFinal = true
            messages.push({ role: 'user', content: FINAL_INSTRUCTION })
          }
          continue
        }

        // Tool calls when tools were not offered are ignored (Featherless
        // ignores tool_choice); the text, if any, is treated as the answer.
        emit('validating', { call: stats.calls })
        const outcome = assess(parseModelAnswer(r.message.content, r.finishReason), evidence)
        if (outcome.ok) return finish(outcome.response, evidence, { repairs })
        lastIssues = outcome.issues
        if (repairs >= L.AI_MAX_REPAIR_ATTEMPTS) break
        repairs++
        purpose = 'repair'
        emit('repair', { attempt: repairs, of: L.AI_MAX_REPAIR_ATTEMPTS, issues: [...new Set(outcome.issues.map((e) => e.rule))] })
        const canUseTools = rounds < L.AI_MAX_TOOL_ROUNDS && !forceFinal
        messages.push({ role: 'assistant', content: r.message.content || '(no answer)' })
        messages.push({ role: 'user', content: repairPrompt(outcome.issues, { toolsAllowed: canUseTools }) })
      }
      return finish(unverified(lastIssues, evidence), evidence, { repairs })
    }

    function finish(response, evidence, { repairs }) {
      return {
        ...response,
        model,
        fallbackUsed: stats.fallbackUsed,
        cached: false,
        tools: evidence.map((e) => ({ name: e.name, args: e.args, status: e.result?.status ?? 'error' })),
        usage: { calls: stats.calls, costUsd: Number(stats.costUsd.toFixed(6)) },
        validation: { ...(response.validation ?? {}), repairs },
      }
    }
  }

  /** Decide whether a parsed answer may be shown, and build what is shown. */
  function assess(parsed, evidence) {
    if (!parsed.ok) return { ok: false, issues: [{ rule: 'format', message: parsed.issue }] }
    const answer = parsed.answer
    const ev = buildEvidence(evidence)

    if (answer.type === 'clarification') {
      const options = [...new Set(answer.clarify?.options ?? [])]
      const valid = options.filter((id) => ev.planets.has(id))
      if (valid.length && valid.length === options.length) {
        return { ok: true, response: { status: 'clarification', message: 'Which planet do you mean?', options: valid.map((id) => ev.planets.get(id)), sections: [], links: [], sources: [], validation: { warnings: [] } } }
      }
      const unknown = evidence.filter((e) => e.result?.status === 'not_found' && !(e.result.suggestions ?? []).length)
      if (!options.length && unknown.length) {
        return { ok: true, response: { status: 'not_found', message: `No confirmed planet named ${unknown.map((e) => `"${e.result.query}"`).join(', ')} is in the NASA Exoplanet Archive catalogue.`, sections: [], links: [], sources: [], validation: { warnings: [] } } }
      }
      return { ok: false, issues: [{ rule: 'clarification', message: 'clarify.options must list planet ids returned by the tools (candidates or suggestions).' }] }
    }

    if (answer.type === 'insufficient_data') {
      // Show only claims that validate; otherwise just the fixed message.
      const sections = Array.isArray(answer.sections) ? answer.sections : []
      const v = sections.length ? validateAnswer({ sections, planets: answer.planets }, evidence, { question: '', requireReferences: true }) : null
      return {
        ok: true,
        response: {
          status: 'insufficient_data',
          message: "The NASA catalogue and CELESTRIA's references don't contain enough information to answer this reliably.",
          sections: v?.ok ? sections : [],
          links: v?.ok ? v.links : [],
          sources: v?.ok ? v.sources : [],
          validation: { warnings: v?.warnings ?? [] },
        },
      }
    }

    const v = validateAnswer(answer, evidence, { requireReferences: true })
    if (!v.ok) return { ok: false, issues: v.errors }
    return {
      ok: true,
      response: {
        status: 'answered',
        sections: answer.sections.map((s) => ({ title: typeof s.title === 'string' ? s.title.slice(0, 80) : '', claims: s.claims.map((c) => ({ text: c.text, basis: c.basis, refs: c.refs ?? [] })) })),
        links: v.links.length ? v.links : lookedUp(evidence),
        sources: v.sources,
        validation: { warnings: v.warnings, checkedNumbers: v.checkedNumbers },
      },
    }
  }

  /** Planets successfully looked up (profile links are always safe to show). */
  function lookedUp(evidence) {
    const ev = buildEvidence(evidence.filter((e) => e.name === 'get_planet' && e.result?.status === 'ok'))
    return [...ev.planets.values()].slice(0, 4)
  }

  function unverified(issues, evidence) {
    const labels = [...new Set(issues.map((e) => ISSUE_LABELS[e.rule] ?? 'a statement that could not be verified'))]
    return {
      status: 'unverified',
      message: `I couldn't verify my answer against the NASA data, so it isn't shown.${labels.length ? ` It contained ${labels.slice(0, 4).join('; ')}.` : ''} You can check the catalogue values on the planet profiles directly.`,
      sections: [],
      links: lookedUp(evidence),
      sources: [],
      // Rule codes only: validator messages can quote the rejected text.
      validation: { warnings: [], issues: [...new Set(issues.map((e) => e.rule))] },
    }
  }

  return { ask, clearCache: () => cache.clear() }
}

export { LimitError }
