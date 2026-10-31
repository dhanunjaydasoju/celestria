// Renders one validated AI astronomer result — owner: AI (LEAD in M5 Phase 3).
// Input is the server's AskResponse only: sections and claims the validator
// accepted, or a fixed server message. Nothing is reworded or added here.

import { ExternalLink, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { BASIS_LABELS, BASIS_TITLES, claimSegments } from './answerFormat.js'

/** Claim provenance label (data kinds reuse the profile's provenance colours). */
export function BasisLabel({ basis }) {
  return (
    <span className={`ai-basis ai-basis--${basis}`} title={BASIS_TITLES[basis]}>
      {BASIS_LABELS[basis] ?? basis}
    </span>
  )
}

function ClaimText({ text, allowed }) {
  return claimSegments(text, allowed).map((seg, i) =>
    seg.href == null ? (
      <span key={i}>{seg.text}</span>
    ) : seg.internal ? (
      <Link key={i} to={seg.href}>
        {seg.text}
      </Link>
    ) : (
      <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer">
        {seg.text}
      </a>
    ),
  )
}

function PlanetLinks({ links, onNavigate }) {
  if (!links?.length) return null
  return (
    <div className="ai-refs">
      <p className="ai-refs__head">Planets</p>
      <ul className="ai-planets">
        {links.map((l) => (
          <li key={l.id}>
            <Link to={l.profileUrl} onClick={onNavigate}>
              {l.name}
            </Link>
            {l.nasaOverviewUrl && (
              <a href={l.nasaOverviewUrl} target="_blank" rel="noopener noreferrer" className="ai-ext" aria-label={`${l.name} in the NASA Exoplanet Archive (opens in a new tab)`}>
                NASA <ExternalLink size={11} aria-hidden="true" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Sources({ sources }) {
  if (!sources?.length) return null
  return (
    <div className="ai-refs">
      <p className="ai-refs__head">Sources</p>
      <ul className="ai-sources">
        {sources.map((s) => (
          <li key={s.label}>
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.label} <ExternalLink size={11} aria-hidden="true" />
              </a>
            ) : (
              s.label
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * @param {{ result: import('../../contracts/api.js').AskResponse, onChoose?: (option: object) => void, onNavigate?: () => void }} props
 */
export default function AnswerView({ result, onChoose, onNavigate }) {
  const allowed = new Set([...(result.links ?? []).flatMap((l) => [l.profileUrl, l.nasaOverviewUrl]), ...(result.sources ?? []).map((s) => s.url)].filter(Boolean))

  if (result.status === 'clarification') {
    return (
      <div className="ai-answer">
        <p className="ai-message">{result.message}</p>
        <div className="ai-options" role="group" aria-label="Choose a planet">
          {result.options.map((o) => (
            <button key={o.id} type="button" className="ai-option" onClick={() => onChoose?.(o)}>
              {o.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const withheld = result.status === 'unverified'
  return (
    <div className={`ai-answer${withheld ? ' ai-answer--withheld' : ''}`}>
      {result.message && (
        <p className={`ai-message${withheld ? ' ai-message--withheld' : ''}`}>
          {withheld && <ShieldAlert size={15} aria-hidden="true" />}
          {result.message}
        </p>
      )}
      {result.sections?.map((s, si) => (
        <section key={si} className="ai-section">
          {s.title && <h4 className="ai-section__title">{s.title}</h4>}
          <ul className="ai-claims">
            {s.claims.map((c, ci) => (
              <li key={ci} className={`ai-claim ai-claim--${c.basis}`}>
                <p className="ai-claim__text">
                  <ClaimText text={c.text} allowed={allowed} />
                </p>
                <BasisLabel basis={c.basis} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <PlanetLinks links={result.links} onNavigate={onNavigate} />
      <Sources sources={result.sources} />
      {result.status === 'answered' && (
        <p className="ai-verified">
          <ShieldCheck size={13} aria-hidden="true" />
          Every claim checked against the NASA Exoplanet Archive
          {result.fallbackUsed ? ' · answered by the backup model, checked the same way' : ''}
          {result.cached ? ' · from recent results' : ''}
        </p>
      )}
    </div>
  )
}
