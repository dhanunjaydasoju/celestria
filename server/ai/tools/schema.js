// Minimal JSON-schema checker for tool arguments — owner: AI (LEAD in M5).
// Supports the subset the tool definitions use: object/properties/required/
// additionalProperties:false, string/number/integer/boolean/array, enum,
// minimum/maximum, minItems/maxItems, maxLength. Returns readable errors the
// model can act on.

export function validateArgs(schema, value, path = 'arguments') {
  const errors = []
  const check = (s, v, p) => {
    if (s.type === 'object') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return errors.push(`${p} must be an object`)
      for (const k of s.required ?? []) if (v[k] == null) errors.push(`${p}.${k} is required`)
      for (const [k, val] of Object.entries(v)) {
        if (val == null) continue
        const sub = s.properties?.[k]
        if (!sub) {
          if (s.additionalProperties === false) errors.push(`${p}.${k} is not a known parameter`)
          continue
        }
        check(sub, val, `${p}.${k}`)
      }
      return
    }
    if (s.type === 'array') {
      if (!Array.isArray(v)) return errors.push(`${p} must be an array`)
      if (s.minItems != null && v.length < s.minItems) errors.push(`${p} needs at least ${s.minItems} items`)
      if (s.maxItems != null && v.length > s.maxItems) errors.push(`${p} allows at most ${s.maxItems} items`)
      v.forEach((item, i) => check(s.items ?? {}, item, `${p}[${i}]`))
      return
    }
    if (s.type === 'string') {
      if (typeof v !== 'string') return errors.push(`${p} must be a string`)
      if (s.maxLength != null && v.length > s.maxLength) errors.push(`${p} is longer than ${s.maxLength} characters`)
    } else if (s.type === 'number' || s.type === 'integer') {
      if (typeof v !== 'number' || !Number.isFinite(v)) return errors.push(`${p} must be a number`)
      if (s.type === 'integer' && !Number.isInteger(v)) errors.push(`${p} must be an integer`)
      if (s.minimum != null && v < s.minimum) errors.push(`${p} must be ≥ ${s.minimum}`)
      if (s.maximum != null && v > s.maximum) errors.push(`${p} must be ≤ ${s.maximum}`)
    } else if (s.type === 'boolean') {
      if (typeof v !== 'boolean') return errors.push(`${p} must be true or false`)
    }
    if (s.enum && !s.enum.includes(v)) errors.push(`${p} must be one of: ${s.enum.join(', ')}`)
  }
  check(schema, value, path)
  return errors
}
