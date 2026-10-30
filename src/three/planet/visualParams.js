// Planet → rendering parameters — owner: LEAD.
//
// The only place where measurements become visual choices. Returns plain
// numbers and hex strings (no three.js objects) so it is unit-testable and
// cheap to memoize. Anything substituted to keep a planet drawable is listed
// in `imputed`, and coverage counts only real (non-imputed) measurements.

import { isScientific } from '../../contracts/planet.js'
import { planetDisplayRadius } from '../scale.js'
import { starLightRGB } from '../star/starColor.js'
import { ARCHETYPES, ARCHETYPE_LABELS, THERMAL, THERMAL_LABELS, classifySize, classifyThermal } from './archetype.js'

/** Shader branch per archetype; must match uType in shaders/surface.js. */
export const SURFACE_TYPE = { unclassified: 0, rocky: 1, subNeptune: 2, neptune: 3, giant: 4 }

// Muted, observatory-style palettes [low, mid, high] in sRGB. Deliberately no
// oceans, vegetation or clouds: nothing in the catalog tells us a surface has
// them. Colours are artistic; see CLAUDE.md §1.4.
const PALETTES = {
  rocky: {
    scorching: ['#1d1512', '#3b2a22', '#5a4334'],
    hot: ['#4a382c', '#77593f', '#a5835f'],
    warm: ['#463b33', '#6f5f51', '#9a8674'],
    temperate: ['#3a3633', '#655d56', '#948a80'],
    cold: ['#4e5862', '#7d8996', '#d6dee6'],
  },
  subNeptune: {
    scorching: ['#7a6656', '#9b8571', '#c4b19b'],
    hot: ['#857563', '#a5937e', '#cbbda8'],
    warm: ['#7e8d90', '#a1b0b0', '#c9d3d1'],
    temperate: ['#6f8fa2', '#97b2c1', '#c9dbe4'],
    cold: ['#5f86aa', '#87a9c8', '#c0d5e8'],
  },
  neptune: {
    scorching: ['#6e5c50', '#8e7a6b', '#b5a394'],
    hot: ['#71655d', '#93857a', '#b9ada2'],
    warm: ['#557688', '#7c9cad', '#abc5d2'],
    temperate: ['#2b5891', '#4a7fba', '#88b1da'],
    cold: ['#24508c', '#4378b6', '#82acd8'],
  },
  giant: {
    scorching: ['#140e0f', '#2c1b19', '#4a2c22'],
    hot: ['#33251f', '#5e4232', '#8a6950'],
    warm: ['#6d5444', '#9a7a5e', '#cbb391'],
    temperate: ['#9a7653', '#c9a87f', '#ece0c8'],
    cold: ['#a3825f', '#cdb391', '#efe6d4'],
  },
  unclassified: ['#3e4856', '#566273', '#7a8698'],
}

// Thermal glow for very hot worlds (lava on rocky dayside/nightside,
// thermal emission on hot giants). Physically motivated, artistically scaled.
const GLOW = { rocky: '#ff5a1f', giant: '#c2381a', subNeptune: '#d8502a', neptune: '#d8502a' }

const KEY_MEASUREMENTS = [
  ['radiusEarth', 'Radius'],
  ['massEarth', 'Mass'],
  ['eqTempK', 'Equilibrium temperature'],
  ['insolationEarth', 'Insolation'],
  ['star.teff', 'Star temperature'],
]

/**
 * Deterministic 0–1 seed from a planet name: FNV-1a, then MurmurHash3's
 * fmix32 finalizer so names differing only in the last character
 * ("55 Cnc b" / "55 Cnc c") still get well-separated seeds.
 */
export function hashSeed(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Small seeded PRNG (mulberry32) for per-planet variation. */
function rng(seed) {
  let a = Math.floor(seed * 4294967296) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)

/**
 * @param {import('../../contracts/planet.js').Planet} planet
 */
export function measurementCoverage(planet) {
  const available = []
  const missing = []
  for (const [path, label] of KEY_MEASUREMENTS) {
    ;(isScientific(get(planet, path)) ? available : missing).push(label)
  }
  return { available: available.length, total: KEY_MEASUREMENTS.length, availableLabels: available, missingLabels: missing }
}

/**
 * @param {import('../../contracts/planet.js').Planet} planet
 */
export function visualParams(planet) {
  const seed = hashSeed(planet.name ?? planet.id ?? '')
  const rand = rng(seed)
  const { type, sizeBasis } = classifySize(planet)
  const { band, temperatureK, thermalBasis } = classifyThermal(planet)
  const imputed = []

  const paletteBand = band === THERMAL.UNKNOWN ? THERMAL.TEMPERATE : band
  const colors = type === ARCHETYPES.UNCLASSIFIED ? PALETTES.unclassified : PALETTES[type][paletteBand]

  // Glow ramps from 0 at 1000 K to full at 2500 K.
  const glow =
    band === THERMAL.SCORCHING && temperatureK != null ? Math.min(1, Math.max(0.25, (temperatureK - 1000) / 1500)) : 0

  const isGas = type === ARCHETYPES.SUB_NEPTUNE || type === ARCHETYPES.NEPTUNE || type === ARCHETYPES.GIANT
  const surface = {
    type: SURFACE_TYPE[type],
    colors,
    glowColor: GLOW[type] ?? '#ff6a2a',
    glow: type === ARCHETYPES.UNCLASSIFIED ? 0 : glow,
    ice: type === ARCHETYPES.ROCKY && band === THERMAL.COLD ? 0.55 : 0,
    // Gas worlds: latitude bands. Giants get strong, numerous bands; hazy
    // sub-Neptunes almost none.
    bandFreq:
      type === ARCHETYPES.GIANT ? 14 + rand() * 10 : type === ARCHETYPES.NEPTUNE ? 7 + rand() * 5 : 4 + rand() * 3,
    bandContrast: type === ARCHETYPES.GIANT ? 0.85 : type === ARCHETYPES.NEPTUNE ? 0.45 : 0.18,
    turbulence: type === ARCHETYPES.GIANT ? 0.8 + rand() * 0.6 : 0.4 + rand() * 0.4,
    noiseScale: 1.6 + rand() * 1.4,
    // Light wrap: soft terminator for thick atmospheres, crisp for rock.
    wrap: isGas ? 0.22 : type === ARCHETYPES.ROCKY ? 0.04 : 0.1,
    seed,
  }

  // Atmosphere shells only where the archetype implies a thick envelope.
  // Rocky worlds get none: their atmospheres are unknown (CLAUDE.md F6A).
  const atmosphere = isGas
    ? {
        color: band === THERMAL.SCORCHING ? '#e0a27a' : colors[2],
        strength:
          (type === ARCHETYPES.SUB_NEPTUNE ? 0.95 : type === ARCHETYPES.NEPTUNE ? 0.8 : 0.6) *
          (band === THERMAL.SCORCHING ? 0.55 : 1),
        thickness: type === ARCHETYPES.SUB_NEPTUNE ? 0.06 : 0.045,
      }
    : null

  const light = starLightRGB(isScientific(planet.star?.teff) ? planet.star.teff.value : null)
  if (light.imputed) imputed.push('starLight')

  let displayRadius = planetDisplayRadius(isScientific(planet.radiusEarth) ? planet.radiusEarth.value : null)
  let displayRadiusStatus = planet.radiusEarth?.status ?? 'missing'
  if (displayRadius == null) {
    displayRadius = planetDisplayRadius(1)
    displayRadiusStatus = 'imputed'
    imputed.push('displayRadius')
  }

  return {
    archetype: type,
    archetypeLabel: ARCHETYPE_LABELS[type],
    thermal: band,
    thermalLabel: THERMAL_LABELS[band],
    temperatureK,
    sizeBasis,
    thermalBasis,
    seed,
    surface,
    atmosphere,
    light,
    displayRadius: { value: displayRadius, status: displayRadiusStatus },
    coverage: measurementCoverage(planet),
    imputed,
  }
}
