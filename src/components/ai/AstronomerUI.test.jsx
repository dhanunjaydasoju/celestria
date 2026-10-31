import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCelestria } from '../../store/useCelestria.js'

// A plain stand-in store: static rendering cannot observe zustand updates.
vi.mock('../../store/useCelestria.js', () => {
  const noop = () => {}
  const base = { astronomerOpen: false, astronomerTurns: [], byId: {}, hosts: {}, compareIds: [], pageFocus: null, closeAstronomer: noop, sendQuestion: noop, cancelQuestion: noop, retryQuestion: noop, clearConversation: noop }
  let state = { ...base }
  const useCelestria = (selector) => selector(state)
  useCelestria.setState = (patch) => {
    state = { ...base, ...state, ...patch }
  }
  return { useCelestria }
})
import AnswerView from './AnswerView.jsx'
import AstronomerDrawer from './AstronomerDrawer.jsx'

const here = path.dirname(fileURLToPath(import.meta.url))
const render = (el, path = '/') => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>)
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')

const LINK = { id: 'testa-b', name: 'Testa b', profileUrl: '/planet/testa-b', nasaOverviewUrl: 'https://exoplanetarchive.ipac.caltech.edu/overview/Testa%20b' }
const ANSWERED = {
  status: 'answered',
  sections: [
    {
      title: 'Size',
      claims: [
        { text: 'Testa b has a radius of 1.10 +0.05 −0.03 R⊕ ([profile](/planet/testa-b)).', basis: 'measured', refs: ['testa-b'] },
        { text: 'It might have an atmosphere, but this is unknown.', basis: 'hypothesis', refs: [] },
      ],
    },
  ],
  links: [LINK],
  sources: [{ label: 'Doe et al. 2020', url: 'https://ui.adsabs.harvard.edu/abs/2020Doe' }],
  fallbackUsed: false,
  cached: false,
}

describe('AnswerView', () => {
  it('renders validated claims with provenance labels, profile links and NASA sources', () => {
    const html = render(<AnswerView result={ANSWERED} />)
    expect(text(html)).toContain('Testa b has a radius of 1.10 +0.05 −0.03 R⊕')
    expect(html).toContain('ai-basis--measured')
    expect(html).toContain('ai-basis--hypothesis')
    expect(html).toContain('href="/planet/testa-b"')
    expect(html).toContain('href="https://exoplanetarchive.ipac.caltech.edu/overview/Testa%20b"')
    expect(html).toContain('href="https://ui.adsabs.harvard.edu/abs/2020Doe"')
    expect(html).toMatch(/rel="noopener noreferrer"/)
    expect(text(html)).toContain('Every claim checked against the NASA Exoplanet Archive')
  })

  it('shows only the fixed message for a withheld answer, never sections or model text', () => {
    const html = render(<AnswerView result={{ status: 'unverified', message: "I couldn't verify my answer against the NASA data, so it isn't shown.", sections: [], links: [LINK], sources: [] }} />)
    expect(text(html)).toContain("I couldn't verify my answer")
    expect(html).not.toContain('ai-claim')
    expect(html).not.toContain('Every claim checked')
    expect(html).toContain('href="/planet/testa-b"') // the looked-up profile stays reachable
  })

  it('renders clarification options as buttons and nothing else', () => {
    const html = render(<AnswerView result={{ status: 'clarification', message: 'Which planet do you mean?', options: [LINK, { ...LINK, id: 'testa-c', name: 'Testa c' }], sections: [], links: [], sources: [] }} />)
    expect(html.match(/class="ai-option"/g)).toHaveLength(2)
    expect(text(html)).toContain('Which planet do you mean?')
  })

  it('does not turn unknown URLs inside claims into links', () => {
    const result = { ...ANSWERED, sections: [{ title: 'x', claims: [{ text: 'Read [this](https://evil.example).', basis: 'catalog', refs: [] }] }] }
    expect(render(<AnswerView result={result} />)).not.toContain('evil.example')
  })

  it('notes when the backup model answered', () => {
    expect(text(render(<AnswerView result={{ ...ANSWERED, fallbackUsed: true }} />))).toContain('backup model, checked the same way')
  })
})

describe('AstronomerDrawer', () => {
  afterEach(() => useCelestria.setState({ astronomerOpen: false, astronomerTurns: [], byId: {}, hosts: {} }))
  const PLANET = { id: 'testa-b', name: 'Testa b', host: 'Testa', radiusEarth: { value: 1.1, status: 'measured' }, discovery: { method: 'Transit' } }

  it('shows the page context and context-aware suggestions', () => {
    useCelestria.setState({ astronomerOpen: true, byId: { 'testa-b': PLANET }, hosts: { Testa: ['testa-b'] } })
    const html = render(<AstronomerDrawer />, '/planet/testa-b')
    expect(text(html)).toContain('Profile · Testa b')
    expect(text(html)).toContain('What has actually been measured about Testa b?')
    expect(html).toContain('placeholder="Ask about Testa b…"')
    expect(html).toContain('aria-modal="false"') // the 3D views stay usable beside it
  })

  it('renders progress only from server events and disables sending while pending', () => {
    useCelestria.setState({
      astronomerOpen: true,
      astronomerTurns: [{ id: 't1', question: 'How big is Testa b?', status: 'pending', startedAt: Date.now(), context: {}, events: [{ stage: 'admitted' }, { stage: 'model', model: 'Qwen/Qwen3-32B', purpose: 'draft' }] }],
    })
    const html = render(<AstronomerDrawer />)
    expect(text(html)).toContain('Question accepted')
    expect(text(html)).toContain('Model drafting an answer')
    expect(html).toMatch(/ai-step--active/)
    expect(text(html)).not.toContain('Checking every claim') // not reported yet, so not shown
    expect(html).toMatch(/class="ai-send" disabled=""/)
    expect(text(html)).not.toContain('Suggested questions')
  })

  it('renders errors with their recovery action', () => {
    useCelestria.setState({
      astronomerOpen: true,
      astronomerTurns: [{ id: 't1', question: 'q', status: 'error', startedAt: 0, context: {}, events: [], error: { code: 'TIMEOUT', message: 'x', at: Date.now() } }],
    })
    const html = render(<AstronomerDrawer />)
    expect(text(html)).toContain('No verified answer in time')
    expect(text(html)).toContain('Try again')
  })

  it('is hidden and inert while closed', () => {
    const html = render(<AstronomerDrawer />)
    expect(html).toMatch(/aria-hidden="true"/)
    expect(html).toMatch(/inert=""/)
  })
})

describe('responsive layout contract', () => {
  const css = readFileSync(path.join(here, 'Astronomer.css'), 'utf8')
  const block = (selector, scope) => {
    const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)
    return re.exec(scope)?.[1] ?? ''
  }
  const mobile = css.slice(css.indexOf('@media (max-width: 760px)'))

  it('is a right-hand panel below the header on desktop', () => {
    const d = block('.ai-drawer', css)
    expect(d).toMatch(/right:\s*0/)
    expect(d).toMatch(/top:\s*var\(--header-height\)/)
    expect(d).toMatch(/width:\s*min\(460px,\s*100vw\)/)
  })

  it('becomes full screen on small screens with a label-free trigger', () => {
    const d = block('.ai-drawer', mobile)
    expect(d).toMatch(/top:\s*0/)
    expect(d).toMatch(/width:\s*100vw/)
    expect(d).toMatch(/height:\s*100dvh/)
    expect(block('.ai-trigger__label', mobile)).toMatch(/display:\s*none/)
    expect(block('.ai-compose textarea', mobile)).toMatch(/font-size:\s*16px/) // no iOS zoom
  })

  it('respects reduced motion and avoids glassmorphism', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce/)
    expect(css).not.toMatch(/backdrop-filter/)
  })
})
