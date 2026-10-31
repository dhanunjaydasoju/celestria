// "Ask the Astronomer" drawer — owner: AI (implemented by LEAD in M5 Phase 3).
//
// Right-hand panel on desktop (non-modal: the 3D views stay usable beside
// it), full screen on small screens. It sends the question plus the page
// context (open planet, system or comparison) and shows only what the
// server returns: confirmed progress stages, then a validated answer or a
// fixed server message. Conversation lasts for the browser session.

import { ArrowUp, RotateCcw, Telescope, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { getAstronomerStatus } from '../../services/api.js'
import { useCelestria } from '../../store/useCelestria.js'
import AnswerView from './AnswerView.jsx'
import { errorCopy } from './answerFormat.js'
import { derivePageContext, suggestQuestions } from './astronomerContext.js'
import ProgressLog from './ProgressLog.jsx'
import './Astronomer.css'

const MAX_CHARS = 2000

function Countdown({ error, children }) {
  const [now, setNow] = useState(() => Date.now())
  const copy = errorCopy(error, now)
  useEffect(() => {
    if (!copy.waitS) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [copy.waitS])
  return children(copy)
}

function ErrorView({ turn, onRetry }) {
  return (
    <Countdown error={turn.error}>
      {(copy) => (
        <div className="ai-error" role="alert">
          <p className="ai-error__title">{copy.title}</p>
          {copy.body && <p className="ai-error__body">{copy.body}</p>}
          {copy.retry && (
            <button type="button" className="ai-retry" onClick={onRetry} disabled={copy.waitS > 0}>
              <RotateCcw size={13} aria-hidden="true" />
              {copy.waitS > 0 ? `Try again in ${copy.waitS} s` : 'Try again'}
            </button>
          )}
        </div>
      )}
    </Countdown>
  )
}

function Turn({ turn, index, onChoose, onRetry, onCancel, onNavigate }) {
  return (
    <article className={`ai-turn ai-turn--${turn.status}`} aria-label={`Question ${index + 1}`}>
      <header className="ai-turn__q">
        <span className="ai-turn__n num">{String(index + 1).padStart(2, '0')}</span>
        <div>
          <h3>{turn.question}</h3>
          {turn.contextLabel && <p className="ai-turn__ctx">{turn.contextLabel}</p>}
        </div>
      </header>
      {turn.status === 'pending' && <ProgressLog events={turn.events} status="pending" startedAt={turn.startedAt} onCancel={onCancel} />}
      {turn.status === 'done' && <AnswerView result={turn.result} onChoose={onChoose} onNavigate={onNavigate} />}
      {turn.status === 'error' && <ErrorView turn={turn} onRetry={onRetry} />}
      {turn.status !== 'pending' && turn.events.length > 0 && (
        <details className="ai-trace">
          <summary>How this was answered</summary>
          <ProgressLog events={turn.events} status={turn.status} outcome={turn.result?.status} startedAt={turn.startedAt} finishedAt={turn.finishedAt} compact />
        </details>
      )}
    </article>
  )
}

export default function AstronomerDrawer({ returnFocusRef }) {
  const open = useCelestria((s) => s.astronomerOpen)
  const close = useCelestria((s) => s.closeAstronomer)
  const turns = useCelestria((s) => s.astronomerTurns)
  const sendQuestion = useCelestria((s) => s.sendQuestion)
  const cancelQuestion = useCelestria((s) => s.cancelQuestion)
  const retryQuestion = useCelestria((s) => s.retryQuestion)
  const clearConversation = useCelestria((s) => s.clearConversation)
  const byId = useCelestria((s) => s.byId)
  const hosts = useCelestria((s) => s.hosts)
  const compareIds = useCelestria((s) => s.compareIds)
  const pageFocus = useCelestria((s) => s.pageFocus)
  const { pathname } = useLocation()

  const context = useMemo(() => derivePageContext({ pathname, byId, compareIds, pageFocus }), [pathname, byId, compareIds, pageFocus])
  // Questions already asked in this session are not suggested again.
  const suggestions = useMemo(() => suggestQuestions(context, { byId, hosts }).filter((q) => !turns.some((t) => t.question === q)), [context, byId, hosts, turns])
  const pending = turns.some((t) => t.status === 'pending')

  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState(null)
  const input = useRef(null)
  const log = useRef(null)
  const panel = useRef(null)

  // Is the AI configured? (Checked each time the drawer opens.)
  useEffect(() => {
    if (!open) return
    let live = true
    getAstronomerStatus().then((s) => live && setStatus(s))
    return () => {
      live = false
    }
  }, [open])

  // Focus the composer on open; give focus back to the trigger on close.
  useEffect(() => {
    if (!open) return
    input.current?.focus({ preventScroll: true })
    const back = returnFocusRef?.current
    return () => back?.focus({ preventScroll: true })
  }, [open, returnFocusRef])

  // Escape closes while focus is inside the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape' && panel.current?.contains(document.activeElement)) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // Keep the newest turn in view.
  const lastTurn = turns.at(-1)
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' })
  }, [turns.length, lastTurn?.status, lastTurn?.events.length])

  const unavailable = status && !status.available
  const ask = (q) => {
    if (sendQuestion(q, context)) setDraft('')
  }
  const onSubmit = (e) => {
    e.preventDefault()
    if (!pending && !unavailable) ask(draft)
  }
  // On small screens the drawer covers the page: close it when a link leads elsewhere.
  const onNavigate = () => {
    if (window.matchMedia('(max-width: 760px)').matches) close()
  }

  const placeholder = context.planetId ? `Ask about ${byId[context.planetId]?.name}…` : context.host ? `Ask about ${context.host}…` : 'Ask about any confirmed exoplanet…'

  return (
    <aside
      ref={panel}
      id="astronomer"
      className={`ai-drawer${open ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="ai-title"
      aria-hidden={!open}
      inert={!open}
    >
      <header className="ai-head">
        <div className="ai-head__titles">
          <p className="ai-kicker">
            <Telescope size={13} aria-hidden="true" /> AI Astronomer
          </p>
          <h2 id="ai-title" className="ai-title">
            Ask the Astronomer
          </h2>
        </div>
        <div className="ai-head__actions">
          {turns.length > 0 && (
            <button type="button" className="ai-icon-btn" onClick={clearConversation} aria-label="Clear conversation" title="Clear conversation">
              <Trash2 size={16} strokeWidth={1.6} />
            </button>
          )}
          <button type="button" className="ai-icon-btn" onClick={close} aria-label="Close the astronomer">
            <X size={18} strokeWidth={1.6} />
          </button>
        </div>
      </header>

      <p className="ai-context">
        <span className="ai-context__key">Context</span>
        <span className="ai-context__val">{context.label ?? 'Whole catalogue'}</span>
      </p>

      <div ref={log} className="ai-log">
        {turns.length === 0 && (
          <div className="ai-intro">
            <p>
              Answers come only from the NASA Exoplanet Archive and curated references. Every number is checked against the catalogue
              before it is shown; answers that cannot be verified are withheld.
            </p>
          </div>
        )}
        {turns.map((t, i) => (
          <Turn
            key={t.id}
            turn={t}
            index={i}
            onCancel={cancelQuestion}
            onRetry={() => retryQuestion(t.id)}
            onNavigate={onNavigate}
            onChoose={(o) => sendQuestion(t.question, { ...t.context, planetId: o.id, label: `Clarified · ${o.name}` })}
          />
        ))}
        {!pending && !unavailable && suggestions.length > 0 && (
          <div className="ai-suggest">
            <p className="ai-suggest__head">{turns.length ? 'You could also ask' : 'Suggested questions'}</p>
            <ul>
              {suggestions.map((q) => (
                <li key={q}>
                  <button type="button" onClick={() => ask(q)}>
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {unavailable ? (
        <p className="ai-offline" role="status">
          The AI astronomer is not available on this server. All catalogue data, profiles and simulators work as usual.
        </p>
      ) : (
        <form className="ai-compose" onSubmit={onSubmit}>
          <label htmlFor="ai-input" className="sr-only">
            Your question
          </label>
          <textarea
            id="ai-input"
            ref={input}
            rows={1}
            value={draft}
            maxLength={MAX_CHARS}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) onSubmit(e)
            }}
          />
          {draft.length > MAX_CHARS * 0.8 && <span className="ai-count num">{MAX_CHARS - draft.length}</span>}
          <button type="submit" className="ai-send" disabled={pending || !draft.trim()} aria-label="Ask">
            <ArrowUp size={17} strokeWidth={1.8} />
          </button>
        </form>
      )}
    </aside>
  )
}
