// Test doubles for the AI orchestrator — owner: AI (LEAD in M5 Phase 2).
// A scripted Featherless client and a config with test-sized limits. No
// network, no API key.

import { ProviderError } from '../featherless.js'
import { loadAiConfig } from '../config.js'
import { FIXTURE_PLANETS } from './planets.js'
import { createToolContext } from '../tools/index.js'

export const PRIMARY = 'Qwen/Qwen3-32B'
export const FALLBACK = 'Qwen/Qwen3-14B'

const DEFAULT_LIMITS = loadAiConfig({}).limits

/** Config with any limits overridden (bypasses the .env bounds for fast tests). */
export function testConfig(limits = {}) {
  return {
    configured: true,
    model: PRIMARY,
    fallbackModel: FALLBACK,
    limits: { ...DEFAULT_LIMITS, AI_REQUEST_TIMEOUT_MS: 5000, AI_CALL_TIMEOUT_MS: 2000, AI_QUEUE_TIMEOUT_MS: 2000, ...limits },
    redact: (t) => t,
  }
}

export const fixtureContext = () => ({ version: 'test-1', ctx: createToolContext(FIXTURE_PLANETS, { now: () => new Date('2026-10-31T00:00:00Z') }) })

/** Model replies. */
export const reply = (content, { cost = 0.0003, finish = 'stop' } = {}) => ({ model: 'x', message: { content }, finishReason: finish, usage: { promptTokens: 100, completionTokens: 50, costUsd: cost } })
export const json = (answer, opts) => reply(JSON.stringify(answer), opts)
export const toolCalls = (...calls) => ({
  model: 'x',
  message: { content: '', tool_calls: calls.map(([name, args], i) => ({ id: `t${i}`, type: 'function', function: { name, arguments: JSON.stringify(args) } })) },
  finishReason: 'tool_calls',
  usage: { promptTokens: 100, completionTokens: 20, costUsd: 0.0002 },
})
export const fail = (code, retryable = true) => () => {
  throw new ProviderError(code, `simulated ${code}`, { retryable })
}

/**
 * Scripted client: each entry is a reply object or a function (req) → reply
 * (may throw or return a promise). Records every request.
 */
export function scriptedClient(script) {
  const requests = []
  let inFlight = 0
  let maxInFlight = 0
  return {
    requests,
    get maxInFlight() {
      return maxInFlight
    },
    async chat(req) {
      requests.push({ ...req, messages: structuredClone(req.messages) }) // snapshot: the orchestrator keeps appending
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      try {
        const step = script.length ? script.shift() : json(ANSWER_TESTA_B)
        return typeof step === 'function' ? await step(req) : step
      } finally {
        inFlight--
      }
    },
  }
}

export const ANSWER_TESTA_B = {
  type: 'answer',
  sections: [
    {
      title: 'Size',
      claims: [
        { text: 'Testa b has a radius of 1.10 +0.05 −0.03 R⊕ (Doe et al. 2020).', basis: 'measured', refs: ['testa-b'] },
        { text: 'It was discovered in 2020 by TESS.', basis: 'catalog' },
      ],
    },
  ],
  planets: ['testa-b'],
}

export const BAD_ANSWER = {
  type: 'answer',
  sections: [{ title: 'Climate', claims: [{ text: 'Testa b has a surface temperature of 2500 K.', basis: 'measured', refs: ['testa-b'] }] }],
}

export const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new ProviderError(signal.reason?.name === 'TimeoutError' ? 'timeout' : 'aborted', 'aborted', { retryable: false }))
    })
  })
