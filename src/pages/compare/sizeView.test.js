import { describe, expect, it } from 'vitest'
import { buildComparison } from '../../science/compare.js'
import { SIZE_MAX_PX, SIZE_MIN_PX, describeBody, sizeBodies } from './sizeView.js'

const MISSING = { value: null, status: 'missing' }
const planet = (id, radiusEarth, extra = {}) => ({
  id,
  name: id.toUpperCase(),
  host: 'H',
  radiusEarth,
  massEarth: MISSING,
  star: {},
  system: {},
  discovery: { method: 'Transit' },
  ...extra,
})
const q = (value, status = 'measured', extra = {}) => ({ value, status, ...extra })

const view = (planets, mode = 'visibility', includeEarth = true) => sizeBodies(buildComparison(planets, { includeEarth }), planets, mode)
const body = (v, id) => v.bodies.find((b) => b.id === id)

describe('sizeBodies', () => {
  const earthSize = planet('small', q(0.92, 'measured', { err: [0.013, -0.012] }))
  const giant = planet('giant', q(13, 'measured', { err: [1, -1] }))

  it('draws the largest body at the maximum size and keeps true ratios', () => {
    const v = view([earthSize, giant], 'true')
    expect(body(v, 'giant').px).toBeCloseTo(SIZE_MAX_PX)
    expect(body(v, 'small').px / body(v, 'giant').px).toBeCloseTo(0.92 / 13)
    expect(body(v, 'earth').px / body(v, 'giant').px).toBeCloseTo(1 / 13)
    expect(v.isTrueScale).toBe(true)
    expect(v.note).toBe('True relative size')
  })

  it('enlarges tiny bodies only in visibility mode, and says so', () => {
    const tiny = planet('tiny', q(0.3))
    const t = view([tiny, planet('huge', q(30))], 'true')
    expect(body(t, 'tiny').enlarged).toBe(false)
    const v = view([tiny, planet('huge', q(30))], 'visibility')
    expect(body(v, 'tiny').px).toBe(SIZE_MIN_PX)
    expect(body(v, 'tiny').enlarged).toBe(true)
    expect(v.note).toMatch(/enlarged for visibility/)
  })

  it('flags bodies too small to see at true scale', () => {
    const v = view([planet('dot', q(0.05)), planet('huge', q(25))], 'true', false)
    expect(body(v, 'dot').subpixel).toBe(true)
    expect(describeBody(body(v, 'dot'), true)).toMatch(/too small to see at true scale/)
  })

  it('gives no size to a missing radius or a radius known only as a limit', () => {
    const v = view([planet('none', MISSING), planet('lim', q(2, 'measured', { limit: '<' })), earthSize])
    expect(body(v, 'none')).toMatchObject({ drawable: false, style: 'none', tag: 'Radius unavailable' })
    expect(body(v, 'none').px).toBeUndefined()
    expect(body(v, 'lim')).toMatchObject({ drawable: false, tag: 'Upper limit only', valueText: '< 2 R⊕' })
    expect(describeBody(body(v, 'lim'), false)).toMatch(/not drawn to any size/)
  })

  it('never draws an imputed radius', () => {
    const v = view([planet('imp', q(2.2, 'imputed')), earthSize])
    expect(body(v, 'imp').drawable).toBe(false)
  })

  it('styles calculated, estimated and model-based radii apart from measured ones', () => {
    const imaged = planet('imaged', q(13), { discovery: { method: 'Imaging' } })
    const v = view([planet('calc', q(1.02, 'calculated')), planet('est', q(2, 'estimated')), imaged, earthSize])
    expect(body(v, 'calc')).toMatchObject({ style: 'calculated', tag: 'Calculated by NASA' })
    expect(body(v, 'est')).toMatchObject({ style: 'model', tag: 'Estimated' })
    expect(body(v, 'imaged')).toMatchObject({ style: 'model', tag: 'Model-based' })
    expect(body(v, 'small')).toMatchObject({ style: 'measured', tag: 'Measured', valueText: '0.920 +0.013 −0.012 R⊕' })
  })

  it('adds Earth as a reference body, last, only when the reference is shown', () => {
    const v = view([earthSize])
    expect(v.bodies.at(-1)).toMatchObject({ id: 'earth', reference: true, radius: 1, style: 'reference', tag: 'Reference' })
    expect(view([earthSize], 'visibility', false).bodies.map((b) => b.id)).toEqual(['small'])
  })

  it('draws the uncertainty band only at true scale', () => {
    expect(body(view([earthSize, giant], 'true'), 'giant').band).toHaveLength(2)
    expect(body(view([earthSize, giant], 'visibility'), 'giant').band).toBeNull()
    expect(body(view([planet('noerr', q(3)), giant], 'true'), 'noerr').band).toBeNull()
  })

  it('reports when nothing can be drawn', () => {
    const v = view([planet('a', MISSING), planet('b', MISSING)], 'true', false)
    expect(v.drawn).toBe(0)
  })
})
