// /habitability — catalogue habitability dashboard. owner: AI/UI (implemented
// by LEAD in M5 Phase B). Data: GET /api/habitability (computed server-side
// from full NASA records by src/science/habitability.js).

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import HZDiagram from '../components/habitability/HZDiagram.jsx'
import { SIZE_CLASSES, sizeClassOf, withErr } from '../components/habitability/hzChart.js'
import '../components/habitability/Habitability.css'
import { DISCLAIMER, RULES, TIERS } from '../science/habitability.js'
import { REFERENCE, TEFF_MAX_K, TEFF_MIN_K } from '../science/habitableZone.js'
import { getHabitability } from '../services/api.js'

const ZONE_ROWS = new Set(['optimistic_inner', 'conservative', 'optimistic_outer'])
const SWATCH = { small: 'var(--hz-small)', mid: 'var(--hz-mid)', large: 'var(--hz-large)' }
const SHORT = { hot: 'Hotter than zone', optimistic_inner: 'Optimistic (inner)', conservative: 'Conservative', optimistic_outer: 'Optimistic (outer)', cold: 'Colder than zone' }
const fmt = (n) => (n ?? 0).toLocaleString('en-US')

function Stat({ n, label }) {
  return (
    <div className="hz-stat">
      <span className="hz-stat__n">{fmt(n)}</span>
      <span className="hz-stat__label">{label}</span>
    </div>
  )
}

const PLACEMENT_RANK = { conservative: 0, optimistic_inner: 1, optimistic_outer: 2, hot: 3, cold: 4 }

const SORTS = {
  // Conservative first, then optimistic, then planets that only straddle a boundary.
  placement: (p) => PLACEMENT_RANK[p.placement] * 1e6 - Math.min(p.flux.value, 999999),
  name: (p) => p.name,
  flux: (p) => p.flux.value,
  teff: (p) => p.teff.value,
  radius: (p) => p.radius?.value ?? Infinity,
}

export default function HabitabilityPage() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [sizes, setSizes] = useState(() => new Set(SIZE_CLASSES.map((c) => c.key)))
  const [range, setRange] = useState('hz')
  const [showErrors, setShowErrors] = useState(false)
  const [sort, setSort] = useState({ key: 'placement', dir: 1 })
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let live = true
    getHabitability()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e))
    return () => {
      live = false
    }
  }, [])

  const filtered = useMemo(() => (data ? data.planets.filter((p) => sizes.has(sizeClassOf(p.radius?.value ?? null))) : []), [data, sizes])
  const zoneRows = useMemo(() => {
    const rows = filtered.filter((p) => ZONE_ROWS.has(p.placement) || p.straddles)
    const key = SORTS[sort.key]
    return [...rows].sort((a, b) => {
      const va = key(a)
      const vb = key(b)
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * sort.dir
    })
  }, [filtered, sort])
  const sizeCounts = useMemo(() => {
    const m = {}
    for (const p of data?.planets ?? []) m[sizeClassOf(p.radius?.value ?? null)] = (m[sizeClassOf(p.radius?.value ?? null)] ?? 0) + 1
    return m
  }, [data])

  const s = data?.summary
  const c = data?.coverage
  const notPlaced = s ? data.count - (s.zoneStatus.placed ?? 0) : 0
  const sortBy = (key) => setSort((x) => ({ key, dir: x.key === key ? -x.dir : key === 'name' || key === 'placement' ? 1 : -1 }))
  const ariaSort = (key) => (sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined)

  return (
    <div className="hz-dash">
      <p className="hz-kicker">Habitability indicators</p>
      <h1 className="hz-title">Habitable-zone placement across the catalogue</h1>
      <p className="hz-lede">
        Where each confirmed planet sits relative to its star's habitable zone, estimated from the starlight it receives (Kopparapu et al. 2014).
        Only NASA catalogue values and values calculated from them are used; uncertainties decide when a planet straddles a boundary.
      </p>
      <p className="hz-caveat">{DISCLAIMER}</p>

      {error && <p className="hz-sub">The habitability data could not be loaded ({error.message}).</p>}
      {!data && !error && <p className="hz-sub">Loading indicators for the catalogue…</p>}

      {data && (
        <>
          <div className="hz-stats" role="list">
            <Stat n={s.placements.conservative} label="Within a conservative habitable zone" />
            <Stat n={(s.placements.optimistic_inner ?? 0) + (s.placements.optimistic_outer ?? 0)} label="Only within an optimistic zone" />
            <Stat n={s.straddling} label="Straddle a boundary within their uncertainties" />
            <Stat n={s.placements.hot} label="Receive more starlight than the zone" />
            <Stat n={s.placements.cold} label="Receive less starlight than the zone" />
            <Stat n={notPlaced} label={`Cannot be placed (of ${fmt(data.count)} planets)`} />
          </div>

          <section className="hz-section" aria-labelledby="hz-diagram">
            <h2 id="hz-diagram" className="hz-h2">
              Stellar flux and star temperature
            </h2>
            <p className="hz-sub">
              Each point is a planet. The shaded bands show where an Earth-like planet could keep surface water according to the climate model: darker = conservative, lighter = optimistic.
              Colour shows planet size, not composition.
            </p>
            <div className="hz-filters">
              <fieldset>
                <legend>Size</legend>
                {SIZE_CLASSES.map((sc) => (
                  <button
                    key={sc.key}
                    type="button"
                    className="hz-toggle"
                    aria-pressed={sizes.has(sc.key)}
                    onClick={() =>
                      setSizes((prev) => {
                        const next = new Set(prev)
                        if (next.has(sc.key)) next.delete(sc.key)
                        else next.add(sc.key)
                        return next
                      })
                    }
                  >
                    <span className={`hz-swatch${sc.key === 'unknown' ? ' hz-swatch--hollow' : ''}`} style={{ '--sw': SWATCH[sc.key] }} />
                    {sc.label} <span className="num">({fmt(sizeCounts[sc.key])})</span>
                  </button>
                ))}
              </fieldset>
              <fieldset>
                <legend>Range</legend>
                <button type="button" className="hz-toggle" aria-pressed={range === 'hz'} onClick={() => setRange('hz')}>
                  Around the zone
                </button>
                <button type="button" className="hz-toggle" aria-pressed={range === 'full'} onClick={() => setRange('full')}>
                  Whole catalogue
                </button>
              </fieldset>
              <button type="button" className="hz-toggle" aria-pressed={showErrors} onClick={() => setShowErrors((v) => !v)}>
                Flux uncertainty bars
              </button>
            </div>
            <HZDiagram planets={filtered} range={range} showErrors={showErrors} onOpen={(id) => navigate(`/planet/${id}`)} />
            <div className="hz-legend" aria-hidden="true">
              <span>
                <span className="hz-band-swatch" style={{ '--sw': 'var(--hab-band-cons)' }} /> Conservative zone
              </span>
              <span>
                <span className="hz-band-swatch" style={{ '--sw': 'var(--hab-band-opt)' }} /> Optimistic zone
              </span>
              {SIZE_CLASSES.map((sc) => (
                <span key={sc.key}>
                  <span className={`hz-swatch${sc.key === 'unknown' ? ' hz-swatch--hollow' : ''}`} style={{ '--sw': SWATCH[sc.key] }} /> {sc.label}
                </span>
              ))}
            </div>
          </section>

          <section className="hz-section" aria-labelledby="hz-table">
            <h2 id="hz-table" className="hz-h2">
              Planets with habitable-zone flux ({fmt(zoneRows.length)})
            </h2>
            <p className="hz-sub">Planets in a conservative or optimistic zone, or straddling a boundary within their uncertainties. Open a profile for every indicator and how it was assessed.</p>
            <div className="hz-table-wrap">
              <table className="hz-table">
                <thead>
                  <tr>
                    {[
                      ['name', 'Planet'],
                      ['placement', 'Estimated placement'],
                      ['flux', 'Flux (S⊕)'],
                      ['teff', 'Star (K)'],
                      ['radius', 'Radius (R⊕)'],
                      ['mass', 'Mass (M⊕)'],
                      ['tier', 'Summary'],
                    ].map(([key, label]) => (
                      <th key={key} aria-sort={ariaSort(key)} scope="col">
                        {SORTS[key] ? (
                          <button type="button" onClick={() => sortBy(key)}>
                            {label}
                            {sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                          </button>
                        ) : (
                          label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(showAll ? zoneRows : zoneRows.slice(0, 40)).map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/planet/${p.id}`}>{p.name}</Link>
                      </td>
                      <td>
                        {SHORT[p.placement]}
                        {p.straddles && <span className="hz-prov">straddles a boundary</span>}
                      </td>
                      <td className="num">
                        {withErr(p.flux.value, p.flux.err)}
                        <span className="hz-prov">{p.flux.calculated ? 'calculated' : p.flux.status}</span>
                      </td>
                      <td className="num">
                        {withErr(p.teff.value, p.teff.err)}
                        {p.spectralType && <span className="hz-prov">{p.spectralType}</span>}
                      </td>
                      <td className="num">
                        {p.radius ? withErr(p.radius.value, p.radius.err) : 'Unavailable'}
                        {p.radius && <span className="hz-prov">{p.radius.status}</span>}
                      </td>
                      <td className="num">
                        {p.mass ? Number(p.mass.value.toPrecision(3)) : 'Unavailable'}
                        {p.mass && <span className="hz-prov">{p.mass.kind === 'Msini' ? 'minimum (M sin i)' : p.mass.kind === 'M-R' ? 'estimated' : p.mass.status}</span>}
                      </td>
                      <td>{TIERS[p.tier]?.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {zoneRows.length > 40 && (
              <button type="button" className="hz-toggle hz-more" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${fmt(zoneRows.length)}`}
              </button>
            )}
          </section>

          <section className="hz-section" aria-labelledby="hz-coverage">
            <h2 id="hz-coverage" className="hz-h2">
              Why some planets are not placed
            </h2>
            <div className="hz-stats" role="list">
              <Stat n={c.fluxMissing} label="No stellar flux (catalogue or calculable)" />
              <Stat n={c.teffMissing} label="No stellar temperature" />
              <Stat n={c.teffUnsupported} label={`Star outside ${fmt(TEFF_MIN_K)}–${fmt(TEFF_MAX_K)} K`} />
              <Stat n={c.evolvedStar} label="Evolved host star (giant)" />
            </div>
            <p className="hz-sub">Missing values are never filled with medians or guesses; these planets are counted, not plotted.</p>
          </section>

          <section className="hz-section" aria-labelledby="hz-method">
            <h2 id="hz-method" className="hz-h2">
              Method and thresholds
            </h2>
            <div className="hz-method">
              <div>
                <h3>Habitable-zone boundaries</h3>
                <p>
                  <code>S_eff = S☉ + a·T + b·T² + c·T³ + d·T⁴</code>, <code>T = Teff − 5780 K</code>, from{' '}
                  <a href={REFERENCE.url} target="_blank" rel="noopener noreferrer">
                    {REFERENCE.label}
                  </a>{' '}
                  for a 1 Earth-mass planet. Conservative: runaway greenhouse → maximum greenhouse. Optimistic: Recent Venus → Early Mars. Valid for {fmt(TEFF_MIN_K)}–{fmt(TEFF_MAX_K)} K main-sequence stars.
                </p>
              </div>
              <div>
                <h3>Placement and uncertainty</h3>
                <p>
                  The planet's catalogue insolation (or <code>S = L★/a²</code> from catalogue luminosity and orbit) is compared with the boundaries. The flux uncertainty and the boundary shift from the star-temperature uncertainty are both checked; a planet whose range crosses a boundary is marked as straddling it.
                </p>
              </div>
              <div>
                <h3>Other indicators (on each profile)</h3>
                <ul>
                  <li>Size: ≤ {RULES.rockyRadiusMax} R⊕ rocky range, {RULES.rockyRadiusMax}–{RULES.volatileRadiusMin} R⊕ transition, &gt; {RULES.volatileRadiusMin} R⊕ volatile-rich (population trends).</li>
                  <li>Mass: {RULES.massMin}–{RULES.massMax} M⊕; minimum masses and estimates are flagged.</li>
                  <li>Host star: M-dwarf flare and tidal-locking caveats; hot stars outside the model.</li>
                  <li>Equilibrium temperature and gravity: context only. Atmosphere: always unknown.</li>
                </ul>
              </div>
              <div>
                <h3>What this is not</h3>
                <p>
                  No score, percentage or probability is computed. A habitable-zone placement says nothing about atmospheres, water or life; the summary labels describe the indicators, not habitability. Thresholds are pending science review.
                </p>
              </div>
            </div>
          </section>
          <p className="hz-sub">
            Catalogue retrieved {new Date(data.generatedAt).toUTCString().replace(' GMT', ' UTC')} from the NASA Exoplanet Archive.
          </p>
        </>
      )}
    </div>
  )
}
