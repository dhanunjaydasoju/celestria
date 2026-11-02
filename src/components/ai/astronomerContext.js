// Page context and suggested questions for the AI astronomer — owner: AI
// (implemented by LEAD in M5 Phase 3). Pure functions over the route and the
// catalogue index; suggestions are questions only (never data), built from
// names and fields the catalogue actually has.

const decode = (s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * @param {{ pathname: string, byId: Record<string, object>, compareIds?: string[], pageFocus?: { host: string, planetId: string|null }|null }} args
 * @returns {{ page: string, planetId?: string, host?: string, compareIds?: string[], label: string|null }}
 */
export function derivePageContext({ pathname, byId, compareIds = [], pageFocus = null }) {
  const planetLabel = (id) => byId[id]?.name ?? null
  let m
  if ((m = /^\/planet\/([^/]+)\/sunfall\/?$/.exec(pathname)) && byId[decode(m[1])]) {
    const id = decode(m[1])
    return { page: 'sunfall', planetId: id, label: `SUNFALL · ${planetLabel(id)}` }
  }
  if ((m = /^\/planet\/([^/]+)\/orbit\/?$/.exec(pathname)) && byId[decode(m[1])]) {
    const id = decode(m[1])
    return { page: 'orbit', planetId: id, label: `Orbital Simulator · ${planetLabel(id)}` }
  }
  if ((m = /^\/(planet|viewport)\/([^/]+)\/?$/.exec(pathname)) && byId[decode(m[2])]) {
    const id = decode(m[2])
    return { page: m[1] === 'planet' ? 'planet' : 'viewport', planetId: id, label: `${m[1] === 'planet' ? 'Profile' : 'Planet Viewport'} · ${planetLabel(id)}` }
  }
  if (/^\/explore(\/|$)/.test(pathname)) {
    const host = pageFocus?.host ?? (pathname.split('/')[2] ? decode(pathname.split('/')[2]) : null)
    const planetId = pageFocus?.planetId && byId[pageFocus.planetId] ? pageFocus.planetId : null
    if (planetId) return { page: 'system', planetId, host, label: `System View · ${planetLabel(planetId)}` }
    if (host) return { page: 'system', host, label: `System View · ${host}` }
    return { page: 'system', label: null }
  }
  if (/^\/compare\/?$/.test(pathname)) {
    const ids = compareIds.filter((id) => byId[id]).slice(0, 4)
    if (ids.length) return { page: 'compare', compareIds: ids, label: `Comparing ${ids.map(planetLabel).join(', ')}` }
  }
  return { page: 'general', label: null }
}

const has = (q) => q != null && q.value != null && q.status !== 'missing' && q.status !== 'imputed'

/**
 * Up to four questions that fit the page. Questions only refer to fields the
 * catalogue has for that planet, so they are answerable from NASA data.
 * @returns {string[]}
 */
export function suggestQuestions(context, { byId, hosts = {} }) {
  const planet = context.planetId ? byId[context.planetId] : null
  if (planet) {
    const n = planet.name
    const siblings = (hosts[planet.host] ?? []).length
    if (context.page === 'sunfall') {
      // About the planet's size and how it is known; the volume count itself
      // comes from CELESTRIA's own calculation, not from the AI's tools.
      return [
        has(planet.radiusEarth) ? `How was the radius of ${n} measured?` : `Why is the radius of ${n} not in the catalogue?`,
        (has(planet.radiusEarth) || has(planet.massEarth)) && `How does ${n} compare with Earth?`,
        `What kind of star does ${n} orbit?`,
        planet.discovery?.method ? `How was ${n} discovered?` : `What has actually been measured about ${n}?`,
      ].filter(Boolean).slice(0, 4)
    }
    if (context.page === 'orbit') {
      return [
        has(planet.eccentricity) ? `How eccentric is the orbit of ${n}?` : `What is known about the orbit of ${n}?`,
        has(planet.periodDays) && `How long is a year on ${n}?`,
        has(planet.transitMidJD) && `When is the next transit of ${n}?`,
        has(planet.semiMajorAxisAU) && `How far is ${n} from its star at its closest and farthest?`,
      ].filter(Boolean).slice(0, 4)
    }
    return [
      `What has actually been measured about ${n}?`,
      (has(planet.radiusEarth) || has(planet.massEarth)) && `How does ${n} compare with Earth?`,
      `Could ${n} support life?`,
      siblings > 1 ? `What else orbits ${planet.host}?` : planet.discovery?.method ? `How was ${n} discovered?` : null,
    ].filter(Boolean).slice(0, 4)
  }
  if (context.page === 'system' && context.host) {
    const count = (hosts[context.host] ?? []).length
    return [
      `Tell me about the ${context.host} system.`,
      count > 1 && `Which planet around ${context.host} is the largest?`,
      `How far away is ${context.host}?`,
      `What kind of star is ${context.host}?`,
    ].filter(Boolean)
  }
  if (context.page === 'compare' && context.compareIds?.length >= 2) {
    const names = context.compareIds.map((id) => byId[id]?.name).filter(Boolean)
    const list = names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(' and ')
    return [`Compare ${list}.`, `Which of these planets has the longest orbit?`, `Which values here are measured and which are estimated?`]
  }
  return [
    'Which Earth-sized planets are closest to us?',
    'What is a hot Jupiter?',
    'How many exoplanets has NASA confirmed?',
    'What does a minimum mass (M sin i) mean?',
  ]
}
