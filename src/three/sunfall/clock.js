// SUNFALL playback clock — owner: LEAD (Stage S3). Pure reducers over a
// small state object, so play, pause, replay and reduced motion are tested
// without a renderer. Time only advances while playing.

/**
 * @typedef {{ t: number, total: number, playing: boolean, finished: boolean }} ClockState
 */

/**
 * @param {number} total            seconds of the whole sequence
 * @param {{ reducedMotion?: boolean }} [opts]  reduced motion starts at the end, not playing
 * @returns {ClockState}
 */
export function createClock(total, { reducedMotion = false } = {}) {
  return reducedMotion ? { t: total, total, playing: false, finished: true } : { t: 0, total, playing: true, finished: false }
}

/** Advance by dt seconds (clamped to 0.1 s so a stalled tab does not jump). */
export function tick(state, dt) {
  if (!state.playing || state.finished) return state
  const t = Math.min(state.total, state.t + Math.min(Math.max(dt, 0), 0.1))
  const finished = t >= state.total
  return { ...state, t, finished, playing: !finished }
}

export const pause = (state) => (state.playing ? { ...state, playing: false } : state)

/** Resume; a finished clock stays finished (use replay). */
export const resume = (state) => (state.finished || state.playing ? state : { ...state, playing: true })

export const toggle = (state) => (state.playing ? pause(state) : resume(state))

/** Back to the start and playing; with reduced motion, straight to the end. */
export const replay = (state, { reducedMotion = false } = {}) => createClock(state.total, { reducedMotion })

/** Jump to the result. */
export const finish = (state) => ({ ...state, t: state.total, playing: false, finished: true })
