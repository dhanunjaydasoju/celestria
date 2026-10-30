// Dev-only 3D sandbox — owner: LEAD. Mounts one viewport against a chosen
// fixture so each 3D component is built and tested in isolation (CLAUDE.md §12).
// Registered in App.jsx only when import.meta.env.DEV is true.
//
//   /lab/planet?id=<planet-id>   single PlanetViewport (← / → to cycle)
//   /lab/gallery                 all fixtures in one canvas
//   /lab/system?host=<host>      SystemExplorer over lab fixtures + synthetic test system

import { useEffect, useMemo, useState } from 'react'
import SystemExplorer from '../../pages/explore/SystemExplorer.jsx'
import { NavLink, useNavigate, useParams, useSearchParams } from 'react-router'
import { visualParams } from '../planet/visualParams.js'
import PlanetViewport from '../viewports/PlanetViewport.jsx'
import { labPlanets, labSource } from './fixtures.js'
import LabGallery from './LabGallery.jsx'
import { labTestSystemPlanets } from './testSystems.js'

const SYSTEM_PLANETS = [...labPlanets.filter((p) => !p.synthetic), ...labTestSystemPlanets]
import './LabPage.css'

const MODES = [
  { key: 'planet', label: 'PlanetViewport' },
  { key: 'gallery', label: 'Gallery' },
  { key: 'system', label: 'SystemViewport' },
]

export default function LabPage() {
  const { viewport = 'planet' } = useParams()
  const [search, setSearch] = useSearchParams()
  const navigate = useNavigate()
  const [autoRotate, setAutoRotate] = useState(true)
  const [size, setSize] = useState('hero')

  const index = Math.max(0, labPlanets.findIndex((p) => p.id === search.get('id')))
  const planet = labPlanets[index]
  const params = useMemo(() => visualParams(planet), [planet])

  useEffect(() => {
    if (viewport !== 'planet') return
    const onKey = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      const step = e.key === 'ArrowRight' ? 1 : -1
      const next = labPlanets[(index + step + labPlanets.length) % labPlanets.length]
      setSearch({ id: next.id }, { replace: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, setSearch, viewport])

  if (viewport === 'system') {
    return (
      <div className="lab lab--system">
        <nav className="lab__modes lab__modes--floating">
          {MODES.map((m) => (
            <NavLink key={m.key} to={`/lab/${m.key}`}>
              {m.label}
            </NavLink>
          ))}
        </nav>
        <SystemExplorer
          planets={SYSTEM_PLANETS}
          host={search.get('host') ?? 'TRAPPIST-1'}
          onHostChange={(host) => setSearch({ host }, { replace: true })}
          profileHref={(id) => `/lab/planet?id=${id}`}
        />
      </div>
    )
  }

  return (
    <div className="lab">
      <aside className="lab__side">
        <p className="lab__title">3D Lab · development only</p>
        <nav className="lab__modes">
          {MODES.map((m) => (
            <NavLink key={m.key} to={`/lab/${m.key}${m.key === 'planet' ? `?id=${planet.id}` : ''}`}>
              {m.label}
            </NavLink>
          ))}
        </nav>

        <ul className="lab__list">
          {labPlanets.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={p.id === planet.id && viewport === 'planet' ? 'is-active' : undefined}
                onClick={() => navigate(`/lab/planet?id=${p.id}`)}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
        <p className="lab__source">Fixtures: {labSource}. Synthetic test planets are labelled.</p>
      </aside>

      <section className="lab__stage">
        {viewport === 'gallery' ? (
          <LabGallery planets={labPlanets} onPick={(id) => navigate(`/lab/planet?id=${id}`)} />
        ) : (
          <>
            <div className={`lab__viewport lab__viewport--${size}`}>
              <PlanetViewport key={size} planet={planet} size={size} autoRotate={autoRotate} />
            </div>
            <div className="lab__controls">
              <label>
                <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} /> spin
              </label>
              <label>
                <input type="checkbox" checked={size === 'card'} onChange={(e) => setSize(e.target.checked ? 'card' : 'hero')} />{' '}
                card size
              </label>
              <span>← / → cycle planets</span>
            </div>
            <pre className="lab__debug">
              {JSON.stringify(
                {
                  archetype: params.archetype,
                  thermal: params.thermal,
                  temperatureK: params.temperatureK && Math.round(params.temperatureK),
                  sizeBasis: params.sizeBasis,
                  thermalBasis: params.thermalBasis,
                  coverage: params.coverage,
                  imputed: params.imputed,
                  displayRadius: params.displayRadius,
                  atmosphere: params.atmosphere,
                },
                null,
                2,
              )}
            </pre>
          </>
        )}
      </section>
    </div>
  )
}
