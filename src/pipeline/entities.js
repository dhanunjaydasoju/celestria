// HTML entity decoding without a DOM (server and tests) — owner: DATA.
// NASA reflinks contain entities such as "&Ouml;zt&uuml;rk &amp; Erdem".

const MARKS = { uml: '̈', acute: '́', grave: '̀', circ: '̂', tilde: '̃', ring: '̊', cedil: '̧', caron: '̌' }
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  szlig: 'ß', aelig: 'æ', AElig: 'Æ', oslash: 'ø', Oslash: 'Ø', oelig: 'œ', OElig: 'Œ', eth: 'ð', ETH: 'Ð', thorn: 'þ', THORN: 'Þ',
}

/** @param {string} text */
export function decodeHtmlEntities(text) {
  if (!text || !text.includes('&')) return text
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([A-Za-z])(uml|acute|grave|circ|tilde|ring|cedil|caron);/g, (_, l, m) => (l + MARKS[m]).normalize('NFC'))
    .replace(/&([A-Za-z]+);/g, (whole, name) => NAMED[name] ?? whole)
}
