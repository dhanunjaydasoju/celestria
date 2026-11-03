// Primary-model capacity cooldown — owner: AI (implemented by LEAD). Pure;
// one instance per server, shared by every question.
//
// Featherless answers "capacity_exhausted" (HTTP 200 with an error body,
// after ~11 s) when the primary model has no free capacity. Rather than pay
// that wait on every question, the primary model is skipped for a while:
//
//   normal      → use the primary model
//   capacity    → skip it for `durationMs`; questions start on the fallback
//   expired     → one question probes the primary model (others keep using
//                 the fallback while that probe is in flight)
//     probe ok        → back to normal
//     probe capacity  → cooldown restarts
//     probe other     → probe released; the next question probes again
//
// Only "capacity_exhausted" starts a cooldown; other errors never do. The
// state changes are synchronous, so concurrent questions cannot both claim
// the probe.

export const CAPACITY_CODE = 'capacity_exhausted'
export const COOLDOWN_MS = 3 * 60 * 1000

/**
 * @param {{ now?: () => number, durationMs?: number }} [opts]
 */
export function createCapacityCooldown({ now = Date.now, durationMs = COOLDOWN_MS } = {}) {
  let until = 0 //      ms; 0 when no cooldown has happened (or a probe succeeded)
  let probing = false

  return {
    /**
     * Which model this question should start on. A probe must later be
     * settled with succeeded(), capacity() or released().
     * @returns {{ usePrimary: boolean, probe: boolean }}
     */
    choose() {
      if (until === 0) return { usePrimary: true, probe: false }
      if (now() < until || probing) return { usePrimary: false, probe: false }
      probing = true
      return { usePrimary: true, probe: true }
    },
    /** The primary model answered: any cooldown is over. */
    succeeded() {
      until = 0
      probing = false
    },
    /** The primary model reported capacity_exhausted: (re)start the cooldown. */
    capacity() {
      until = now() + durationMs
      probing = false
    },
    /** A probe ended without a verdict (other error, cancelled): let the next question probe. */
    released() {
      probing = false
    },
    /** For logs and tests. */
    state() {
      return { coolingDown: until !== 0 && now() < until, until: until || null, probing }
    },
  }
}
