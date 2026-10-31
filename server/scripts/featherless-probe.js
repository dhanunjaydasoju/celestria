// M5 Phase 0: live Featherless capability probe — owner: AI (LEAD in M5).
//
//   node --env-file=.env server/scripts/featherless-probe.js [--runs=5]
//
// Reads FEATHERLESS_API_KEY from .env (server side only). The key is never
// printed: requests use config.authHeaders(), and every response body or
// error message passes through config.redact() before it is shown. Requests
// run one at a time to stay within the plan's concurrency. A JSON report is
// written to the OS temp directory (outside the repo).

import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadAiConfig } from '../ai/config.js'

const config = loadAiConfig(process.env)
const RUNS = Number(process.argv.find((a) => a.startsWith('--runs='))?.split('=')[1] ?? 5)
const MODELS = [...new Set([config.fallbackModel, config.model])] // 14B first (cheaper)

if (!config.configured) {
  console.error('FEATHERLESS_API_KEY is not set. Add it to .env in the project root (see .env.example), then re-run.')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SENSITIVE = /email|user|account|owner|key|token|secret|^id$|_id$/i

/** One request with timing; retries once on 429/503. Never throws. */
async function call(pathname, { method = 'GET', body, timeoutMs = 90000, stream = false } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const t0 = performance.now()
    try {
      const res = await fetch(`${config.baseUrl}${pathname}`, {
        method,
        headers: config.authHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      const text = stream ? await readStream(res) : await res.text()
      const ms = Math.round(performance.now() - t0)
      if ((res.status === 429 || res.status === 503) && attempt === 0) {
        await sleep(5000)
        continue
      }
      let json = null
      if (!stream) {
        try {
          json = JSON.parse(text)
        } catch {
          /* non-JSON error body */
        }
      }
      // Streams are parsed in full; only non-stream bodies are shortened for the report.
      return { ok: res.ok, status: res.status, ms, json, text: stream ? config.redact(text) : config.redact(text).slice(0, 600) }
    } catch (err) {
      return { ok: false, status: 0, ms: Math.round(performance.now() - t0), error: config.redact(err.name === 'AbortError' ? 'timeout' : err.message) }
    } finally {
      clearTimeout(timer)
    }
  }
}

async function readStream(res) {
  if (!res.body) return ''
  const decoder = new TextDecoder()
  let out = ''
  for await (const chunk of res.body) out += decoder.decode(chunk, { stream: true })
  return out
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_planet',
      description: 'Get NASA Exoplanet Archive measurements for one planet by name.',
      parameters: {
        type: 'object',
        properties: { id_or_name: { type: 'string', description: 'Planet name, e.g. "TRAPPIST-1 e"' } },
        required: ['id_or_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_planets',
      description: 'Search confirmed exoplanets by measured ranges.',
      parameters: {
        type: 'object',
        properties: {
          radius_max_earth: { type: 'number' },
          eq_temp_min_k: { type: 'number' },
          eq_temp_max_k: { type: 'number' },
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        },
      },
    },
  },
]

const SYSTEM = 'You are an astronomy assistant. Use the provided tools to get planet data. Never invent measurements.'
const chat = (model, messages, extra = {}) =>
  call('/chat/completions', { method: 'POST', body: { model, messages, temperature: 0.2, max_tokens: 400, ...extra } })

const msg0 = (r) => r.json?.choices?.[0]?.message ?? {}
const finish = (r) => r.json?.choices?.[0]?.finish_reason ?? null
// HTTP 200 with {"error": …} and no choices: a provider-side failure.
const providerError = (r) => (r.ok && !r.json?.choices?.length ? config.redact(JSON.stringify(r.json?.error ?? r.text ?? '')).slice(0, 160) : undefined)
const toolCalls = (r) => msg0(r).tool_calls ?? []
const argsValid = (tc, required = []) => {
  try {
    const a = JSON.parse(tc.function?.arguments ?? '')
    return required.every((k) => k in a)
  } catch {
    return false
  }
}
const hasThink = (r) => /<think>/i.test(msg0(r).content ?? '')
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? { median: s[Math.floor(s.length / 2)], max: s.at(-1) } : null
}

async function probeModel(model) {
  const r = { model }
  const log = (k, v) => {
    r[k] = v
    console.log(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
  }
  console.log(`\n▶ ${model}`)

  const basic = await chat(model, [{ role: 'user', content: 'Reply with the single word OK.' }], { max_tokens: 200 })
  log('basic', { status: basic.status, ms: basic.ms, finish: finish(basic), thinkTags: hasThink(basic), usage: basic.json?.usage ?? null, error: basic.ok ? providerError(basic) : basic.text || basic.error })
  if (!basic.ok) return r

  const noThink = await chat(model, [{ role: 'system', content: `${SYSTEM} /no_think` }, { role: 'user', content: 'Reply with the single word OK.' }], { max_tokens: 200 })
  log('noThinkSwitch', { status: noThink.status, thinkTags: hasThink(noThink), contentStart: (msg0(noThink).content ?? '').slice(0, 40) })

  // Native tool calling with tool_choice unset (auto), repeated for reliability.
  const auto = []
  for (let i = 0; i < RUNS; i++) {
    const res = await chat(model, [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'What is the radius of TRAPPIST-1 e?' }], { tools: TOOLS })
    const tcs = toolCalls(res)
    auto.push({ status: res.status, ms: res.ms, finish: finish(res), providerError: providerError(res), called: tcs.map((t) => t.function?.name), valid: tcs.length > 0 && tcs.every((t) => argsValid(t, t.function?.name === 'get_planet' ? ['id_or_name'] : [])), textToolCall: /tool_call|"name"\s*:\s*"get_planet"/.test(msg0(res).content ?? '') && tcs.length === 0 })
  }
  log('toolsAuto', {
    runs: RUNS,
    nativeToolCalls: auto.filter((a) => a.called.length > 0).length,
    correctTool: auto.filter((a) => a.called.includes('get_planet')).length,
    validArgs: auto.filter((a) => a.valid).length,
    toolCallAsTextInstead: auto.filter((a) => a.textToolCall).length,
    errors: auto.filter((a) => a.status !== 200).map((a) => a.status),
    providerErrors: auto.filter((a) => a.providerError).length,
    finishReasons: [...new Set(auto.map((a) => a.finish))],
    latencyMs: stats(auto.map((a) => a.ms)),
  })

  const forced = await chat(model, [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'Find small temperate planets.' }], { tools: TOOLS, tool_choice: { type: 'function', function: { name: 'search_planets' } } })
  log('toolChoiceForced', { status: forced.status, called: toolCalls(forced).map((t) => t.function?.name), error: forced.ok ? undefined : forced.text })

  const required = await chat(model, [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'Hello!' }], { tools: TOOLS, tool_choice: 'required' })
  log('toolChoiceRequired', { status: required.status, called: toolCalls(required).map((t) => t.function?.name), error: required.ok ? undefined : required.text })

  const none = await chat(model, [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'What is the radius of TRAPPIST-1 e?' }], { tools: TOOLS, tool_choice: 'none' })
  log('toolChoiceNone', { status: none.status, called: toolCalls(none).map((t) => t.function?.name), error: none.ok ? undefined : none.text })

  const parallel = await chat(model, [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'Give me the radius of TRAPPIST-1 e and of Kepler-452 b.' }], { tools: TOOLS })
  log('parallelCalls', { status: parallel.status, count: toolCalls(parallel).length, names: toolCalls(parallel).map((t) => t.function?.name) })

  // Round trip: return a tool result; the answer must use it, not invent.
  const first = auto.length ? await chat(model, [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'What is the radius of TRAPPIST-1 e?' }], { tools: TOOLS }) : null
  const tc = first && toolCalls(first)[0]
  if (tc) {
    const followUp = await chat(model, [
      { role: 'system', content: `${SYSTEM} Name the source given in the tool data for every value. /no_think` },
      { role: 'user', content: 'What is the radius of TRAPPIST-1 e?' },
      msg0(first),
      { role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify({ name: 'TRAPPIST-1 e', radiusEarth: { value: 0.92, err: [0.013, -0.012], unit: 'R⊕', status: 'measured', source: 'Agol et al. 2021' } }) },
    ], { tools: TOOLS })
    const text = msg0(followUp).content ?? ''
    log('roundTrip', { status: followUp.status, ms: followUp.ms, finish: finish(followUp), usesToolValue: /0\.92/.test(text), citesSource: /Agol/.test(text), thinkTags: /<think>/.test(text), answerStart: text.replace(/<think>[\s\S]*?<\/think>/g, '').trim().slice(0, 120) })
  } else {
    log('roundTrip', { skipped: 'no tool call to answer' })
  }

  const json = await chat(model, [{ role: 'system', content: `${SYSTEM} Answer only as JSON: {"answer": string, "basis": "measured"|"unavailable"}. /no_think` }, { role: 'user', content: 'Is TRAPPIST-1 e radius known? Assume it is 0.92 Earth radii, measured.' }], { response_format: { type: 'json_object' } })
  let jsonOk
  try {
    const c = (msg0(json).content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    jsonOk = 'answer' in JSON.parse(c)
  } catch {
    jsonOk = false
  }
  log('jsonMode', { status: json.status, parsable: jsonOk, error: json.ok ? undefined : json.text })

  const stream = await call('/chat/completions', {
    method: 'POST',
    stream: true,
    body: { model, stream: true, temperature: 0.2, max_tokens: 400, tools: TOOLS, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'What is the radius of TRAPPIST-1 e?' }] },
  })
  const deltas = (stream.text ?? '').split('\n').filter((l) => l.startsWith('data: ') && !l.includes('[DONE]'))
  const streamedTool = deltas.some((l) => l.includes('"tool_calls"'))
  const streamFinish = deltas.map((l) => /"finish_reason"\s*:\s*"([a-z_]+)"/.exec(l)?.[1]).filter(Boolean).at(-1) ?? null
  log('streamingWithTools', { status: stream.status, events: deltas.length, toolCallDeltas: streamedTool, finish: streamFinish, error: stream.ok ? undefined : (stream.text || stream.error)?.slice(0, 200) })
  return r
}

function safeView(obj) {
  if (obj == null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(safeView)
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, SENSITIVE.test(k) ? '[hidden]' : safeView(v)]))
}

const report = { at: new Date().toISOString(), baseUrl: config.baseUrl, runsPerToolTest: RUNS }

console.log('▶ Plan (/v1/plan)')
const plan = await call('/plan')
report.plan = { status: plan.status, body: plan.ok ? safeView(plan.json) : plan.text || plan.error }
console.log(`  ${JSON.stringify(report.plan)}`)

// /v1/models was retired by Featherless (404 "Gone", found in Phase 0), so
// availability is shown by the basic chat call per model instead.
console.log('\n▶ Model availability (/v1/models)')
const models = await call('/models', { timeoutMs: 60000 })
const list = models.json?.data ?? []
report.models = { status: models.status, retired: models.status === 404, listed: MODELS.filter((id) => list.some((x) => x.id === id)) }
console.log(`  status ${models.status}${models.status === 404 ? ' (endpoint retired; availability is checked per model below)' : `, ${list.length} models listed`}`)

report.results = []
for (const id of MODELS) report.results.push(await probeModel(id))

const out = path.join(tmpdir(), `celestria-featherless-probe-${Date.now()}.json`)
writeFileSync(out, JSON.stringify(report, null, 2))
console.log(`\nReport written to ${out}`)
