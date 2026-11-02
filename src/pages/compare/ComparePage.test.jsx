import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { labPlanets } from '../../three/lab/fixtures.js'

const byName = Object.fromEntries(labPlanets.map((p) => [p.name, p]))
const pick = (...names) => names.map((n) => byName[n])

// A planet whose only radius is a median imputation (CLAUDE.md §5a).
const imputed = { ...byName['TRAPPIST-1 e'], id: 'imputed-x', name: 'Imputed X', radiusEarth: { value: 2.2, status: 'imputed' } }
// Upper-limit mass.
const limited = { ...byName['Kepler-452 b'], id: 'limit-y', name: 'Limit Y', massEarth: { value: 12, status: 'measured', kind: 'Mass', limit: '<' } }

const state = {}
function reset(status = 'ready') {
  const planets = [...labPlanets, imputed, limited]
  Object.assign(state, {
    catalogStatus: status,
    planets: status === 'ready' ? planets : [],
    byId: status === 'ready' ? Object.fromEntries(planets.map((p) => [p.id, p])) : {},
    details: {},
    detailStatus: {},
    loadDetail: () => {},
    compareIds: [],
    setCompare: () => {},
    openAstronomer: () => {},
  })
}
vi.mock('../../store/useCelestria.js', () => ({ useCelestria: (sel) => sel(state) }))
vi.mock('../../three/planet/visualParams.js', () => ({
  visualParams: () => ({ archetypeLabel: 'Rocky world', thermal: 'temperate', thermalLabel: 'Temperate', coverage: { available: 4, total: 5 } }),
}))

const { default: ComparePage } = await import('../ComparePage.jsx')

const render = (url) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/compare" element={<ComparePage />} />
      </Routes>
    </MemoryRouter>,
  )
const ids = (...names) => names.map((n) => byName[n]?.id ?? n).join(',')
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

beforeEach(() => reset())

describe('Compare page states', () => {
  it('shows the catalogue loading and failure states', () => {
    reset('loading')
    expect(render('/compare')).toContain('Loading catalog…')
    reset('error')
    const html = render(`/compare?ids=${ids('TRAPPIST-1 e')}`)
    expect(html).toContain('Catalog unavailable')
    expect(html).toContain('could not be loaded')
    expect(html).not.toContain('cmp-table')
  })

  it('shows an empty state with real quick picks and presets', () => {
    const html = render('/compare')
    expect(html).toContain('Choose planets to compare')
    expect(html).toContain('0 of 4 planets')
    expect(html).toMatch(/aria-label="Add [^"]+"/)
    expect(html).not.toContain('cmp-table')
    expect(html).toContain('Add a planet') // picker in add mode
  })

  it('shows one planet beside Earth, with a prompt and no highlights or ranking notes', () => {
    const html = render(`/compare?ids=${ids('TRAPPIST-1 e')}`)
    expect(html).toContain('1 of 4 planets')
    expect(html).toContain('Add another planet to see which values differ clearly')
    expect(html).toContain('cmp-col-ref')
    expect(html).not.toContain('cmp-hl')
    expect(html).not.toContain('Not ranked')
  })

  it('reports unknown and extra ids instead of silently dropping them', () => {
    const html = text(render(`/compare?ids=no-such-planet,${ids('TRAPPIST-1 e', 'Proxima Cen b', 'Kepler-452 b', 'HR 8799 b', '51 Peg b')}`))
    expect(html).toContain('No confirmed planet matches “no-such-planet”')
    expect(html).toContain('Only the first 4 planets are compared; 51 Peg b was left out.')
    expect(html).toContain('4 of 4 planets')
  })

  it('shows no internal team or deliverable labels', () => {
    for (const url of ['/compare', `/compare?ids=${ids('TRAPPIST-1 e', 'Proxima Cen b')}`]) {
      expect(render(url)).not.toMatch(/\b(UI|LEAD|DATA|AI) · |\bD[234]\.\d|placeholder\)/)
    }
  })
})

describe('Compare page selection and Earth', () => {
  it('compares up to four planets from the URL; Earth does not count towards the four', () => {
    const html = render(`/compare?ids=${ids('TRAPPIST-1 e', 'Proxima Cen b', 'Kepler-452 b', 'HR 8799 b')}`)
    expect(html).toContain('4 of 4 planets')
    expect((html.match(/class="cmp-card"/g) ?? []).length).toBe(4)
    expect(html).toContain('cmp-card cmp-card--ref') // Earth card, separate
    expect(html).toContain('Comparison full')
    expect(html).toMatch(/<button[^>]*class="ppk__button"[^>]*disabled=""/)
    for (const p of pick('TRAPPIST-1 e', 'HR 8799 b')) {
      expect(html).toContain(`href="/planet/${p.id}"`)
      expect(html).toContain(`aria-label="Remove ${p.name} from the comparison"`)
    }
  })

  it('hides the Earth column with earth=0', () => {
    const html = render(`/compare?ids=${ids('TRAPPIST-1 e', 'Proxima Cen b')}&earth=0`)
    expect(html).not.toContain('cmp-col-ref')
    expect(html).not.toContain('cmp-card--ref')
    expect(html).not.toMatch(/<input type="checkbox" checked=""/)
  })

  it('labels Earth and Sun values as reference values', () => {
    const html = text(render(`/compare?ids=${ids('TRAPPIST-1 e', 'Proxima Cen b')}`))
    expect(html).toContain('Earth Reference')
    expect(html).toContain('5,772 K') // Sun, IAU nominal
    expect(html).toContain('NASA NSSDCA Earth Fact Sheet')
  })
})

describe('Compare page table', () => {
  const html = () => render(`/compare?ids=${ids('TRAPPIST-1 e', 'Proxima Cen b', 'Kepler-452 b', 'HR 8799 b')}`)

  it('groups rows into the five categories as a real table', () => {
    const h = html()
    for (const g of ['Planet basics', 'Physical properties', 'Orbital properties', 'Host star', 'Discovery and system']) expect(h).toContain(`>${g}</th>`)
    expect(h).toContain('scope="rowgroup"')
    expect(h).toContain('scope="row"')
    expect(h).toContain('<caption')
  })

  it('shows provenance: minimum mass, mass–radius estimate, calculated, model-based', () => {
    const h = html()
    expect(h).toContain('prov prov--minimum')
    expect(h).toContain('prov prov--estimated')
    expect(h).toContain('prov prov--calculated')
    expect(h).toContain('Model-based')
  })

  it('explains unranked rows once in the property column', () => {
    const h = text(html())
    expect(h).toContain('Not ranked: mixes minimum masses (M sin i) with other masses')
    expect(h).toContain('Not ranked: mixes model-based estimates with measured values')
    expect(h.match(/mixes minimum masses/g)).toHaveLength(1)
  })

  it('highlights only extremes the comparison marks distinct, with text as well as an icon', () => {
    const h = html()
    const marks = [...h.matchAll(/class="cmp-hl">.*?<\/svg>([^<]+)</g)].map((m) => m[1])
    expect(marks.length).toBeGreaterThan(0)
    expect(marks).toContain('Hottest') // star effective temperature
    // Planet radius mixes model-based and measured values: no highlight in that row.
    const radiusRow = h.split('<tr').find((r) => r.includes('cmp-prop__label">Radius<'))
    expect(radiusRow).toContain('Not ranked: mixes model-based estimates with measured values')
    expect(radiusRow).not.toContain('cmp-hl')
  })

  it('shows missing values as Unavailable, never 0, with the uncertainty notation intact', () => {
    const h = html()
    expect(h).toContain('cmp-missing')
    expect(h).toContain('Unavailable')
    expect(h).toContain('±0.022') // TRAPPIST-1 e mass uncertainty
    expect(h).toContain('cmp-num__err--asym')
  })

  it('never shows an imputed value', () => {
    const h = render(`/compare?ids=imputed-x,${ids('Proxima Cen b')}`)
    expect(h).not.toContain('>2.2<')
    expect(h).toContain('Unavailable')
  })

  it('keeps upper limits as limits and does not rank them', () => {
    const h = text(render(`/compare?ids=limit-y,${ids('TRAPPIST-1 e')}`))
    expect(h).toMatch(/&lt; 12 M⊕/)
    expect(h).toContain('Not ranked: Limit Y has only an upper limit')
  })

  it('discloses that uncertainties and sources are still loading', () => {
    state.detailStatus = {}
    expect(html()).toContain('Loading uncertainties and sources')
    state.details = Object.fromEntries(pick('TRAPPIST-1 e', 'Proxima Cen b', 'Kepler-452 b', 'HR 8799 b').map((p) => [p.id, p]))
    expect(html()).not.toContain('Loading uncertainties and sources')
  })

  it('names a failed full-record load', () => {
    const p = byName['HR 8799 b']
    state.detailStatus = { [p.id]: 'error' }
    expect(text(html())).toContain('Uncertainties and sources for HR 8799 b could not be loaded')
  })
})

describe('Compare page: size view and AI entry', () => {
  it('shows the size comparison in visibility mode by default, with a scale note and Earth', () => {
    const h = render(`/compare?ids=${ids('TRAPPIST-1 e', 'HR 8799 b')}`)
    expect(h).toContain('id="size-title"')
    expect(h).toMatch(/aria-pressed="true"[^>]*>Visibility scale/)
    expect(h).toMatch(/aria-pressed="false"[^>]*>True scale/)
    expect(h).toContain('enlarged for visibility')
    expect(h).toContain('Earth: reference radius, 1 R⊕')
    expect(h).toContain('size-c--model') // HR 8799 b: model-based radius
    expect(h).toMatch(/role="img" aria-label="TRAPPIST-1 e: radius 0.920 \+0.013 −0.012 R⊕, measured;/)
  })

  it('offers the AI astronomer only for two or more planets', () => {
    expect(render(`/compare?ids=${ids('TRAPPIST-1 e', 'Proxima Cen b')}`)).toContain('Ask the Astronomer to compare these planets')
    expect(render(`/compare?ids=${ids('TRAPPIST-1 e')}`)).not.toContain('Ask the Astronomer to compare')
    expect(render('/compare')).not.toContain('Ask the Astronomer to compare')
  })
})
