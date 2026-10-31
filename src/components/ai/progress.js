// Progress steps from server events — owner: AI (LEAD in M5 Phase 3).
//
// Honesty rules: a step exists only because the server reported it; a step
// is "done" only when a later event (or the final result) proves it
// finished; the last step stays "active" until something else arrives. No
// percentages, no estimated times.

export const ISSUE_LABELS = {
  number: 'a number not in the NASA data',
  unit: 'an unsupported unit conversion',
  uncertainty: 'an uncertainty that did not match',
  provenance: 'a wrong provenance label',
  'minimum-mass': 'a minimum mass not described as one',
  limit: 'a limit not described as one',
  assumed: 'an assumed value not described as one',
  unavailable: 'an unavailable value described wrongly',
  unsupported: 'a statement without supporting data',
  composition: 'an unsupported composition claim',
  classification: 'a size class presented as data',
  'habitable-zone': 'an unsupported habitable-zone claim',
  habitability: 'an unsupported habitability claim',
  life: 'an unsupported statement about life',
  citation: 'a reference not among the NASA sources',
  link: 'a link not from CELESTRIA',
  date: 'a date the orbit tools did not produce',
  'planet-ref': 'a planet that was not looked up',
  reference: 'general science without a reference',
  ranking: 'a ranking that did not match the data',
  interpretation: 'an interpretation presented as data',
  title: 'a heading that contained a value',
  imputed: 'an imputed placeholder value',
  format: 'a reply in the wrong format',
  schema: 'a reply in the wrong format',
  clarification: 'an invalid clarification',
}

const issueText = (codes = []) => [...new Set(codes.map((c) => ISSUE_LABELS[c] ?? 'an unverifiable statement'))].join('; ')
const modelName = (m) => String(m ?? '').split('/').pop()

function describe(e) {
  switch (e.stage) {
    case 'queued':
      return { label: 'Waiting for the astronomer', detail: `Another question is being answered · position ${e.position} in line` }
    case 'admitted':
      return { label: 'Question accepted' }
    case 'cached':
      return { label: 'Answer found in recent results', detail: 'Validated earlier for the same question' }
    case 'retrieved':
      return e.tools?.length
        ? { label: 'NASA catalogue consulted', detail: e.tools.map((t) => t.label).join(' · ') }
        : { label: 'No named planets or systems found in the question' }
    case 'model':
      return {
        label: e.purpose === 'repair' ? 'Model revising its answer' : e.purpose === 'final' ? 'Model writing its final answer' : 'Model drafting an answer',
        detail: modelName(e.model),
      }
    case 'tools':
      return { label: 'Model looked up more data', detail: e.tools.map((t) => t.label).join(' · ') }
    case 'fallback':
      return { label: 'Switched to the backup model', detail: `${modelName(e.from)} did not respond (${e.reason}); using ${modelName(e.to)}, checked the same way` }
    case 'validating':
      return { label: 'Checking every claim against NASA data' }
    case 'repair':
      return { label: 'Check failed · correction requested', detail: `Found ${issueText(e.issues)} · attempt ${e.attempt} of ${e.of}` }
    default:
      return null
  }
}

/**
 * @param {{ stage: string }[]} events  in arrival order
 * @param {'pending'|'done'|'error'} status  turn status
 * @param {string} [outcome]  result status once done (e.g. 'unverified')
 * @returns {{ key: string, label: string, detail?: string, state: 'done'|'active'|'failed'|'stopped' }[]}
 */
export function progressSteps(events, status, outcome) {
  const steps = []
  events.forEach((e, i) => {
    const d = describe(e)
    if (!d) return
    const last = i === events.length - 1
    let state = last ? (status === 'pending' ? 'active' : status === 'error' ? 'stopped' : 'done') : 'done'
    // A validation followed by a repair request failed.
    if (e.stage === 'validating' && events[i + 1]?.stage === 'repair') state = 'failed'
    // The final check of an answer that was withheld also failed.
    if (e.stage === 'validating' && last && outcome === 'unverified') state = 'failed'
    steps.push({ key: `${e.stage}-${i}`, ...d, state })
  })
  return steps
}
