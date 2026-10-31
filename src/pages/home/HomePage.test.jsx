import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import HomePage, { HOME_SCENE } from './HomePage.jsx'

vi.mock('../../three/viewports/EarthHeroScene.jsx', () => ({ default: ({ reducedMotion }) => <div data-scene="earth" data-reduced={String(reducedMotion)} /> }))
vi.mock('../../three/viewports/HeroScene.jsx', () => ({ default: () => <div data-scene="classic" /> }))
vi.mock('../../store/useCelestria.js', () => ({ useCelestria: (sel) => sel({ reducedMotion: true }) }))

const render = (url) => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><HomePage /></MemoryRouter>)

describe('HomePage', () => {
  it('shows the Earth scene by default and passes reduced motion through', () => {
    expect(HOME_SCENE).toBe('earth')
    const html = render('/')
    expect(html).toContain('data-scene="earth"')
    expect(html).toContain('data-reduced="true"')
    expect(html).toContain('href="/explore"') // navigation preserved
  })

  it('keeps the previous homepage as a recoverable fallback', () => {
    const html = render('/?scene=classic')
    expect(html).toContain('data-scene="classic"')
    expect(html).toContain('Planet shown is an artistic impression.')
    expect(html).not.toContain('data-scene="earth"')
  })
})
