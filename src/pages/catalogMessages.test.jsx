import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogMessage } from './catalogMessages.js'

const state = { catalogStatus: 'ready', planets: [], byId: {}, details: {}, detailStatus: {}, loadDetail: () => {}, reducedMotion: true, compareIds: [] }
vi.mock('../store/useCelestria.js', () => ({ useCelestria: (sel) => sel(state) }))

const { default: PlanetPage } = await import('./PlanetPage.jsx')
const { default: OrbitPage } = await import('./OrbitPage.jsx')
const { default: ExplorePage } = await import('./ExplorePage.jsx')
const { default: OrbitIndexPage } = await import('./OrbitIndexPage.jsx')
const { default: PlanetViewportPage } = await import('./viewport/PlanetViewportPage.jsx')
const { default: NotFoundPage } = await import('./NotFoundPage.jsx')
const { default: ComparePage } = await import('./ComparePage.jsx')
const { default: AboutPage } = await import('./AboutPage.jsx')

const render = (path, pattern, el) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={el} />
      </Routes>
    </MemoryRouter>,
  )

// Internal labels the audit found on public pages.
const INTERNAL = /\b(UI|LEAD|DATA|AI) · |\bD[234]\.\d|\bM\d \w|D3\.4|placeholder\)/

beforeEach(() => {
  state.catalogStatus = 'ready'
})

describe('catalogMessage', () => {
  it('words loading, failure, empty and not-found states for users', () => {
    expect(catalogMessage({ status: 'idle' })).toMatchObject({ kind: 'loading', title: null })
    expect(catalogMessage({ status: 'loading', id: 'x' }).kind).toBe('loading')
    expect(catalogMessage({ status: 'error', id: 'x' })).toMatchObject({ kind: 'error', title: 'Catalog unavailable' })
    expect(catalogMessage({ status: 'ready' })).toMatchObject({ kind: 'empty', title: 'Catalog unavailable' })
    const nf = catalogMessage({ status: 'ready', id: 'kepler-999-z' })
    expect(nf).toMatchObject({ kind: 'notFound', title: 'Planet not found' })
    expect(nf.message).toContain('kepler-999-z')
    for (const s of ['idle', 'loading', 'error', 'ready']) expect(catalogMessage({ status: s, id: 'a' }).message).not.toMatch(INTERNAL)
  })
})

describe('public pages show no internal labels or stale messages', () => {
  it('unknown planet on the profile and orbit routes', () => {
    const profile = render('/planet/not-a-planet', '/planet/:id', <PlanetPage />)
    expect(profile).toContain('Planet not found')
    expect(profile).toContain('not-a-planet')
    expect(profile).toContain('href="/viewport"')
    const orbit = render('/planet/not-a-planet/orbit', '/planet/:id/orbit', <OrbitPage />)
    expect(orbit).toContain('Planet not found')
    expect(orbit).toContain('href="/orbit"')
    for (const html of [profile, orbit]) expect(html).not.toMatch(INTERNAL)
  })

  it('a failed catalog load is not reported as a missing planet', () => {
    state.catalogStatus = 'error'
    const profile = render('/planet/kepler-22-b', '/planet/:id', <PlanetPage />)
    expect(profile).toContain('could not be loaded')
    expect(profile).not.toContain('Planet not found')
    for (const [path, el] of [['/explore', <ExplorePage key="e" />], ['/orbit', <OrbitIndexPage key="o" />], ['/viewport', <PlanetViewportPage key="v" />]]) {
      expect(render(path, path, el)).toContain('could not be loaded')
    }
  })

  it('an empty catalog and the loading state', () => {
    for (const [path, el] of [['/explore', <ExplorePage key="e" />], ['/orbit', <OrbitIndexPage key="o" />], ['/viewport', <PlanetViewportPage key="v" />]]) {
      const html = render(path, path, el)
      expect(html).toContain('No planets are available right now.')
      expect(html).not.toMatch(INTERNAL)
    }
    state.catalogStatus = 'loading'
    expect(render('/explore', '/explore', <ExplorePage />)).toContain('Loading catalog…')
  })

  it('404, Compare and About', () => {
    const notFound = render('/nope', '*', <NotFoundPage />)
    expect(notFound).toContain('Page not found')
    for (const html of [notFound, render('/compare', '/compare', <ComparePage />)]) expect(html).not.toMatch(INTERNAL)
    expect(render('/about', '/about', <AboutPage />)).not.toMatch(/\b(UI|LEAD) · /)
  })
})
