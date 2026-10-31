// Quality tier for the homepage Earth scene — owner: LEAD. Pure.
//
// 'high': ordinary laptops and desktops. 'low': phones, small screens, weak
// or data-saving devices — and any device whose frame rate drops at run time.

export const TIERS = {
  high: {
    dpr: [1, 1.75],
    segments: 128,
    textures: { day: 'earth-day-4096.jpg', night: 'earth-night-2048.jpg', clouds: 'earth-clouds-2048.jpg' },
    scattering: true, //   ray-marched atmosphere
    cloudShadows: true,
    stars: 5000,
  },
  low: {
    dpr: [1, 1.5],
    segments: 72,
    textures: { day: 'earth-day-2048.jpg', night: 'earth-night-1024.jpg', clouds: 'earth-clouds-1024.jpg' },
    scattering: false, //  fresnel glow instead
    cloudShadows: false,
    stars: 2500,
  },
}

/** Textures loaded first (≈ 330 KB) so the globe appears quickly. */
export const PREVIEW_TEXTURES = { day: 'earth-day-512.jpg', night: 'earth-night-1024.jpg', clouds: 'earth-clouds-1024.jpg' }
export const TEXTURE_BASE = '/textures/earth/'

/**
 * @param {{ width: number, cores?: number, memoryGB?: number, saveData?: boolean }} env
 * @returns {'high'|'low'}
 */
export function chooseTier({ width, cores, memoryGB, saveData }) {
  if (saveData) return 'low'
  if (width < 768) return 'low'
  if (cores != null && cores <= 4) return 'low'
  if (memoryGB != null && memoryGB <= 4) return 'low'
  return 'high'
}

/** Read the environment in the browser (null-safe for tests/SSR). */
export function detectTier() {
  if (typeof window === 'undefined') return 'low'
  const nav = window.navigator ?? {}
  return chooseTier({
    width: window.innerWidth,
    cores: nav.hardwareConcurrency,
    memoryGB: nav.deviceMemory,
    saveData: nav.connection?.saveData === true,
  })
}
