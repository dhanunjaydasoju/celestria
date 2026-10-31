// Planet habitability indicators — owner: UI/AI (implemented by LEAD in M5
// Phase B). Renders assessHabitability(planet): a qualitative tier, the
// zone strip and each indicator with how it was reached. No score.

import { Check, CircleHelp, Info, Minus, X } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { assessHabitability, STATUS_LABELS } from '../../science/habitability.js'
import ProvenanceBadge from '../data/ProvenanceBadge.jsx'
import { provenanceKey } from '../data/provenance.js'
import { withErr } from './hzChart.js'
import ZoneStrip from './ZoneStrip.jsx'
import './Habitability.css'

const ICONS = {
  favorable: <Check size={12} strokeWidth={2.2} aria-hidden="true" />,
  uncertain: <Minus size={12} strokeWidth={2.2} aria-hidden="true" />,
  unfavorable: <X size={12} strokeWidth={2.2} aria-hidden="true" />,
  unknown: <CircleHelp size={12} strokeWidth={2} aria-hidden="true" />,
  context: <Info size={12} strokeWidth={2} aria-hidden="true" />,
}

export function StatusChip({ status }) {
  return (
    <span className={`hab-chip hab-chip--${status}`}>
      {ICONS[status]}
      {STATUS_LABELS[status]}
    </span>
  )
}

function InputLine({ input }) {
  const q = input.quantity
  const known = q?.value != null && q.status !== 'missing' && q.status !== 'imputed'
  return (
    <li className="hab-input">
      <span className="hab-input__label">{input.label}</span>
      <span className="hab-input__value num">{known ? `${withErr(q.value, q.err)}${q.limit ? ` (${q.limit === '<' ? 'upper' : 'lower'} limit)` : ''} ${input.unit}` : 'Unavailable'}</span>
      <ProvenanceBadge kind={known ? provenanceKey(q) : 'missing'} />
      {q?.basis && <span className="hab-input__basis">{q.basis}</span>}
      {q?.source?.url && (
        <a className="hab-input__source" href={q.source.url} target="_blank" rel="noopener noreferrer">
          {q.source.label}
        </a>
      )}
    </li>
  )
}

/** @param {{ planet: import('../../contracts/planet.js').Planet, dashboardHref?: string }} props */
export default function HabitabilityPanel({ planet, dashboardHref = '/habitability' }) {
  const a = useMemo(() => assessHabitability(planet), [planet])
  return (
    <section className="hab" aria-labelledby={`hab-${planet.id}`}>
      <div className="hab-head">
        <h2 id={`hab-${planet.id}`} className="hab-title">
          Habitability indicators
        </h2>
        <Link to={dashboardHref} className="hab-link">
          Catalogue dashboard →
        </Link>
      </div>
      <p className={`hab-tier hab-tier--${a.tier.tone}`}>{a.tier.label}</p>
      <p className="hab-caveat">{a.notes[0]}</p>

      {a.zone.bounds ? <ZoneStrip zone={a.zone} /> : <p className="hab-muted">{a.zone.reason}</p>}

      <ul className="hab-factors">
        {a.factors.map((f) => (
          <li key={f.key} className="hab-factor">
            <details>
              <summary>
                <span className="hab-factor__label">{f.label}</span>
                <StatusChip status={f.status} />
                <span className="hab-factor__text">{f.explanation}</span>
              </summary>
              <div className="hab-factor__how">
                <p className="hab-how__head">How this was assessed</p>
                {f.inputs.length > 0 && (
                  <ul className="hab-inputs">
                    {f.inputs.map((i) => (
                      <InputLine key={i.label} input={i} />
                    ))}
                  </ul>
                )}
                <p className="hab-rule">{f.rule}</p>
                {f.reference && (
                  <a className="hab-ref" href={f.reference.url} target="_blank" rel="noopener noreferrer">
                    {f.reference.label}
                  </a>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
      {a.notes.length > 1 && (
        <ul className="hab-notes">
          {a.notes.slice(1).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
