// AI tool registry: definitions sent to the model and a safe dispatcher —
// owner: AI (implemented by LEAD in M5 Phase 1).
//
// All tools are deterministic and read-only over the canonical NASA
// catalogue. runTool never throws: bad JSON, invalid arguments, unknown tools
// and internal errors become { status: 'error' | 'invalid_arguments' }
// results the model can recover from. Results are size-capped.

import { CONCEPTS, findConcept, REVIEW_STATUS } from '../knowledge/concepts.js'
import { createToolContext } from './catalog.js'
import { computeOrbit, comparePlanets, getPlanet, getSystem } from './planets.js'
import { DISCOVERY_METHODS, PRESETS, RANGE_FIELDS, SPECTRAL_CLASSES, catalogFacts, searchPlanets } from './search.js'
import { validateArgs } from './schema.js'
import { UNITS } from './format.js'

export { createToolContext }

/** Max characters of one serialized tool result (≈ 3k tokens). */
export const MAX_RESULT_CHARS = 12000

const NAME = { type: 'string', maxLength: 120 }

const rangeProps = () => {
  const props = {}
  for (const [key, field] of Object.entries(RANGE_FIELDS)) {
    const unit = UNITS[field] || 'unitless'
    props[`${key}_min`] = { type: 'number', description: `Minimum ${key.replace(/_/g, ' ')} (${unit})` }
    props[`${key}_max`] = { type: 'number', description: `Maximum ${key.replace(/_/g, ' ')} (${unit})` }
  }
  return props
}

const FILTER_PROPS = {
  presets: {
    type: 'array',
    maxItems: 4,
    items: { type: 'string', enum: Object.keys(PRESETS) },
    description: `Named filters (combined with AND): ${Object.entries(PRESETS).map(([k, v]) => `${k} = ${v.describe}`).join('; ')}`,
  },
  ...rangeProps(),
  discovery_year_min: { type: 'integer', minimum: 1980, maximum: 2100 },
  discovery_year_max: { type: 'integer', minimum: 1980, maximum: 2100 },
  discovery_method: { type: 'string', enum: DISCOVERY_METHODS },
  spectral_class: { type: 'string', enum: SPECTRAL_CLASSES, description: 'Host star spectral class letter' },
  host_contains: { type: 'string', maxLength: 60, description: 'Text the host star name must contain, e.g. "Kepler" or "TOI"' },
  require_measured: { type: 'boolean', description: 'Only accept directly measured values for the filtered fields' },
  include_controversial: { type: 'boolean', description: 'Include planets NASA flags as controversial (default false for search)' },
}

const TOOLS = {
  search_planets: {
    description:
      'Find confirmed exoplanets by properties when the user does not name a planet (e.g. "Earth-sized planets near M dwarfs", "closest hot Jupiters"). Returns matching planets with NASA values, profile links and the exact criteria applied.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...FILTER_PROPS,
        sort_by: { type: 'string', enum: [...Object.keys(RANGE_FIELDS), 'discovery_year', 'name'], description: 'Default: distance' },
        order: { type: 'string', enum: ['asc', 'desc'] },
        limit: { type: 'integer', minimum: 1, maximum: 12, description: 'Default 8' },
      },
    },
    run: searchPlanets,
  },
  get_planet: {
    description: 'Get NASA Exoplanet Archive values for one planet, with uncertainty, provenance status, source references, derived values and profile links.',
    parameters: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { ...NAME, description: 'Planet name, e.g. "TRAPPIST-1 e", "Proxima Centauri b", "55 Cancri e"' } } },
    run: getPlanet,
  },
  get_system: {
    description: 'Get a planetary system: the host star, its distance and all its catalogued planets in orbital order.',
    parameters: { type: 'object', additionalProperties: false, required: ['host'], properties: { host: { ...NAME, description: 'Host star or system name, e.g. "TRAPPIST-1", "Kepler-90"' } } },
    run: getSystem,
  },
  compare_planets: {
    description: 'Compare 2–4 planets side by side, with ratios to Earth and to the first planet calculated from NASA values.',
    parameters: { type: 'object', additionalProperties: false, required: ['names'], properties: { names: { type: 'array', minItems: 2, maxItems: 4, items: NAME } } },
    run: comparePlanets,
  },
  compute_orbit: {
    description: "Compute a planet's orbit from catalogue elements: periastron/apoastron distance and speed, or its position at a time when that can be predicted reliably.",
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: NAME,
        at: { type: 'string', maxLength: 40, description: 'now (default), periastron, apoastron, next_transit, or an ISO date such as 2027-01-01' },
      },
    },
    run: computeOrbit,
  },
  catalog_facts: {
    description: 'Counts and descriptive statistics of the NASA catalogue (how many planets, discovery methods, range/median of a property), optionally filtered like search_planets.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        field: { type: 'string', enum: Object.keys(RANGE_FIELDS), description: 'Property to describe; omit for overall counts by discovery method' },
        ...FILTER_PROPS,
      },
    },
    run: catalogFacts,
  },
  explain_concept: {
    description: 'Get a reviewed explanation of a general astronomy concept (e.g. transit method, habitable zone, M sin i, hot Jupiter) with a reference.',
    parameters: { type: 'object', additionalProperties: false, required: ['concept'], properties: { concept: { type: 'string', maxLength: 80 } } },
    run: (_ctx, { concept }) => {
      const key = findConcept(concept)
      if (!key) return { status: 'not_found', query: concept, available: Object.values(CONCEPTS).map((c) => c.title) }
      const c = CONCEPTS[key]
      return { status: 'ok', concept: key, title: c.title, basis: 'established', summary: c.summary, keyPoints: c.keyPoints, references: c.references, review: REVIEW_STATUS }
    },
  },
}

export const TOOL_NAMES = Object.keys(TOOLS)

/** OpenAI-style tool definitions for the chat request. */
export const TOOL_DEFINITIONS = Object.entries(TOOLS).map(([name, t]) => ({
  type: 'function',
  function: { name, description: t.description, parameters: t.parameters },
}))

/** Shrink oversized results by trimming list fields; never cuts mid-value. */
function capResult(result) {
  let json = JSON.stringify(result)
  if (json.length <= MAX_RESULT_CHARS) return result
  const out = structuredClone(result)
  for (const key of ['planets', 'candidates', 'suggestions']) {
    while (Array.isArray(out[key]) && out[key].length > 1 && JSON.stringify(out).length > MAX_RESULT_CHARS) {
      out[key].pop()
      out.truncated = `Result shortened to fit; ${key} list cut to ${out[key].length}.`
      if ('returned' in out) out.returned = out[key].length
    }
  }
  json = JSON.stringify(out)
  return json.length <= MAX_RESULT_CHARS ? out : { status: 'error', error: 'Result too large; narrow the request.' }
}

/**
 * Run a tool call from the model.
 * @param {ReturnType<typeof createToolContext>} ctx
 * @param {string} name
 * @param {string|object} rawArgs  JSON string (as sent by the model) or object
 * @returns {{ name: string, args: object|null, result: object }}
 */
export function runTool(ctx, name, rawArgs) {
  const tool = TOOLS[name]
  if (!tool) return { name, args: null, result: { status: 'error', error: `Unknown tool "${name}". Available: ${TOOL_NAMES.join(', ')}` } }
  let args = rawArgs
  if (typeof rawArgs === 'string') {
    try {
      args = rawArgs.trim() ? JSON.parse(rawArgs) : {}
    } catch {
      return { name, args: null, result: { status: 'invalid_arguments', errors: ['Arguments are not valid JSON'] } }
    }
  }
  args ??= {}
  const errors = validateArgs(tool.parameters, args)
  if (errors.length) return { name, args, result: { status: 'invalid_arguments', errors } }
  try {
    return { name, args, result: capResult(tool.run(ctx, args)) }
  } catch (err) {
    return { name, args, result: { status: 'error', error: `Tool failed: ${err.message}` } }
  }
}
