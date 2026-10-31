// Curated astronomy concepts for explain_concept — owner: SCIENCE
// (drafted by LEAD in M5 Phase 1; pending Teammate 4 review).
//
// General, textbook-level explanations only: no planet-specific numbers.
// Thresholds quoted here are conventions, labelled as such. Each entry cites
// a reference the answer may name.

export const REVIEW_STATUS = 'draft — pending science review'

const NASA = (path, label) => ({ label, url: `https://exoplanetarchive.ipac.caltech.edu${path}` })

export const CONCEPTS = {
  transit: {
    title: 'Transit method',
    aliases: ['transits', 'transit photometry', 'transiting'],
    summary: "A planet passing in front of its star blocks a small fraction of the star's light. The dip's depth gives the planet's radius relative to the star; the time between dips gives the orbital period.",
    keyPoints: [
      'Only works when the orbit is seen nearly edge-on, so most planetary systems are never seen to transit.',
      "Depth ≈ (planet radius ÷ star radius)², so the planet radius is only as accurate as the star's radius.",
      'Transits alone do not give mass; that needs radial velocity or transit timing variations.',
    ],
    references: [{ label: 'Winn 2010, "Transits and Occultations"', url: 'https://arxiv.org/abs/1001.2010' }],
  },
  radial_velocity: {
    title: 'Radial velocity method',
    aliases: ['rv', 'doppler method', 'doppler spectroscopy', 'wobble method'],
    summary: "An orbiting planet makes its star move in a small orbit too. The star's light shifts slightly blue and red as it moves towards and away from us, revealing the planet's period and a lower limit on its mass.",
    keyPoints: [
      'Measures M sin i: the true mass is that value or larger, because the orbit tilt (i) is usually unknown.',
      'Combined with a transit (which fixes the tilt), it gives the true mass and therefore density.',
      'Most sensitive to massive planets close to their star.',
    ],
    references: [{ label: 'Lovis & Fischer 2010, "Radial Velocity Techniques for Exoplanets"', url: 'https://ui.adsabs.harvard.edu/abs/2010exop.book...27L/abstract' }],
  },
  minimum_mass: {
    title: 'Minimum mass (M sin i)',
    aliases: ['m sin i', 'msini', 'msin(i)', 'projected mass'],
    summary: 'Radial velocity measures the mass multiplied by the sine of the orbital inclination. Since sin i ≤ 1, the reported value is a minimum: the true mass is that value or larger.',
    keyPoints: ['For randomly oriented orbits the median true mass is about 1.15 times the minimum mass, but for any single planet it can be much larger.', 'A minimum mass cannot be used to calculate density or surface gravity.'],
    references: [NASA('/docs/pscp_calc.html', 'NASA Exoplanet Archive: composite parameter documentation')],
  },
  direct_imaging: {
    title: 'Direct imaging',
    aliases: ['imaging', 'directly imaged'],
    summary: "Blocking the star's glare (with a coronagraph or starshade) to photograph the planet's own light. Works best for young, hot, massive planets far from their star.",
    keyPoints: [
      'Masses usually come from evolutionary models of how a planet of a given age cools, not from a direct measurement.',
      'The planet appears as a point of light; its radius is also typically model-based.',
    ],
    references: [{ label: 'Bowler 2016, "Imaging Extrasolar Giant Planets"', url: 'https://arxiv.org/abs/1605.02731' }],
  },
  microlensing: {
    title: 'Gravitational microlensing',
    aliases: ['lensing'],
    summary: "When a star passes almost exactly in front of a more distant star, its gravity briefly magnifies the background star's light. A planet around the foreground star adds a short extra blip.",
    keyPoints: ['Each event happens once and cannot be repeated.', 'Gives the planet-to-star mass ratio and projected separation; distances are often uncertain.', 'Sensitive to planets far from their stars and in distant parts of the galaxy.'],
    references: [{ label: 'Gaudi 2012, "Microlensing Surveys for Exoplanets"', url: 'https://arxiv.org/abs/1002.0332' }],
  },
  transit_timing_variations: {
    title: 'Transit timing variations (TTV)',
    aliases: ['ttv', 'ttvs', 'timing variations'],
    summary: "In multi-planet systems, planets tug on each other, so transits arrive slightly early or late. Modelling those shifts can reveal unseen planets and measure masses.",
    keyPoints: ['Strongest for planets near orbital resonances.', 'Used to measure the masses of the TRAPPIST-1 planets.'],
    references: [{ label: 'Agol & Fabrycky 2018, "Transit-Timing and Duration Variations"', url: 'https://arxiv.org/abs/1706.09849' }],
  },
  equilibrium_temperature: {
    title: 'Equilibrium temperature',
    aliases: ['eq temp', 'teq', 'equilibrium temp', 'planet temperature'],
    summary: 'The temperature a planet would have if it simply balanced the starlight it absorbs with the heat it radiates. It is a calculated reference value, not a measured surface temperature.',
    keyPoints: [
      'It ignores greenhouse warming and internal heat; real surface temperatures can be very different.',
      'It depends on assumed albedo (reflectivity) and heat redistribution; published values often assume zero albedo.',
      "For example, Earth's equilibrium temperature (about 255 K with its real albedo) is about 33 K colder than its average surface.",
    ],
    references: [NASA('/docs/pscp_calc.html', 'NASA Exoplanet Archive: composite parameter documentation')],
  },
  insolation: {
    title: 'Insolation (stellar flux)',
    aliases: ['instellation', 'stellar flux', 'flux'],
    summary: 'The amount of starlight reaching the planet, expressed relative to what Earth receives from the Sun (S⊕). Earth = 1.',
    keyPoints: ['Depends on the star’s luminosity and the planet’s distance (falls with distance squared).', 'Used with star temperature to define habitable-zone boundaries.'],
    references: [NASA('/docs/pscp_calc.html', 'NASA Exoplanet Archive: composite parameter documentation')],
  },
  habitable_zone: {
    title: 'Habitable zone',
    aliases: ['goldilocks zone', 'hz', 'habitable zone'],
    summary: 'The range of distances from a star where a rocky planet with an Earth-like atmosphere could keep liquid water on its surface. It is a modelled region around the star, not a property of any planet.',
    keyPoints: [
      'Being in the habitable zone does not mean a planet is habitable or has water: that depends on its atmosphere, composition and history, which are mostly unknown.',
      'Boundaries depend on the model; a widely used one is Kopparapu et al. 2013.',
      'Planets around red dwarfs may be tidally locked and exposed to strong flares.',
    ],
    references: [{ label: 'Kopparapu et al. 2013, "Habitable Zones around Main-sequence Stars"', url: 'https://arxiv.org/abs/1301.6674' }],
  },
  eccentricity: {
    title: 'Orbital eccentricity',
    aliases: ['eccentric orbit', 'elliptical orbit'],
    summary: 'How stretched an orbit is: 0 is a circle, values closer to 1 are increasingly elongated ellipses.',
    keyPoints: ["Earth's eccentricity is about 0.017.", 'An eccentricity reported as exactly 0 is often a modelling assumption (orbit fixed as circular), not a measurement.'],
    references: [{ label: "NASA Science: Kepler's laws", url: 'https://science.nasa.gov/resource/orbits-and-keplers-laws/' }],
  },
  semi_major_axis: {
    title: 'Semi-major axis',
    aliases: ['orbital distance', 'orbit size'],
    summary: "Half the longest diameter of an elliptical orbit: the planet's average distance from its star, in astronomical units (1 AU = Earth–Sun distance).",
    keyPoints: ["Linked to the period by Kepler's third law: P² ∝ a³ / M★."],
    references: [{ label: "NASA Science: Kepler's laws", url: 'https://science.nasa.gov/resource/orbits-and-keplers-laws/' }],
  },
  keplers_laws: {
    title: "Kepler's laws",
    aliases: ['kepler laws', "kepler's third law", 'keplers third law'],
    summary: 'Planets move on ellipses with the star at one focus; they sweep equal areas in equal times (moving faster near the star); and the square of the period is proportional to the cube of the semi-major axis.',
    keyPoints: ['The third law lets the orbit size be calculated from the period and the star mass.'],
    references: [{ label: "NASA Science: Kepler's laws", url: 'https://science.nasa.gov/resource/orbits-and-keplers-laws/' }],
  },
  hot_jupiter: {
    title: 'Hot Jupiter',
    aliases: ['hot jupiters', 'hot-jupiter'],
    summary: 'A gas giant orbiting very close to its star, typically with an orbital period under about 10 days. Hot Jupiters were among the first exoplanets found because they are easy to detect.',
    keyPoints: [
      'The 10-day period cut-off is a convention; definitions vary between papers.',
      'They likely formed further out and migrated inwards.',
      'Many have inflated radii larger than Jupiter.',
    ],
    references: [{ label: 'Dawson & Johnson 2018, "Origins of Hot Jupiters"', url: 'https://arxiv.org/abs/1801.06117' }],
  },
  super_earth_sub_neptune: {
    title: 'Super-Earths, sub-Neptunes and the radius gap',
    aliases: ['super earth', 'super-earth', 'super earths', 'sub-neptune', 'sub neptune', 'mini-neptune', 'radius gap', 'fulton gap', 'radius valley'],
    summary: 'Planets between Earth and Neptune in size, which have no equivalent in our Solar System. Kepler data show fewer planets around 1.5–2 Earth radii than just above or below: the "radius gap".',
    keyPoints: [
      'Planets below the gap are often thought to be mostly rocky; those above usually keep a hydrogen-rich envelope. This is a population trend, not a rule for any single planet.',
      'Size labels such as "super-Earth" are conventions, not measured compositions.',
    ],
    references: [{ label: 'Fulton et al. 2017, "The California-Kepler Survey III: A Gap in the Radius Distribution"', url: 'https://arxiv.org/abs/1703.10375' }],
  },
  tidal_locking: {
    title: 'Tidal locking',
    aliases: ['tidally locked', 'synchronous rotation'],
    summary: "A planet close to its star can be slowed by tides until one side always faces the star, like the Moon with Earth.",
    keyPoints: ['Expected for many close-in planets, but rotation is rarely measured, so it is usually an inference.'],
    references: [{ label: 'Barnes 2017, "Tidal Locking of Habitable Exoplanets"', url: 'https://arxiv.org/abs/1708.02981' }],
  },
  bulk_density: {
    title: 'Bulk density',
    aliases: ['density'],
    summary: "Mass divided by volume. Earth's mean density is 5.51 g/cm³; Jupiter's is about 1.33 g/cm³.",
    keyPoints: ['Needs both a true mass and a radius.', 'Different interior compositions can produce the same density, so density alone does not determine what a planet is made of.'],
    references: [NASA('/docs/pscp_calc.html', 'NASA Exoplanet Archive: composite parameter documentation')],
  },
  composite_parameters: {
    title: 'NASA composite parameters',
    aliases: ['pscomppars', 'composite table', 'data source', 'nasa catalogue', 'nasa catalog'],
    summary: 'CELESTRIA uses the NASA Exoplanet Archive Planetary Systems Composite Parameters table: one row per confirmed planet, combining the most complete set of published values, sometimes from different papers.',
    keyPoints: ['Each value keeps its own reference.', 'Some values are calculated by the archive from others (marked calculated).', 'Missing values stay missing: CELESTRIA does not fill them in for scientific answers.'],
    references: [NASA('/docs/pscp_about.html', 'NASA Exoplanet Archive: About the PSCompPars table')],
  },
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[_\s-]+/g, ' ').replace(/[^a-z0-9' ]/g, '').trim()
const INDEX = new Map()
for (const [key, c] of Object.entries(CONCEPTS)) {
  INDEX.set(norm(key), key)
  INDEX.set(norm(c.title), key)
  for (const a of c.aliases) INDEX.set(norm(a), key)
}

/** @returns {string|null} concept key */
export function findConcept(query) {
  return INDEX.get(norm(query)) ?? null
}

const HABITABILITY_WORDS = /\b(habitab\w*|life|alive|liv(e|ing) on|inhabit\w*|goldilocks)\b/i

/**
 * Concepts named in free text (for pre-retrieval). Habitability or life
 * questions always pull in the habitable-zone reference so its caveats can
 * be stated with a source.
 * @returns {string[]} concept keys, at most `max`
 */
export function findConceptsIn(text, max = 2) {
  const t = ` ${norm(text)} `
  const found = []
  if (HABITABILITY_WORDS.test(String(text ?? ''))) found.push('habitable_zone')
  const phrases = [...INDEX.keys()].filter((k) => k.length >= 4).sort((a, b) => b.length - a.length)
  for (const phrase of phrases) {
    if (t.includes(` ${phrase} `)) {
      const key = INDEX.get(phrase)
      if (!found.includes(key)) found.push(key)
    }
  }
  return found.slice(0, max)
}
