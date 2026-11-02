// Dev-only 3D sandbox — owner: LEAD. Mounts one viewport against a chosen
// fixture so each 3D component is built and tested in isolation (CLAUDE.md §12).
// Registered in App.jsx only when import.meta.env.DEV is true.
//
//   /lab/planet?id=<planet-id>   single PlanetViewport (← / → to cycle)
//   /lab/gallery                 all fixtures in one canvas
//   /lab/system?host=<host>      SystemExplorer over lab fixtures + synthetic test system
//   /lab/profile?id=<planet-id>  PlanetProfile (planet page template) over lab fixtures
//   /lab/orbit?id=<planet-id>    Orbital Simulator over lab fixtures
//   /lab/earth?t=<s>&still=1     homepage Earth hero on its own (craft at t seconds; still = no motion)
//   /lab/soyuz                   close-up of the Soyuz-inspired spacecraft
//   /lab/sun?q=&fit=&still=1     SUNFALL Sun on its own, with quality, framing and layer controls

import { useEffect, useMemo, useState } from 'react'
import SystemExplorer from '../../pages/explore/SystemExplorer.jsx'
import PlanetProfile from '../../pages/planet/PlanetProfile.jsx'
import OrbitSimulator from '../../pages/orbit/OrbitSimulator.jsx'
import { NavLink, useNavigate, useParams, useSearchParams } from 'react-router'
import { visualParams } from '../planet/visualParams.js'
import PlanetViewport from '../viewports/PlanetViewport.jsx'
import { labPlanets, labSource } from './fixtures.js'
import EarthHeroScene from '../viewports/EarthHeroScene.jsx'
import LabGallery from './LabGallery.jsx'
import LabSoyuz from './LabSoyuz.jsx'
import LabSun from './LabSun.jsx'
import { labTestSystemPlanets } from './testSystems.js'

const SYSTEM_PLANETS = [...labPlanets.filter((p) => !p.synthetic), ...labTestSystemPlanets]
import './LabPage.css'

const MODES = [
  { key: 'planet', label: 'PlanetViewport' },
  { key: 'gallery', label: 'Gallery' },
  { key: 'system', label: 'SystemViewport' },
  { key: 'profile', label: 'Profile' },
  { key: 'orbit', label: 'Orbit' },
  { key: 'earth', label: 'Earth hero' },
  { key: 'soyuz', label: 'Soyuz' },
  { key: 'sun', label: 'Sun (SUNFALL)' },
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
          profileHref={(id) => `/lab/profile?id=${id}`}
        />
      </div>
    )
  }

  if (viewport === 'earth' || viewport === 'soyuz' || viewport === 'sun') {
    return (
      <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - var(--header-height))' }}>
        <nav className="lab__modes lab__modes--floating" style={{ zIndex: 2 }}>
          {MODES.map((m) => (
            <NavLink key={m.key} to={`/lab/${m.key}`}>
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ position: 'absolute', inset: 0 }}>
          {viewport === 'earth' ? (
            <EarthHeroScene key={search.get('t')} startTime={Number(search.get('t')) || 0} reducedMotion={search.get('still') === '1'} />
          ) : viewport === 'sun' ? (
            <LabSun />
          ) : (
            <LabSoyuz />
          )}
        </div>
      </div>
    )
  }

  if (viewport === 'orbit') {
    return <OrbitSimulator planet={planet} profileHref={`/lab/profile?id=${planet.id}`} />
  }

  if (viewport === 'profile') {
    return (
      <PlanetProfile
        planet={planet}
        planets={labPlanets}
        planetHref={(id) => `/lab/profile?id=${id}`}
        systemHref={(host) => `/lab/system?host=${encodeURIComponent(host)}`}
        orbitHref={(id) => `/lab/orbit?id=${id}`}
        closeHref={`/lab/system?host=${encodeURIComponent(planet.host)}`}
        onSelectPlanet={(id) => navigate(`/lab/profile?id=${id}`)}
      />
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
