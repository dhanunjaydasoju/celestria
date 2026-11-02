import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { labPlanets } from '../../three/lab/fixtures.js'
import { sunfallResult } from '../../science/sunfall.js'
import { defaultSunfallId, radiusSummary } from './sunfallPage.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const byName = Object.fromEntries(labPlanets.map((p) => [p.name, p]))
const q = (value, status = 'measured', extra = {}) => ({ value, status, ...extra })
const noRadius = { ...byName['TRAPPIST-1 e'], id: 'no-radius-b', name: 'No-Radius b', radiusEarth: { value: null, status: 'missing' } }

const state = {}
function reset({ status = 'ready', details = {}, detailStatus = {} } = {}) {
  const planets = [...labPlanets, noRadius]
  Object.assign(state, {
    catalogStatus: status,
    planets: status === 'ready' ? planets : [],
    byId: status === 'ready' ? Object.fromEntries(planets.map((p) => [p.id, p])) : {},
    details,
    detailStatus,
    loadDetail: () => {},
    reducedMotion: false,
    astronomerOpen: false,
  })
}
vi.mock('../../store/useCelestria.js', () => ({ useCelestria: (sel) => sel(state) }))
vi.mock('../../three/viewports/SunfallViewport.jsx', () => ({
  default: ({ planet, result, reducedMotion }) => <div data-viewport={planet.id} data-status={result.status} data-still={String(reducedMotion)} />,
}))

const { default: SunfallPage } = await import('../SunfallPage.jsx')
const render = (url) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/planet/:id/sunfall" element={<SunfallPage />} />
      </Routes>
    </MemoryRouter>,
  )
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const trappist = byName['TRAPPIST-1 e']

beforeEach(() => reset())

describe('SunfallPage', () => {
  it('shows a not-found state for an unknown id and never substitutes another planet', () => {
    const html = render('/planet/not-a-planet/sunfall')
    expect(html).toContain('Planet not found')
    expect(html).toContain('not-a-planet')
    expect(html).toContain('href="/sunfall"')
    expect(html).not.toContain('data-viewport')
  })

  it('shows the catalogue loading and failure states', () => {
    reset({ status: 'loading' })
    expect(render(`/planet/${trappist.id}/sunfall`)).toContain('Loading catalog…')
    reset({ status: 'error' })
    expect(render(`/planet/${trappist.id}/sunfall`)).toContain('could not be loaded')
  })

  it('waits for the full record before starting, with the toolbar already usable', () => {
    const html = render(`/planet/${trappist.id}/sunfall`)
    expect(html).toContain(`Loading ${trappist.name}…`)
    expect(html).not.toContain('data-viewport')
    expect(html).toContain('aria-label="Choose a planet for SUNFALL. Current: TRAPPIST-1 e"')
    expect(html).toContain(`href="/planet/${trappist.id}"`) // back to the same planet's profile
  })

  it('runs on the full record once loaded, with radius and provenance in the toolbar', () => {
    reset({ details: { [trappist.id]: trappist }, detailStatus: { [trappist.id]: 'ready' } })
    const html = render(`/planet/${trappist.id}/sunfall`)
    expect(html).toContain(`data-viewport="${trappist.id}"`)
    expect(html).toContain('data-status="value"')
    expect(text(html)).toContain('Radius 0.920 +0.013 −0.012 R⊕')
    expect(html).toContain('prov prov--measured')
    expect(text(html)).toContain('SUNFALL TRAPPIST-1 e')
  })

  it('falls back to the catalogue index when the full record fails, and says so', () => {
    reset({ detailStatus: { [trappist.id]: 'error' } })
    const html = render(`/planet/${trappist.id}/sunfall`)
    expect(html).toContain(`data-viewport="${trappist.id}"`)
    expect(text(html)).toContain('could not be loaded, so the radius uncertainty is not shown')
  })

  it('shows a missing radius as unavailable; the viewport gets the unavailable result', () => {
    reset({ details: { [noRadius.id]: noRadius }, detailStatus: { [noRadius.id]: 'ready' } })
    const html = render(`/planet/${noRadius.id}/sunfall`)
    expect(text(html)).toContain('Radius Radius not in the catalogue')
    expect(html).toContain('prov prov--missing')
    expect(html).toContain('data-status="unavailable"')
  })

  it('marks the page while the AI drawer is open, so the result stays clear of it', () => {
    reset({ details: { [trappist.id]: trappist }, detailStatus: { [trappist.id]: 'ready' } })
    expect(render(`/planet/${trappist.id}/sunfall`)).toContain('class="sf"')
    state.astronomerOpen = true
    expect(render(`/planet/${trappist.id}/sunfall`)).toContain('class="sf has-drawer"')
  })

  it('passes reduced motion through', () => {
    reset({ details: { [trappist.id]: trappist }, detailStatus: { [trappist.id]: 'ready' } })
    state.reducedMotion = true
    expect(render(`/planet/${trappist.id}/sunfall`)).toContain('data-still="true"')
  })
})

describe('SUNFALL page helpers', () => {
  it('opens Kepler-16 b from the menu, else a featured planet with a radius', () => {
    const byId = Object.fromEntries(labPlanets.map((p) => [p.id, p]))
    expect(defaultSunfallId(byId, labPlanets)).toBe('kepler-16-b')
    const { 'kepler-16-b': _drop, ...rest } = byId
    const id = defaultSunfallId(rest, labPlanets.filter((p) => p.id !== 'kepler-16-b'))
    expect(id).not.toBe('kepler-16-b')
    expect(sunfallResult(rest[id]).status).not.toBe('unavailable')
    expect(defaultSunfallId({}, [])).toBeNull()
  })

  it('summarises the radius with uncertainty and provenance', () => {
    const p = (radiusEarth, extra) => ({ id: 'x', name: 'X', radiusEarth, massEarth: { value: null, status: 'missing' }, star: {}, system: {}, discovery: { method: 'Transit' }, ...extra })
    expect(radiusSummary(sunfallResult(p(q(0.92, 'measured', { err: [0.013, -0.012] }))))).toEqual({ available: true, text: '0.920 +0.013 −0.012 R⊕', provenance: 'Measured', kind: 'measured' })
    expect(radiusSummary(sunfallResult(p(q(1.02, 'calculated'))))).toMatchObject({ text: '1.02 R⊕', provenance: 'Calculated by NASA', kind: 'calculated' })
    expect(radiusSummary(sunfallResult(p(q(13, 'measured'), { discovery: { method: 'Imaging' } })))).toMatchObject({ provenance: 'Model-based', kind: 'estimated' })
    expect(radiusSummary(sunfallResult(p(q(2.4, 'estimated'))))).toMatchObject({ provenance: 'Estimated' })
  })

  it('shows a radius limit as a bound, without an uncertainty', () => {
    const p = (radiusEarth) => ({ id: 'x', name: 'X', radiusEarth, massEarth: { value: null, status: 'missing' }, star: {}, system: {}, discovery: {} })
    expect(radiusSummary(sunfallResult(p(q(1.61, 'measured', { limit: '>', err: [0.02, -0.02] })))).text).toBe('> 1.61 R⊕ (lower limit)')
    expect(radiusSummary(sunfallResult(p(q(1.5, 'measured', { limit: '<' })))).text).toBe('< 1.5 R⊕ (upper limit)')
  })

  it('reports no radius for missing and imputed values', () => {
    const p = (radiusEarth) => ({ id: 'x', name: 'X', radiusEarth, massEarth: { value: null, status: 'missing' }, star: {}, system: {}, discovery: {} })
    for (const r of [{ value: null, status: 'missing' }, q(2.2, 'imputed')]) {
      expect(radiusSummary(sunfallResult(p(r)))).toEqual({ available: false, text: 'Radius not in the catalogue', provenance: null, kind: 'missing' })
    }
    expect(radiusSummary(null).available).toBe(false)
  })
})

describe('routes', () => {
  it('registers /planet/:id/sunfall and the /sunfall entry point', () => {
    const app = readFileSync(path.resolve(here, '../../App.jsx'), 'utf8')
    expect(app).toContain("{ path: 'planet/:id/sunfall', lazy: page(() => import('./pages/SunfallPage.jsx')) }")
    expect(app).toContain("{ path: 'sunfall', lazy: page(() => import('./pages/SunfallIndexPage.jsx')) }")
  })
})
