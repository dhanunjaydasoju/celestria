// CONTRACT — owner: LEAD. Props of the public 3D components in
// src/three/viewports/. Pages embed 3D only through these.
//
// Rules for every viewport:
// - Owns its own <Canvas>, <Suspense> and error fallback.
// - Fills its parent box; the parent decides width and height.
// - Reads only its props (never the store), so it can be tested in /lab.
// - Draws its own "Artistic impression" and "Not to scale" labels.

/** @typedef {import('./planet.js').Planet} Planet */

/**
 * Landing-page background. No props; uses built-in showcase parameters.
 * @typedef {{}} HeroSceneProps
 */

/**
 * A single procedural planet. Priority: CORE.
 * @typedef {Object} PlanetViewportProps
 * @property {Planet} planet
 * @property {'hero'|'card'} [size='hero']   'card' uses lower geometry detail
 * @property {boolean} [autoRotate=true]
 * @property {boolean} [interactive=true]     orbit controls on/off
 */

/**
 * One planetary system: host star + its planets. Priority: CORE.
 * @typedef {Object} SystemViewportProps
 * @property {string} host
 * @property {Planet[]} planets              all planets of `host`
 * @property {string|null} [selectedId]
 * @property {(id: string|null) => void} [onSelectPlanet]
 * @property {boolean} [paused=false]
 * @property {number} [timeScale=1]          multiplier on the default time compression
 * @property {number} [resetToken=0]         increment to fly back to the overview
 * @property {boolean} [reducedMotion=false] cut instead of animating camera moves
 */

/**
 * Size comparison on a shared baseline. Priority: SECONDARY.
 * @typedef {Object} SizeCompareViewportProps
 * @property {Planet[]} planets              up to 4
 * @property {boolean} [includeEarth=true]
 * @property {boolean} [includeSun=false]
 * @property {'visibility'|'true'} [mode='visibility']
 */

/**
 * All host stars as one point cloud. Priority: STRETCH.
 * @typedef {Object} StarMapViewportProps
 * @property {{ name: string, raDeg: number, decDeg: number, distancePc: number, teffK: number|null }[]} hosts
 * @property {(host: string) => void} onSelectHost
 */

/**
 * Educational travel animation. Priority: STRETCH.
 * @typedef {Object} JourneyViewportProps
 * @property {Planet} planet
 * @property {number} speedKmS
 */

export {}
