// Live progress for a pending question — owner: AI (LEAD in M5 Phase 3).
// Shows only stages the server reported (see progress.js) plus a real
// elapsed-time clock. No percentages and no predicted durations.

import { Check, CircleX, LoaderCircle, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { progressSteps } from './progress.js'

const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function Elapsed({ since }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="ai-elapsed num">{clock(now - since)}</span>
}

const ICON = {
  done: <Check size={13} aria-hidden="true" />,
  failed: <CircleX size={13} aria-hidden="true" />,
  stopped: <Square size={10} aria-hidden="true" />,
  active: <LoaderCircle size={13} className="ai-spin" aria-hidden="true" />,
}
const STATE_TEXT = { done: 'completed', failed: 'failed', stopped: 'stopped', active: 'in progress' }

/**
 * @param {{ events: object[], status: 'pending'|'done'|'error', outcome?: string, startedAt: number, finishedAt?: number, onCancel?: () => void, compact?: boolean }} props
 */
export default function ProgressLog({ events, status, outcome, startedAt, finishedAt, onCancel, compact = false }) {
  const steps = progressSteps(events, status, outcome)
  const pending = status === 'pending'
  return (
    <div className={`ai-progress${compact ? ' ai-progress--compact' : ''}`}>
      <div className="ai-progress__head">
        <span>{pending ? 'Working' : 'Steps'}</span>
        {pending ? <Elapsed since={startedAt} /> : finishedAt && <span className="ai-elapsed num">{clock(finishedAt - startedAt)}</span>}
        {pending && onCancel && (
          <button type="button" className="ai-cancel" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <ol className="ai-steps" aria-live={pending ? 'polite' : undefined}>
        <li className={`ai-step ai-step--${pending && !steps.length ? 'active' : 'done'}`}>
          {pending && !steps.length ? ICON.active : ICON.done}
          <span className="ai-step__label">{pending && !steps.length ? 'Sending question to the server' : 'Question received by the server'}</span>
          <span className="sr-only">{pending && !steps.length ? 'in progress' : 'completed'}</span>
        </li>
        {steps.map((s) => (
          <li key={s.key} className={`ai-step ai-step--${s.state}`}>
            {ICON[s.state]}
            <span className="ai-step__label">{s.label}</span>
            {s.detail && <span className="ai-step__detail">{s.detail}</span>}
            <span className="sr-only">{STATE_TEXT[s.state]}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
