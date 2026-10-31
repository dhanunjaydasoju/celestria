// Formatting helpers for AI answers — owner: AI (LEAD in M5 Phase 3).

export const BASIS_LABELS = {
  measured: 'Measured',
  calculated: 'Calculated',
  estimated: 'Estimated',
  minimum: 'Minimum',
  assumed: 'Assumed',
  catalog: 'Catalogue',
  classification: 'Size class',
  unavailable: 'Unavailable',
  established: 'Reference',
  hypothesis: 'Hypothesis',
}

export const BASIS_TITLES = {
  measured: 'Value reported as a measurement in the cited NASA source',
  calculated: 'Derived from catalogue values by NASA or CELESTRIA',
  estimated: 'Model-based estimate (e.g. a mass–radius relation)',
  minimum: 'M sin i: the true mass is this value or larger',
  assumed: 'Fixed by assumption in the source analysis',
  catalog: 'Catalogue fact: counts, discovery details, search criteria',
  classification: 'CELESTRIA size/temperature class, not a measured composition',
  unavailable: 'Not available in the NASA Exoplanet Archive',
  established: 'General science from a curated reference',
  hypothesis: 'Speculation, not supported by measurements',
}

const MD_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g

/**
 * Split claim text into plain and link segments. Only URLs the server
 * returned with this answer become links; anything else stays plain text.
 * @param {string} text
 * @param {Set<string>} allowed
 * @returns {{ text: string, href?: string, internal?: boolean }[]}
 */
export function claimSegments(text, allowed) {
  const out = []
  let last = 0
  for (const m of text.matchAll(MD_LINK)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    const href = m[2]
    out.push(allowed.has(href) ? { text: m[1], href, internal: href.startsWith('/') } : { text: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

/** Copy for request errors (server codes plus client NETWORK/CANCELLED). */
export function errorCopy(error, now = Date.now()) {
  const wait = error.retryAfterS ? Math.max(0, Math.ceil(error.retryAfterS - (now - error.at) / 1000)) : 0
  switch (error.code) {
    case 'RATE_LIMITED':
      return { title: 'Too many questions in a short time', body: 'Please pause for a moment.', retry: true, waitS: wait }
    case 'DAILY_LIMIT':
      return { title: 'Daily question limit reached', body: 'This device has asked the maximum number of questions for today (UTC).', retry: false, waitS: wait }
    case 'BUSY':
      return { title: 'The astronomer is busy', body: 'Other questions are being answered. Try again in a few seconds.', retry: true, waitS: wait }
    case 'BUDGET_EXHAUSTED':
    case 'SPEND_EXHAUSTED':
      return { title: "Today's AI budget is used up", body: 'The astronomer will be back after midnight UTC. All catalogue data stays available.', retry: false }
    case 'AI_UNAVAILABLE':
      return { title: 'The AI astronomer is unavailable', body: 'It is not configured on this server. All catalogue data stays available.', retry: false }
    case 'TIMEOUT':
      return { title: 'No verified answer in time', body: 'The model took too long. A narrower question usually answers faster.', retry: true }
    case 'PROVIDER_ERROR':
      return { title: 'The AI service is not responding', body: 'Neither the primary nor the backup model answered. Try again shortly.', retry: true }
    case 'CANCELLED':
      return { title: 'Question cancelled', body: null, retry: true }
    case 'BAD_REQUEST':
      return { title: 'That question could not be sent', body: error.message, retry: false }
    case 'NETWORK':
      return { title: 'Connection lost', body: 'Could not reach the CELESTRIA server.', retry: true }
    default:
      return { title: 'Something went wrong', body: 'The question could not be answered.', retry: true }
  }
}
