// Scientific honesty labels drawn over every planet view — owner: LEAD.
// "Artistic impression", what the look is based on, and what is missing.

import { describeBasis } from './format.js'
import './ViewportLabels.css'

/**
 * @param {{ params: ReturnType<typeof import('../planet/visualParams.js').visualParams>, compact?: boolean }} props
 */
export default function ViewportLabels({ params, compact = false }) {
  const { coverage, archetype } = params
  const size = describeBasis(params.sizeBasis)
  const thermal = describeBasis(params.thermalBasis)
  const missingTitle = coverage.missingLabels.length ? `Not measured: ${coverage.missingLabels.join(', ')}` : undefined

  return (
    <div className={`vp-labels${compact ? ' vp-labels--compact' : ''}`}>
      <p className="vp-labels__kicker">Artistic impression</p>
      <p className="vp-labels__type">
        {params.archetypeLabel}
        {params.thermal !== 'unknown' && archetype !== 'unclassified' && <span> · {params.thermalLabel}</span>}
      </p>
      <p className="vp-labels__coverage" title={missingTitle}>
        Based on {coverage.available} of {coverage.total} key measurements
      </p>
      {!compact && (
        <ul className="vp-labels__basis">
          {archetype === 'unclassified' ? (
            <li>Not enough data to classify. Neutral placeholder shown.</li>
          ) : (
            <li>Type from {size}</li>
          )}
          {thermal && <li>Temperature band from {thermal}</li>}
          {params.imputed.includes('starLight') && <li>Star temperature unknown: neutral light used</li>}
        </ul>
      )}
    </div>
  )
}
