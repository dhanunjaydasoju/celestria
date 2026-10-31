// Habitable-zone boundaries (Kopparapu et al. 2014) — owner: AI (implemented
// by LEAD in M5 Phase B; pending Teammate 4 science review).
//
// Kopparapu, R. K. et al. 2014, ApJL 787, L29, "Habitable Zones around
// Main-sequence Stars: Dependence on Planetary Mass" (arXiv:1404.5292).
// Coefficients verified against the authors' calculator (hzcalc.py,
// R. Kopparapu 2014; Python port J. Armstrong 2014):
//
//   S_eff = S_eff☉ + a·T + b·T² + c·T³ + d·T⁴,   T = Teff − 5780 K
//   d     = sqrt( (L★/L☉) / S_eff )  AU
//
// valid for 2,600 K ≤ Teff ≤ 7,200 K. S_eff is the stellar flux at the
// boundary relative to Earth's (S⊕). Limits for a 1 M⊕ planet:
//   optimistic   inner = Recent Venus,        outer = Early Mars
//   conservative inner = Runaway Greenhouse,  outer = Maximum Greenhouse
// A habitable-zone boundary is a climate-model estimate for an Earth-like
// planet with an H₂O/CO₂/N₂ atmosphere. It is NOT a property of any planet
// and placement inside it is not evidence of habitability.

export const REFERENCE = {
  label: 'Kopparapu et al. 2014',
  title: 'Habitable Zones around Main-sequence Stars: Dependence on Planetary Mass',
  url: 'https://arxiv.org/abs/1404.5292',
}

export const TEFF_MIN_K = 2600
export const TEFF_MAX_K = 7200
export const TEFF_SUN_K = 5780

/** [S_eff☉, a, b, c, d] per limit (Kopparapu et al. 2014, 1 M⊕ unless noted). */
export const COEFFICIENTS = Object.freeze({
  recentVenus: [1.776, 2.136e-4, 2.533e-8, -1.332e-11, -3.097e-15],
  runawayGreenhouse: [1.107, 1.332e-4, 1.58e-8, -8.308e-12, -1.931e-15],
  maximumGreenhouse: [0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16],
  earlyMars: [0.32, 5.547e-5, 1.526e-9, -2.874e-12, -5.011e-16],
  runawayGreenhouse5ME: [1.188, 1.433e-4, 1.707e-8, -8.968e-12, -2.084e-15],
  runawayGreenhouse01ME: [0.99, 1.209e-4, 1.404e-8, -7.418e-12, -1.713e-15],
})

export const LIMIT_LABELS = {
  recentVenus: 'Recent Venus (optimistic inner edge)',
  runawayGreenhouse: 'Runaway greenhouse (conservative inner edge)',
  maximumGreenhouse: 'Maximum greenhouse (conservative outer edge)',
  earlyMars: 'Early Mars (optimistic outer edge)',
}

/** True when the model covers this stellar temperature. */
export const teffSupported = (teffK) => Number.isFinite(teffK) && teffK >= TEFF_MIN_K && teffK <= TEFF_MAX_K

/**
 * Boundary flux S_eff (S⊕) for one limit, or null outside 2,600–7,200 K.
 * @param {keyof COEFFICIENTS} limit
 * @param {number} teffK
 */
export function seff(limit, teffK) {
  if (!teffSupported(teffK)) return null
  const [s0, a, b, c, d] = COEFFICIENTS[limit]
  const t = teffK - TEFF_SUN_K
  return s0 + a * t + b * t ** 2 + c * t ** 3 + d * t ** 4
}

/**
 * Boundary fluxes for a star (inner edges receive more flux than outer).
 * @returns {{ recentVenus: number, runawayGreenhouse: number, maximumGreenhouse: number, earlyMars: number } | null}
 */
export function habitableZoneFlux(teffK) {
  if (!teffSupported(teffK)) return null
  return {
    recentVenus: seff('recentVenus', teffK),
    runawayGreenhouse: seff('runawayGreenhouse', teffK),
    maximumGreenhouse: seff('maximumGreenhouse', teffK),
    earlyMars: seff('earlyMars', teffK),
  }
}

/**
 * Contract (src/contracts/science.js): boundary distances in AU, or null
 * when Teff is unsupported/missing or the luminosity is missing.
 * @param {number|null} teffK
 * @param {number|null} lumLog  log10(L★/L☉)
 * @returns {{ conservative: [number, number], optimistic: [number, number] } | null}
 */
export function habitableZone(teffK, lumLog) {
  const s = habitableZoneFlux(teffK)
  if (!s || !Number.isFinite(lumLog)) return null
  const L = 10 ** lumLog
  const au = (flux) => Math.sqrt(L / flux)
  return {
    conservative: [au(s.runawayGreenhouse), au(s.maximumGreenhouse)],
    optimistic: [au(s.recentVenus), au(s.earlyMars)],
  }
}

/** Placement keys, from most to least irradiated. */
export const PLACEMENTS = ['hot', 'optimistic_inner', 'conservative', 'optimistic_outer', 'cold']

export const PLACEMENT_LABELS = {
  hot: 'More starlight than the optimistic inner edge',
  optimistic_inner: 'Optimistic zone, inner part (between Recent Venus and runaway greenhouse)',
  conservative: 'Within the conservative habitable zone',
  optimistic_outer: 'Optimistic zone, outer part (between maximum greenhouse and Early Mars)',
  cold: 'Less starlight than the optimistic outer edge',
}

/**
 * Where a flux falls relative to the boundaries. Edges belong to the zone
 * they bound (a flux exactly at the runaway-greenhouse limit is conservative).
 * @param {number} fluxEarth  S⊕
 * @param {ReturnType<typeof habitableZoneFlux>} s
 */
export function placementForFlux(fluxEarth, s) {
  if (!s || !Number.isFinite(fluxEarth)) return null
  if (fluxEarth > s.recentVenus) return 'hot'
  if (fluxEarth > s.runawayGreenhouse) return 'optimistic_inner'
  if (fluxEarth >= s.maximumGreenhouse) return 'conservative'
  if (fluxEarth >= s.earlyMars) return 'optimistic_outer'
  return 'cold'
}
