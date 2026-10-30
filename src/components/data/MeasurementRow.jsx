// One labelled scientific value — owner: UI (implemented by LEAD).
// Value with uncertainty and unit, provenance badge, calculation basis and
// source link. Missing values render as "Unavailable", never a number.

import { ExternalLink } from 'lucide-react'
import ProvenanceBadge from './ProvenanceBadge.jsx'
import { provenanceKey } from './provenance.js'
import { sourceLabel } from './sourceLabel.js'
import { formatMeasurement } from './formatMeasurement.js'
import './data.css'

/**
 * @param {Object} props
 * @param {string} props.label
 * @param {import('../../contracts/planet.js').Quantity & { basis?: string }|null} props.q
 * @param {string} [props.unit]
 * @param {string} [props.secondary]      e.g. a unit conversion, shown under the value
 * @param {string} [props.unavailableReason]
 */
export default function MeasurementRow({ label, q, unit, secondary, unavailableReason }) {
  const kind = provenanceKey(q)
  const known = kind !== 'missing'
  const f = known ? formatMeasurement(q.value, q.err) : null

  return (
    <div className={`mrow mrow--${kind}`}>
      <dt className="mrow__label">
        {label}
        {known && q.basis && <span className="mrow__basis">{q.basis}</span>}
        {!known && unavailableReason && <span className="mrow__basis">{unavailableReason}</span>}
      </dt>
      <dd className="mrow__value">
        {known ? (
          <span className="mrow__number">
            {q.limit && <span className="mrow__limit">{q.limit} </span>}
            {f.value}
            {f.plus &&
              (f.symmetric ? (
                <span className="mrow__err">±{f.plus}</span>
              ) : (
                <span className="mrow__err mrow__err--asym">
                  <span>+{f.plus}</span>
                  <span>−{f.minus}</span>
                </span>
              ))}
            {unit && <span className="mrow__unit">{unit}</span>}
          </span>
        ) : (
          <span className="mrow__missing">Unavailable</span>
        )}
        <span className="mrow__meta">
          <ProvenanceBadge kind={kind} />
          {known && q.source?.url && (
            <a href={q.source.url} target="_blank" rel="noreferrer" className="mrow__src" title={`Source: ${sourceLabel(q.source)}`}>
              {sourceLabel(q.source)}
              <ExternalLink size={10} aria-hidden="true" />
            </a>
          )}
        </span>
        {known && secondary && <span className="mrow__secondary">{secondary}</span>}
      </dd>
    </div>
  )
}
