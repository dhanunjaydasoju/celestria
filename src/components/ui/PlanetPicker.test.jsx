import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PlanetPicker from './PlanetPicker.jsx'

const planets = [
  { id: 'a-b', name: 'A b', host: 'A' },
  { id: 'c-d', name: 'C d', host: 'C' },
]

describe('PlanetPicker', () => {
  it('shows the current planet in select mode (unchanged behaviour)', () => {
    const html = renderToStaticMarkup(<PlanetPicker planets={planets} value="a-b" onChange={() => {}} />)
    expect(html).toContain('ppk__name">A b<')
    expect(html).toContain('aria-label="Choose a planet. Current: A b"')
    expect(html).not.toContain('disabled')
  })

  it('shows a placeholder and hint in add mode, labelled for screen readers', () => {
    const html = renderToStaticMarkup(
      <PlanetPicker planets={planets} value={null} onChange={() => {}} label="Add a planet to the comparison" placeholder="Add a planet" hint="Search 2 planets" excludeIds={['a-b']} />,
    )
    expect(html).toContain('ppk__name">Add a planet<')
    expect(html).toContain('ppk__host">Search 2 planets<')
    expect(html).toContain('aria-label="Add a planet to the comparison"')
  })

  it('can be disabled when nothing more can be added', () => {
    const html = renderToStaticMarkup(<PlanetPicker planets={planets} value={null} onChange={() => {}} placeholder="Comparison full" disabled />)
    expect(html).toMatch(/<button[^>]*disabled=""/)
  })
})
