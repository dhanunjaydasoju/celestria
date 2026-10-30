// Readable citation text — owner: UI (implemented by LEAD).
// NASA reflinks can contain HTML entities (e.g. "&Ouml;zt&uuml;rk"); decode
// them for display without altering stored data.

let decoder = null

/** @param {string} text */
export function decodeEntities(text) {
  if (!text || !text.includes('&')) return text
  if (typeof document === 'undefined') return text
  decoder ??= document.createElement('textarea')
  decoder.innerHTML = text
  return decoder.value
}

/** @param {{ label: string }|null|undefined} source */
export function sourceLabel(source) {
  if (!source?.label) return ''
  return source.label === 'Calculated Value' ? 'NASA Exoplanet Archive calculation' : decodeEntities(source.label)
}
