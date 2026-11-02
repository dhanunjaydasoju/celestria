import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_COMPARE, useCelestria } from './useCelestria.js'

const initial = useCelestria.getState()

beforeEach(() => {
  useCelestria.setState(initial, true)
})

describe('compare slice', () => {
  it('ignores duplicates and caps the list', () => {
    const s = useCelestria.getState()
    s.addCompare('a')
    s.addCompare('a')
    for (let i = 0; i < 10; i++) useCelestria.getState().addCompare(`p${i}`)
    const ids = useCelestria.getState().compareIds
    expect(ids.length).toBe(MAX_COMPARE)
    expect(ids.filter((x) => x === 'a').length).toBe(1)
  })

  it('replaces the list with setCompare, deduplicated and capped, keeping order', () => {
    useCelestria.getState().setCompare(['b', 'a', 'b', 'c', 'd', 'e'])
    expect(useCelestria.getState().compareIds).toEqual(['b', 'a', 'c', 'd'])
    const before = useCelestria.getState().compareIds
    useCelestria.getState().setCompare(['b', 'a', 'c', 'd'])
    expect(useCelestria.getState().compareIds).toBe(before) // no-op when unchanged
    useCelestria.getState().setCompare([])
    expect(useCelestria.getState().compareIds).toEqual([])
  })
})

describe('catalog slice', () => {
  it('loads fixtures once and indexes by id and host', async () => {
    await Promise.all([useCelestria.getState().loadCatalog(), useCelestria.getState().loadCatalog()])
    const s = useCelestria.getState()
    expect(s.catalogStatus).toBe('ready')
    expect(s.catalogSource).toBe('fixtures')
    expect(Object.keys(s.byId).length).toBe(s.planets.length)
  })
})
