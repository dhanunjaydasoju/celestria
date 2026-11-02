import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

const state = {
  planets: [],
  byId: {},
  compareIds: [],
  astronomerOpen: false,
  astronomerTurns: [],
  openAstronomer: () => {},
  closeAstronomer: () => {},
}
vi.mock('../store/useCelestria.js', () => ({ useCelestria: (sel) => sel(state) }))
vi.mock('../components/ai/AstronomerDrawer.jsx', () => ({ default: () => null }))
vi.mock('../components/sync/SyncStatus.jsx', () => ({ DataFreshness: () => null, UpdateNotice: () => null }))
const { default: AppShell } = await import('./AppShell.jsx')

const render = () => renderToStaticMarkup(<MemoryRouter><AppShell /></MemoryRouter>)

describe('menu: Compare entry', () => {
  it('lists Compare after Habitability and keeps the existing entries', () => {
    const labels = [...render().matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)/g)].map((m) => [m[1], m[2]])
    const order = labels.map(([href]) => href)
    for (const href of ['/', '/explore', '/viewport', '/orbit', '/habitability', '/compare', '/about']) expect(order).toContain(href)
    expect(order.indexOf('/compare')).toBe(order.indexOf('/habitability') + 1)
  })

  it('shows how many planets are in the comparison', () => {
    state.compareIds = []
    expect(render()).not.toContain('app-drawer__count')
    state.compareIds = ['a', 'b']
    const html = render()
    expect(html).toMatch(/app-drawer__count" aria-hidden="true">2</)
    expect(html).toContain('(2 selected)')
  })
})
