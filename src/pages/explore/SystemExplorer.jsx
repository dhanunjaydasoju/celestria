// Full-screen system explorer — owner: LEAD. Wraps <SystemViewport> with
// system switching, time controls and a selected-planet card. Used by
// ExplorePage (store catalog) and /lab/system (lab fixtures).

import { Pause, Play, Scan } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { scienceValue } from '../../contracts/planet.js'
import { sig } from '../../three/shared/format.js'
import { buildSystemModel, groupByHost } from '../../three/system/systemModel.js'
import SystemViewport from '../../three/viewports/SystemViewport.jsx'
import PlanetPicker from '../../components/ui/PlanetPicker.jsx'
import './SystemExplorer.css'

const SPEEDS = [0.25, 1, 4, 16]
const PC_TO_LY = 3.26156

function distanceText(entry) {
  const { aAU, source, status } = entry.distance
  if (source === 'catalog') return `${sig(aAU)} AU (${status})`
  if (source === 'kepler') return `≈ ${sig(aAU)} AU (calculated, Kepler's third law)`
  return 'Unknown'
}

function starLine(star, distancePc) {
  const parts = [
    star.spectralType,
    star.teffK != null ? `${sig(star.teffK)} K` : 'Teff unknown',
    star.massSun != null ? `${sig(star.massSun)} M☉` : null,
    distancePc != null ? `${sig(distancePc)} pc (${sig(distancePc * PC_TO_LY)} ly)` : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

/**
 * @param {Object} props
 * @param {import('../../contracts/planet.js').Planet[]} props.planets   whole catalog
 * @param {string} props.host
 * @param {(host: string) => void} props.onHostChange
 * @param {(id: string) => string} props.profileHref
 * @param {boolean} [props.reducedMotion]
 * @param {(focus: { host: string, planetId: string|null }) => void} [props.onFocusChange]  shown system and selected planet (e.g. for the AI astronomer's page context)
 */
export default function SystemExplorer({ planets, host, onHostChange, profileHref, reducedMotion = false, onFocusChange }) {
  const systems = useMemo(() => groupByHost(planets), [planets])
  const system = systems.find((s) => s.host === host) ?? systems[0]
  return (
    <SystemExplorerInner
      key={system.host}
      system={system}
      systems={systems}
      onHostChange={onHostChange}
      profileHref={profileHref}
      reducedMotion={reducedMotion}
      onFocusChange={onFocusChange}
    />
  )
}

function SystemExplorerInner({ system, systems, onHostChange, profileHref, reducedMotion, onFocusChange }) {
  // Systems as picker items; before searching, the largest systems are listed.
  const systemItems = useMemo(
    () => systems.map((s) => ({ id: s.host, name: s.host, host: `${s.planets.length} planet${s.planets.length === 1 ? '' : 's'}` })),
    [systems],
  )
  const featuredSystems = useMemo(() => systems.slice(0, 25).map((s) => s.host), [systems])
  const [selectedId, setSelectedId] = useState(null)
  const [paused, setPaused] = useState(reducedMotion)
  const [speed, setSpeed] = useState(1)
  const [resetToken, setResetToken] = useState(0)
  const model = useMemo(() => buildSystemModel(system.planets), [system])
  const selected = model.planets.find((p) => p.id === selectedId) ?? null
  const distancePc = scienceValue(system.planets[0].system?.distancePc)
  useEffect(() => {
    onFocusChange?.({ host: system.host, planetId: selectedId })
  }, [onFocusChange, system.host, selectedId])

  return (
    <div className="sx">
      <SystemViewport
        host={system.host}
        planets={system.planets}
        selectedId={selectedId}
        onSelectPlanet={setSelectedId}
        paused={paused}
        timeScale={speed}
        resetToken={resetToken}
        reducedMotion={reducedMotion}
      />

      <header className="sx-head">
        <p className="sx-kicker">
          Planetary system · {system.planets.length} planet{system.planets.length === 1 ? '' : 's'}
        </p>
        <h1 className="sx-title">{system.host}</h1>
        <p className="sx-star">{starLine(model.star, distancePc)}</p>
      </header>

      <div className="sx-switch">
        <PlanetPicker
          planets={systemItems}
          value={system.host}
          onChange={onHostChange}
          label="Choose a system"
          grouped={false}
          noun="systems"
          featuredIds={featuredSystems}
        />
      </div>

      <div className="sx-controls" role="toolbar" aria-label="Simulation controls">
        <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Resume' : 'Pause'}>
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <div className="sx-speeds" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={speed === s}
              className={speed === s ? 'is-active' : undefined}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setSelectedId(null)
            setResetToken((t) => t + 1)
          }}
          aria-label="Reset view"
          title="Full-system view (Esc)"
        >
          <Scan size={15} />
        </button>
      </div>

      {selected && (
        <aside className="sx-card" aria-live="polite">
          <p className="sx-card__kicker">
            {selected.params.archetypeLabel}
            {selected.params.thermal !== 'unknown' && ` · ${selected.params.thermalLabel}`}
          </p>
          <h2 className="sx-card__title">{selected.planet.name}</h2>
          <dl>
            <dt>Orbital distance</dt>
            <dd>{distanceText(selected)}</dd>
            <dt>Orbital period</dt>
            <dd>{selected.periodDays != null ? `${sig(selected.periodDays)} days` : 'Unknown'}</dd>
            <dt>Radius</dt>
            <dd>
              {scienceValue(selected.planet.radiusEarth) != null
                ? `${sig(selected.planet.radiusEarth.value)} R⊕ (${selected.planet.radiusEarth.status})`
                : 'Unknown'}
            </dd>
          </dl>
          <Link to={profileHref(selected.id)} className="sx-card__link">
            Open planet
          </Link>
        </aside>
      )}
    </div>
  )
}
