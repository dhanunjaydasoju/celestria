// Full-screen system explorer — owner: LEAD. Wraps <SystemViewport> with
// system switching, time controls and a selected-planet card. Used by
// ExplorePage (store catalog) and /lab/system (lab fixtures).

import { Pause, Play, Scan } from 'lucide-react'
import { useMemo, useState } from 'react'
import { scienceValue } from '../../contracts/planet.js'
import { sig } from '../../three/shared/format.js'
import { buildSystemModel, groupByHost } from '../../three/system/systemModel.js'
import SystemViewport from '../../three/viewports/SystemViewport.jsx'
import PlanetInfoPanel from './PlanetInfoPanel.jsx'
import './SystemExplorer.css'

const SPEEDS = [0.25, 1, 4, 16]
const PC_TO_LY = 3.26156

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
 */
export default function SystemExplorer({ planets, host, onHostChange, profileHref, reducedMotion = false }) {
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
    />
  )
}

function SystemExplorerInner({ system, systems, onHostChange, profileHref, reducedMotion }) {
  const [selectedId, setSelectedId] = useState(null)
  const [paused, setPaused] = useState(reducedMotion)
  const [speed, setSpeed] = useState(1)
  const [resetToken, setResetToken] = useState(0)
  const model = useMemo(() => buildSystemModel(system.planets), [system])
  const selected = model.planets.find((p) => p.id === selectedId) ?? null
  const distancePc = scienceValue(system.planets[0].system?.distancePc)

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

      <label className="sx-switch">
        <span>System</span>
        <select value={system.host} onChange={(e) => onHostChange(e.target.value)}>
          {systems.map((s) => (
            <option key={s.host} value={s.host}>
              {s.host} ({s.planets.length})
            </option>
          ))}
        </select>
      </label>

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

      {selected && <PlanetInfoPanel key={selected.id} entry={selected} profileHref={profileHref(selected.id)} />}
    </div>
  )
}
