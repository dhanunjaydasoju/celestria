import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { sunfallResult } from '../../science/sunfall.js'

// No WebGL in tests: the Canvas and its scene are stubbed; the overlay is real.
vi.mock('@react-three/fiber', () => ({ Canvas: () => <div data-canvas /> }))
vi.mock('@react-three/drei', () => ({ PerformanceMonitor: () => null }))
vi.mock('../sunfall/SunfallScene.jsx', () => ({ default: () => null }))
vi.mock('../sun/quality.js', async (orig) => ({ ...(await orig()), detectTier: () => 'high' }))

const { default: SunfallViewport } = await import('./SunfallViewport.jsx')

const q = (value, status = 'measured', extra = {}) => ({ value, status, ...extra })
const planet = (name, radiusEarth, extra = {}) => ({ id: name.toLowerCase(), name, host: 'H', radiusEarth, massEarth: { value: null, status: 'missing' }, star: {}, system: {}, discovery: { method: 'Transit' }, ...extra })
const render = (p, opts = {}) => renderToStaticMarkup(<SunfallViewport planet={p} result={{ planetName: p.name, ...sunfallResult(p) }} {...opts} />)
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('SunfallViewport overlay', () => {
  it('plays by default: pause, skip and replay; result held back until the end', () => {
    const html = render(planet('Terra', q(1, 'measured', { err: [0.01, -0.01] })))
    expect(html).toContain('>Pause<')
    expect(html).toContain('Skip to result')
    expect(html).toContain('Replay')
    expect(html).not.toContain('sunfall__headline')
    expect(html).toContain('class="sunfall__counter num" aria-hidden="true"') // written by the scene, not React
  })

  it('reduced motion shows the result straight away, with only Replay', () => {
    const h = text(render(planet('Terra', q(1, 'measured', { err: [0.01, -0.01] })), { reducedMotion: true }))
    expect(h).toContain('The Sun’s volume equals about 1.302 million times the volume of Terra.')
    expect(h).toContain('Range from the radius uncertainty: 1.263 million – 1.342 million')
    expect(h).toContain('not a packing count')
    expect(h).not.toContain('Pause')
    expect(h).not.toContain('Skip to result')
    expect(h).toContain('Replay')
  })

  it('labels provenance, true or enlarged size, and what each copy stands for', () => {
    const h = text(render(planet('Terra', q(1))))
    expect(h).toContain('Artistic impression')
    expect(h).toContain('Measured radius')
    expect(h).toContain('Copies drawn at true size relative to the Sun')
    expect(h).toContain('Each copy shown stands for about')
    const tiny = text(render(planet('Mote', q(0.3))))
    expect(tiny).toMatch(/Copies enlarged ×2\.3 for visibility; the Sun is not/)
    expect(text(render(planet('Calc', q(1.02, 'calculated'))))).toContain('Radius calculated by NASA')
    expect(text(render(planet('Est', q(2.4, 'estimated'))))).toContain('Estimated radius')
  })

  it('keeps bound wording for radius limits', () => {
    const up = text(render(planet('Up', q(2, 'measured', { limit: '<' })), { reducedMotion: true }))
    expect(up).toContain('upper limit only')
    expect(up).toContain('Each copy shown stands for at least')
    expect(up).toContain('The Sun’s volume is more than 160,000 times the volume of Up.')
    const low = text(render(planet('Low', q(2, 'measured', { limit: '>' })), { reducedMotion: true }))
    expect(low).toContain('lower limit only')
    expect(low).toContain('The Sun’s volume is less than 170,000 times the volume of Low.')
  })

  it('starts nothing and invents nothing without a usable radius', () => {
    for (const r of [{ value: null, status: 'missing' }, q(2.2, 'imputed')]) {
      const html = render(planet('Void', r))
      expect(html).not.toContain('sunfall__controls')
      expect(html).not.toContain('sunfall__counter')
      expect(text(html)).toContain('No volume comparison for Void')
      expect(text(html)).toContain('A radius is needed; none is invented.')
      expect(text(html)).toContain('Our Sun')
      expect(text(html)).not.toContain('copies of Void')
    }
  })
})
