// /compare?ids=a,b — owner: UI (D2.5; implemented by LEAD, Stage 2b).
// Up to four catalogue planets side by side, with Earth as a separate
// reference column. The URL holds the selection and the store mirrors it
// (the AI astronomer reads compareIds). Values come from the store's
// catalogue, upgraded to full records (uncertainties, sources) as they load.
// The comparison itself is src/science/compare.js.

import { Telescope } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import PlanetPicker from '../components/ui/PlanetPicker.jsx'
import { FEATURED_PLANET_IDS } from '../data/featured.js'
import { MAX_COMPARE_PLANETS, buildComparison } from '../science/compare.js'
import { useCelestria } from '../store/useCelestria.js'
import { catalogMessage } from './catalogMessages.js'
import CompareTable from './compare/CompareTable.jsx'
import { EarthCard, PlanetCard } from './compare/SelectedPlanets.jsx'
import SizeComparison from './compare/SizeComparison.jsx'
import { parseIds, resolveSelection, searchWith, sourcesByPlanet } from './compare/compareView.js'
import { sourceLabel } from '../components/data/sourceLabel.js'
import './compare/Compare.css'

const PRESETS = [
  ['trappist-1-e', 'proxima-cen-b'],
  ['kepler-452-b', 'k2-18-b'],
  ['51-peg-b', 'hd-189733-b', 'wasp-12-b'],
]

const listNames = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

export default function ComparePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const status = useCelestria((s) => s.catalogStatus)
  const planets = useCelestria((s) => s.planets)
  const byId = useCelestria((s) => s.byId)
  const details = useCelestria((s) => s.details)
  const detailStatus = useCelestria((s) => s.detailStatus)
  const loadDetail = useCelestria((s) => s.loadDetail)
  const compareIds = useCelestria((s) => s.compareIds)
  const setCompare = useCelestria((s) => s.setCompare)
  const openAstronomer = useCelestria((s) => s.openAstronomer)

  const [announcement, setAnnouncement] = useState('')
  const focusAdd = useRef(false)
  const addRef = useRef(null)
  const restored = useRef(false)
  const restoring = useRef(false)

  const ready = status === 'ready'
  const requested = useMemo(() => parseIds(params.get('ids')), [params])
  const includeEarth = params.get('earth') !== '0'
  const sel = useMemo(() => (ready ? resolveSelection(requested, byId) : null), [ready, requested, byId])
  const ids = useMemo(() => sel?.ids ?? [], [sel])

  // Arriving without ?ids= restores the store's list once (e.g. planets
  // added on another page); after that the URL alone decides.
  useEffect(() => {
    if (!ready || restored.current) return
    restored.current = true
    const keep = compareIds.filter((id) => byId[id])
    if (params.has('ids') || !keep.length) return
    restoring.current = true
    navigate({ search: searchWith(params, keep) }, { replace: true })
  }, [ready, params, compareIds, byId, navigate])

  // The store mirrors the URL (back/forward included).
  const idsKey = ids.join(',')
  useEffect(() => {
    if (!ready) return
    if (restoring.current && !idsKey) return
    restoring.current = false
    setCompare(idsKey ? idsKey.split(',') : [])
  }, [ready, idsKey, setCompare])

  // Full records add uncertainties and sources to the catalogue values.
  useEffect(() => {
    for (const id of idsKey ? idsKey.split(',') : []) loadDetail(id)
  }, [idsKey, loadDetail])

  // After a removal, focus returns to "Add a planet" once the new selection
  // has rendered (the URL updates asynchronously).
  useEffect(() => {
    if (!focusAdd.current) return
    focusAdd.current = false
    addRef.current?.querySelector('button')?.focus()
  }, [idsKey])

  const chosen = useMemo(() => ids.map((id) => details[id] ?? byId[id]), [ids, details, byId])
  const comparison = useMemo(() => buildComparison(chosen, { includeEarth }), [chosen, includeEarth])
  const sources = useMemo(() => sourcesByPlanet(comparison, chosen), [comparison, chosen])

  const go = (search, replace = false) => navigate({ search }, { replace })
  const write = (next) => {
    setCompare(next)
    go(searchWith(params, next))
  }
  const add = (id) => {
    const name = byId[id]?.name ?? id
    if (ids.includes(id)) return setAnnouncement(`${name} is already in the comparison.`)
    if (ids.length >= MAX_COMPARE_PLANETS) return setAnnouncement(`Up to ${MAX_COMPARE_PLANETS} planets can be compared. Remove one first.`)
    write([...ids, id])
    setAnnouncement(`Added ${name}. ${ids.length + 1} of ${MAX_COMPARE_PLANETS} planets.`)
  }
  const remove = (id) => {
    write(ids.filter((x) => x !== id))
    setAnnouncement(`Removed ${byId[id]?.name ?? id}. ${ids.length - 1} of ${MAX_COMPARE_PLANETS} planets.`)
    focusAdd.current = true
  }
  const clearAll = () => {
    write([])
    setAnnouncement('Comparison cleared.')
    focusAdd.current = true
  }
  const toggleEarth = (on) => go(searchWith(params, null, { earth: on ? null : '0' }), true)
  const dropUnknown = () => go(searchWith(params, ids), true)

  const loading = ids.filter((id) => !details[id] && detailStatus[id] !== 'error')
  const failed = ids.filter((id) => detailStatus[id] === 'error')
  const full = ids.length >= MAX_COMPARE_PLANETS
  const quickPicks = ready ? FEATURED_PLANET_IDS.filter((id) => byId[id] && !ids.includes(id)).slice(0, 8) : []
  const presets = ready ? PRESETS.filter((set) => set.every((id) => byId[id])) : []
  const msg = ready ? null : catalogMessage({ status })

  return (
    <div className="cmp">
      <header className="cmp-head">
        <p className="cmp-kicker">Compare</p>
        <h1 className="cmp-title">Compare planets</h1>
        <p className="cmp-lede">
          Put up to four confirmed exoplanets side by side, with Earth as a reference. Every value shows its uncertainty and how it was obtained;
          values that NASA does not list stay unavailable.
        </p>
      </header>

      <p className="cmp-sr" role="status" aria-live="polite">
        {announcement}
      </p>

      {msg ? (
        <section className={`cmp-state cmp-state--${msg.kind}`}>
          {msg.title && <h2 className="cmp-h2">{msg.title}</h2>}
          <p>{msg.message}</p>
        </section>
      ) : (
        <>
          <div className="cmp-toolbar">
            <div className="cmp-add" ref={addRef}>
              <PlanetPicker
                planets={planets}
                value={null}
                onChange={add}
                label="Add a planet to the comparison"
                placeholder={full ? 'Comparison full' : 'Add a planet'}
                hint={full ? `Remove one to add another` : `Search ${planets.length.toLocaleString('en-US')} planets`}
                excludeIds={ids}
                featuredIds={FEATURED_PLANET_IDS}
                disabled={full}
              />
            </div>
            <p className="cmp-count num">
              {ids.length} of {MAX_COMPARE_PLANETS} planets
            </p>
            <label className="cmp-check">
              <input type="checkbox" checked={includeEarth} onChange={(e) => toggleEarth(e.target.checked)} />
              Earth reference
            </label>
            {ids.length > 0 && (
              <button type="button" className="cmp-textbtn" onClick={clearAll}>
                Clear all
              </button>
            )}
          </div>

          {(sel.unknown.length > 0 || sel.overflow.length > 0) && (
            <div className="cmp-notice" role="note">
              {sel.unknown.length > 0 && (
                <p>
                  No confirmed planet matches {sel.unknown.map((id) => `“${id}”`).join(', ')}, so {sel.unknown.length === 1 ? 'it is' : 'they are'} not shown.
                </p>
              )}
              {sel.overflow.length > 0 && (
                <p>
                  Only the first {MAX_COMPARE_PLANETS} planets are compared; {listNames(sel.overflow.map((id) => byId[id].name))}{' '}
                  {sel.overflow.length === 1 ? 'was' : 'were'} left out.
                </p>
              )}
              <button type="button" className="cmp-textbtn" onClick={dropUnknown}>
                Update the link
              </button>
            </div>
          )}

          {ids.length === 0 ? (
            <section className="cmp-empty" aria-labelledby="cmp-empty-title">
              <h2 id="cmp-empty-title" className="cmp-h2">
                Choose planets to compare
              </h2>
              <p>Search the catalogue above, or start with one of these.</p>
              {presets.length > 0 && (
                <ul className="cmp-presets">
                  {presets.map((set) => (
                    <li key={set.join()}>
                      <Link to={{ search: searchWith(params, set) }} onClick={() => setCompare(set)}>
                        {listNames(set.map((id) => byId[id].name))}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {quickPicks.length > 0 && (
                <ul className="cmp-quick" aria-label="Quick picks">
                  {quickPicks.map((id) => (
                    <li key={id}>
                      <button type="button" className="cmp-chip" onClick={() => add(id)} aria-label={`Add ${byId[id].name}`}>
                        + {byId[id].name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <>
              <section aria-label="Selected planets">
                <ul className="cmp-cards">
                  {chosen.map((p, i) => (
                    <PlanetCard key={p.id} planet={p} slot={i + 1} onRemove={() => remove(p.id)} />
                  ))}
                  {includeEarth && <EarthCard />}
                </ul>
              </section>

              {ids.length >= 2 && (
                <div className="cmp-ask">
                  <button type="button" className="cmp-ask__btn" onClick={openAstronomer}>
                    <Telescope size={15} aria-hidden="true" /> Ask the Astronomer to compare these planets
                  </button>
                  <p>Opens the astronomer with these planets as context and suggested questions. Nothing is asked until you choose or type a question.</p>
                </div>
              )}

              {ids.length === 1 && (
                <p className="cmp-prompt">
                  Add another planet to see which values differ clearly. With one planet, values are shown beside Earth&apos;s for reference only.
                </p>
              )}

              {(loading.length > 0 || failed.length > 0) && (
                <p className="cmp-status" role="status">
                  {loading.length > 0 && 'Loading uncertainties and sources… values are shown without them until then. '}
                  {failed.length > 0 &&
                    `Uncertainties and sources for ${listNames(failed.map((id) => byId[id].name))} could not be loaded; their values are shown without them, and differences involving them are not highlighted.`}
                </p>
              )}

              <SizeComparison comparison={comparison} planets={chosen} />

              <CompareTable comparison={comparison} planets={chosen} />

              <section className="cmp-foot" aria-labelledby="cmp-notes">
                <h2 id="cmp-notes" className="cmp-h2">
                  How to read this comparison
                </h2>
                <ul className="cmp-notes">
                  {comparison.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                  <li>
                    Values with an uncertainty are rounded to the precision it supports, as on planet profiles; hover or focus a value to see its full
                    figure. Values without an uncertainty are shown as catalogued; values CELESTRIA calculates are shown to four significant figures.
                  </li>
                </ul>
                <details className="cmp-sources">
                  <summary>Sources by planet</summary>
                  {sources.map((s) => (
                    <div key={s.id} className="cmp-sources__planet">
                      <h3>{s.name}</h3>
                      {s.sources.length ? (
                        <ul>
                          {s.sources.map((src) => (
                            <li key={`${src.label}${src.url}`}>
                              {src.url ? (
                                <a href={src.url} target="_blank" rel="noreferrer">
                                  {sourceLabel(src)}
                                </a>
                              ) : (
                                sourceLabel(src)
                              )}
                              <span>{src.fields.join(', ')}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>{details[s.id] ? 'No citations listed for these values.' : 'Citations appear once the full record has loaded.'}</p>
                      )}
                    </div>
                  ))}
                </details>
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
