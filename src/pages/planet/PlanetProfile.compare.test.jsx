import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { labPlanets } from '../../three/lab/fixtures.js'

vi.mock('../../three/viewports/PlanetViewport.jsx', () => ({ default: () => <div data-viewport /> }))
const { default: PlanetProfile } = await import('./PlanetProfile.jsx')

const planet = labPlanets.find((p) => p.name === 'TRAPPIST-1 e')
const render = (compare, extra = {}) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <PlanetProfile
        planet={planet}
        planets={labPlanets}
        planetHref={(id) => `/planet/${id}`}
        systemHref={(h) => `/explore/${h}`}
        orbitHref={(id) => `/planet/${id}/orbit`}
        closeHref="/explore"
        onSelectPlanet={() => {}}
        compare={compare}
        {...extra}
      />
    </MemoryRouter>,
  )
const compare = (ids) => ({ ids, max: 4, href: `/compare?ids=${ids.join(',')}`, onAdd: () => {} })

describe('Planet profile: Add to compare', () => {
  it('offers Add to compare when the list is empty', () => {
    const html = render(compare([]))
    expect(html).toMatch(/<button type="button" class="pp-btn">.*Add to compare/)
    expect(html).not.toContain('View comparison')
  })

  it('shows the selection count and a link to the comparison', () => {
    const html = render(compare(['proxima-cen-b', 'k2-18-b']))
    expect(html).toContain('Add to compare')
    expect(html).toContain('aria-label="2 of 4 planets selected"')
    expect(html).toContain('href="/compare?ids=proxima-cen-b,k2-18-b"')
    expect(html).toContain('View comparison (2)')
  })

  it('does not offer to add a planet already in the list', () => {
    const html = render(compare(['proxima-cen-b', planet.id]))
    expect(html).not.toContain('Add to compare')
    expect(html).toContain('In comparison · View')
    expect(html).toContain(`href="/compare?ids=proxima-cen-b,${planet.id}"`)
  })

  it('respects the four-planet limit', () => {
    const html = render(compare(['a', 'b', 'c', 'd']))
    expect(html).not.toContain('Add to compare')
    expect(html).toContain('Comparison full · View')
    expect(html).toContain('Up to 4 planets can be compared')
  })

  it('hides the control when no comparison list is provided (lab)', () => {
    expect(render(null)).not.toMatch(/Add to compare|In comparison|Comparison full/)
  })
})

describe('Planet profile: SUNFALL action', () => {
  const sunfallHref = (id) => `/planet/${id}/sunfall`

  it('links to the planet’s SUNFALL page next to the Orbital simulator', () => {
    const html = render(null, { sunfallHref })
    expect(html).toContain(`href="/planet/${planet.id}/sunfall"`)
    expect(html).toContain('SUNFALL: volume vs the Sun')
    expect(html.indexOf('Orbital simulator')).toBeLessThan(html.indexOf('SUNFALL'))
  })

  it('stays visible but disabled, with the reason, when there is no usable radius', () => {
    for (const radiusEarth of [{ value: null, status: 'missing' }, { value: 2.2, status: 'imputed' }]) {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <PlanetProfile
            planet={{ ...planet, radiusEarth }}
            planets={labPlanets}
            planetHref={(id) => `/planet/${id}`}
            systemHref={(h) => `/explore/${h}`}
            orbitHref={(id) => `/planet/${id}/orbit`}
            sunfallHref={sunfallHref}
            closeHref="/explore"
            onSelectPlanet={() => {}}
          />
        </MemoryRouter>,
      )
      expect(html).toContain('SUNFALL unavailable: needs a catalogue radius')
      expect(html).toContain('aria-disabled="true"')
      expect(html).not.toContain('/sunfall"')
    }
  })

  it('is hidden where no SUNFALL route is given (the lab)', () => {
    expect(render(null)).not.toContain('SUNFALL')
  })
})
