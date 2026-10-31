import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { AI_LIMIT_SPECS, loadAiConfig } from './config.js'

const FAKE_KEY = 'test-key-0123456789abcdefABCDEF'

describe('AI config', () => {
  it('uses safe defaults and reports when no key is set', () => {
    const c = loadAiConfig({})
    expect(c.configured).toBe(false)
    expect(c.model).toBe('Qwen/Qwen3-32B')
    expect(c.limits.AI_MAX_CONCURRENCY).toBe(1)
    expect(() => c.authHeaders()).toThrow(/not set/)
  })

  it('never exposes the key through JSON, inspection, enumeration or errors', () => {
    const c = loadAiConfig({ FEATHERLESS_API_KEY: FAKE_KEY })
    expect(c.configured).toBe(true)
    expect(JSON.stringify(c)).not.toContain(FAKE_KEY)
    expect(inspect(c, { depth: 5, getters: true })).not.toContain(FAKE_KEY)
    expect(Object.values(c).map(String).join('|')).not.toContain(FAKE_KEY)
    expect(c.authHeaders().Authorization).toBe(`Bearer ${FAKE_KEY}`)
    expect(c.redact(`upstream said: bad key ${FAKE_KEY}!`)).toBe('upstream said: bad key [REDACTED]!')
  })

  it('accepts overrides within bounds and rejects invalid limits', () => {
    const c = loadAiConfig({ AI_MAX_CONCURRENCY: '2', AI_RATE_LIMIT_PER_MINUTE: '5', FEATHERLESS_MODEL: 'Qwen/Qwen3-14B' })
    expect(c.limits.AI_MAX_CONCURRENCY).toBe(2)
    expect(c.limits.AI_RATE_LIMIT_PER_MINUTE).toBe(5)
    expect(c.model).toBe('Qwen/Qwen3-14B')
    expect(() => loadAiConfig({ AI_MAX_CONCURRENCY: '99' })).toThrow(/between 1 and 8/)
    expect(() => loadAiConfig({ AI_MAX_TOOL_ROUNDS: 'lots' })).toThrow(/integer/)
  })

  it('keeps the prompt budget below the Qwen3 context window by default', () => {
    expect(AI_LIMIT_SPECS.AI_PROMPT_TOKEN_BUDGET[0] + AI_LIMIT_SPECS.AI_MAX_OUTPUT_TOKENS[0]).toBeLessThan(32768)
  })
})

describe('browser bundle isolation', () => {
  it('no file under src/ references the Featherless key or server AI config', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const walk = (d) => readdirSync(d).flatMap((f) => (statSync(`${d}/${f}`).isDirectory() ? walk(`${d}/${f}`) : [`${d}/${f}`]))
    const offenders = walk('src').filter((f) => /\.(jsx?|json)$/.test(f) && /FEATHERLESS|server\/ai/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
