// Orbital Simulator — owner: LEAD (M3). One template for every planet; used
// by OrbitPage (/planet/:id/orbit, store catalog) and /lab/orbit.
//
// Time model: the clock holds a time t in days. For planets whose phase is
// anchored to an observation, t is a Julian Date and real dates are shown
// only while realDateReliability() allows. Otherwise t is illustrative
// simulation time counted from an arbitrary periastron.

import { ArrowLeft, ChevronLeft, ChevronRight, Pause, Play, Repeat, SkipBack } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import MeasurementRow from '../../components/data/MeasurementRow.jsx'
import { isScientific } from '../../contracts/planet.js'
import {
  AU_KM,
  EARTH_ORBITAL_SPEED,
  GM_SUN,
  dateFromJd,
  jdFromDate,
  orbitExtremes,
  orbitState,
  orbitalElements,
  realDateReliability,
  transitPhase,
} from '../../science/kepler.js'
import { sig } from '../../three/shared/format.js'
import OrbitViewport from '../../three/viewports/OrbitViewport.jsx'
import './OrbitSimulator.css'

const SPEEDS = [
  { secondsPerOrbit: 60, label: '60 s' },
  { secondsPerOrbit: 20, label: '20 s' },
  { secondsPerOrbit: 8, label: '8 s' },
]
const STEP_FRACTION = 0.01
const RAD = 180 / Math.PI

function formatDuration(days) {
  const d = Math.abs(days)
  if (d < 1 / 1440) return `${sig(d * 86400, 2)} s`
  if (d < 1 / 24) return `${sig(d * 1440, 2)} min`
  if (d < 2) return `${sig(d * 24)} h`
  if (d < 730) return `${sig(d)} d`
  return `${sig(d / 365.25)} yr`
}

function formatDate(jd) {
  return (
    dateFromJd(jd).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC'
  )
}

/**
 * @param {Object} props
 * @param {import('../../contracts/planet.js').Planet} props.planet
 * @param {string} props.profileHref
 * @param {boolean} [props.reducedMotion]
 */
export default function OrbitSimulator({ planet, profileHref, reducedMotion = false }) {
  const el = useMemo(() => orbitalElements(planet), [planet])
  if (!el) {
    return (
      <div className="os-unavailable">
        <p className="os-kicker">Orbital simulator</p>
        <h1>{planet.name}</h1>
        <p>This planet has no orbital period in the NASA catalog, so its orbit cannot be simulated.</p>
        <Link to={profileHref} className="os-back">
          <ArrowLeft size={14} /> Back to planet
        </Link>
      </div>
    )
  }
  return <Simulator key={planet.id} planet={planet} el={el} profileHref={profileHref} reducedMotion={reducedMotion} />
}

function Simulator({ planet, el, profileHref, reducedMotion }) {
  const ext = useMemo(() => orbitExtremes(el), [el])
  const ellipse = el.eStatus === 'measured' && el.e > 0
  const tPhase = useMemo(() => transitPhase(el), [el])
  const anchored = el.anchor.kind !== 'none'
  const physical = el.aSource !== 'normalised'

  const clockRef = useRef({ t: el.anchor.tp, playing: !reducedMotion, rate: el.P / 20, direction: 1 })
  const clock = useMemo(
    () => ({
      step(dt) {
        const c = clockRef.current
        if (c.playing) c.t += dt * c.rate * c.direction
        return c.t
      },
      direction: () => clockRef.current.direction,
    }),
    [],
  )

  const [t, setT] = useState(el.anchor.tp)
  const [playing, setPlayingState] = useState(!reducedMotion)
  const [speed, setSpeedState] = useState(20)
  const [direction, setDirectionState] = useState(1)
  const drag = useRef(null)

  // Mirror the clock into React at ~12 Hz for readouts (the scene reads it every frame).
  useEffect(() => {
    const id = setInterval(() => setT(clockRef.current.t), 80)
    return () => clearInterval(id)
  }, [])

  const setPlaying = (v) => {
    clockRef.current.playing = v
    setPlayingState(v)
  }
  const setSpeed = (secondsPerOrbit) => {
    clockRef.current.rate = el.P / secondsPerOrbit
    setSpeedState(secondsPerOrbit)
  }
  const setTime = (value) => {
    clockRef.current.t = value
    setT(value)
  }

  // Current orbit window [start, start + P), counted from the reference periastron.
  const k = Math.floor((t - el.anchor.tp) / el.P)
  const windowStart = el.anchor.tp + k * el.P
  const frac = (t - windowStart) / el.P
  const state = orbitState(el, t)
  const reliability = realDateReliability(el, t)

  const nowJd = jdFromDate(new Date())
  const nowReliability = useMemo(() => realDateReliability(el, nowJd), [el, nowJd])
  const nowInWindow = nowReliability.ok && nowJd >= windowStart && nowJd < windowStart + el.P

  const step = (sign) => {
    setPlaying(false)
    setTime(t + sign * STEP_FRACTION * el.P)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, select, textarea')) return
      if (e.code === 'Space') {
        e.preventDefault()
        setPlaying(!clockRef.current.playing)
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        clockRef.current.playing = false
        setPlayingState(false)
        setTime(clockRef.current.t + (e.key === 'ArrowRight' ? 1 : -1) * STEP_FRACTION * el.P)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [el])

  // Facts with provenance. Derived values carry their formula as `basis`.
  const gmAU = el.gm != null ? el.gm : null
  const aQuantity =
    el.aSource === 'catalog'
      ? planet.semiMajorAxisAU
      : el.aSource === 'kepler'
        ? { value: el.a, status: 'calculated', basis: "Kepler's third law from period and star mass" }
        : null
  const eQuantity =
    el.eStatus === 'assumed'
      ? { ...planet.eccentricity, assumed: true, basis: 'Fixed at 0 (circular orbit) in the source fit; not measured' }
      : planet.eccentricity
  const extremesReason =
    el.eStatus === 'measured' ? undefined : 'Requires a measured eccentricity'
  const viva = 'vis-viva: v = √(GM★(2/r − 1/a)); uncertainty not propagated'
  const circularSpeed =
    !ellipse && physical && gmAU != null
      ? { value: Math.sqrt(GM_SUN * el.starMassSun / (el.a * AU_KM)), status: 'calculated', basis: 'v = √(GM★/a), assuming the circular orbit above' }
      : null

  // Without a measured ellipse there is no periastron: phase 0 is just the
  // reference point (the transit for transit-anchored circular orbits).
  const refLabel = ellipse ? 'periastron' : tPhase === 0 ? 'transit' : 'the reference point'
  const markers = [
    ...(ellipse
      ? [
          { at: 0, label: 'Periastron', kind: 'peri' },
          { at: 0.5, label: 'Apoastron', kind: 'apo' },
        ]
      : tPhase === 0
        ? []
        : [{ at: 0, label: 'Start', kind: 'peri' }]),
    ...(tPhase != null ? [{ at: tPhase, label: 'Transit', kind: 'transit' }] : []),
    ...(nowInWindow ? [{ at: (nowJd - windowStart) / el.P, label: 'Today', kind: 'now' }] : []),
  ]

  return (
    <div className="os">
      <section className="os-stage">
        <OrbitViewport planet={planet} el={el} clock={clock} />

        <header className="os-head">
          <Link to={profileHref} className="os-back">
            <ArrowLeft size={14} /> {planet.name}
          </Link>
          <p className="os-kicker">Orbital simulator</p>
          <h1 className="os-title">{planet.name}</h1>
          <p className="os-sub">
            around {planet.host} · period {formatDuration(el.P)} · e = {el.e}
            {el.eStatus !== 'measured' && ` (${el.eStatus})`}
          </p>
        </header>

        <div className={`os-time ${reliability.ok ? 'is-real' : 'is-sim'}`} aria-live="polite">
          <p className="os-time__mode">{reliability.ok ? 'Real-date positioning' : 'Illustrative simulation time'}</p>
          {reliability.ok ? (
            <>
              <p className="os-time__value">{formatDate(t)}</p>
              <p className="os-time__note">
                ±{formatDuration(reliability.uncertainty.sigmaDays)} timing uncertainty
                {!reliability.uncertainty.complete && ' (lower bound)'}
              </p>
            </>
          ) : (
            <>
              <p className="os-time__value">
                {formatDuration(t - windowStart)} after {refLabel}
              </p>
              <p className="os-time__note">{reliability.reason}</p>
            </>
          )}
          {anchored &&
            (nowReliability.ok ? (
              <button
                type="button"
                className="os-today"
                onClick={() => {
                  setPlaying(false)
                  setTime(nowJd)
                }}
              >
                Show today&apos;s position
              </button>
            ) : (
              <p className="os-time__note os-time__note--warn">Today&apos;s position unavailable: {nowReliability.reason}</p>
            ))}
        </div>
      </section>

      <section className="os-controls" aria-label="Time controls">
        <div className="os-timeline">
          <input
            type="range"
            min={0}
            max={1}
            step={0.0005}
            value={frac}
            aria-label="Position in orbit"
            aria-valuetext={`${(frac * 100).toFixed(1)}% of the orbit after periastron`}
            onPointerDown={() => {
              drag.current = { k, wasPlaying: clockRef.current.playing }
              setPlaying(false)
            }}
            onPointerUp={() => {
              if (drag.current?.wasPlaying) setPlaying(true)
              drag.current = null
            }}
            onChange={(e) => {
              const kk = drag.current?.k ?? k
              setTime(el.anchor.tp + (kk + Number(e.target.value)) * el.P)
            }}
          />
          <div className="os-markers" aria-hidden="true">
            {markers.map((m, i) => (
              <span
                key={m.kind}
                className={`os-marker os-marker--${m.kind}${markers.slice(0, i).some((o) => Math.abs(o.at - m.at) < 0.09) ? ' is-stacked' : ''}`}
                style={{ left: `${m.at * 100}%` }}
              >
                <i />
                {m.label}
              </span>
            ))}
          </div>
        </div>

        <div className="os-buttons">
          <button type="button" onClick={() => setTime(windowStart)} aria-label={`Reset to ${refLabel}`} title={`Reset to ${refLabel}`}>
            <SkipBack size={15} />
          </button>
          <button type="button" onClick={() => step(-1)} aria-label="Step back 1% of an orbit" title="Step back (←)">
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="os-play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Step forward 1% of an orbit" title="Step forward (→)">
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            className={direction < 0 ? 'is-active' : undefined}
            onClick={() => {
              clockRef.current.direction *= -1
              setDirectionState(clockRef.current.direction)
            }}
            aria-pressed={direction < 0}
            aria-label="Reverse time"
            title="Reverse time"
          >
            <Repeat size={15} />
          </button>
          <div className="os-speeds" role="radiogroup" aria-label="Orbit duration on screen">
            {SPEEDS.map((sp) => (
              <button
                key={sp.secondsPerOrbit}
                type="button"
                role="radio"
                aria-checked={speed === sp.secondsPerOrbit}
                className={speed === sp.secondsPerOrbit ? 'is-active' : undefined}
                onClick={() => setSpeed(sp.secondsPerOrbit)}
              >
                {sp.label}
              </button>
            ))}
          </div>
          <span className="os-rate">1 s ≈ {formatDuration(el.P / speed)} · orbit {k >= 0 ? k + 1 : k}</span>
        </div>
      </section>

      <aside className="os-panel">
        <h2 className="os-panel__title">Live</h2>
        <dl className="os-live">
          <div>
            <dt>Distance from star</dt>
            <dd>
              {physical ? `${sig(state.rAU)} AU` : `${sig(state.rAU / el.a)} a`}
              {physical && <span>{sig((state.rAU * AU_KM) / 1e6)} million km</span>}
              {physical && el.starRadiusAU && <span>{sig(state.rAU / el.starRadiusAU)} star radii</span>}
            </dd>
          </div>
          <div>
            <dt>Orbital speed</dt>
            <dd>
              {state.speedKmS != null ? `${sig(state.speedKmS)} km/s` : 'Unavailable'}
              {state.speedKmS != null && <span>{sig(state.speedKmS / EARTH_ORBITAL_SPEED)} × Earth&apos;s</span>}
            </dd>
          </div>
          <div>
            <dt>Time since {refLabel}</dt>
            <dd>
              {formatDuration(t - windowStart)}
              <span>{reliability.ok ? 'real time' : 'simulation time'}</span>
            </dd>
          </div>
          <div>
            <dt>Orbital phase</dt>
            <dd>
              {(state.phase * 100).toFixed(1)}%
              <span>true anomaly {(state.trueAnomaly * RAD).toFixed(1)}°</span>
            </dd>
          </div>
        </dl>

        <h2 className="os-panel__title">Orbit</h2>
        <dl className="os-facts">
          <MeasurementRow label="Orbital period" q={planet.periodDays} unit="days" />
          <MeasurementRow label="Semi-major axis" q={aQuantity} unit="AU" unavailableReason="Requires a catalog value or star mass" />
          <MeasurementRow label="Eccentricity" q={eQuantity} />
          <MeasurementRow label="Inclination" q={planet.inclinationDeg} unit="°" />
          {ellipse && <MeasurementRow label="Argument of periastron" q={el.omegaStatus === 'catalog' ? planet.periastronArgDeg : null} unit="°" unavailableReason="Orientation drawn with an assumed ω = 90°" />}
          <MeasurementRow
            label="Periastron"
            q={ellipse && physical ? { value: ext.periastronAU, status: 'calculated', basis: 'a(1 − e)' } : null}
            unit="AU"
            unavailableReason={extremesReason}
          />
          <MeasurementRow
            label="Apoastron"
            q={ellipse && physical ? { value: ext.apoastronAU, status: 'calculated', basis: 'a(1 + e)' } : null}
            unit="AU"
            unavailableReason={extremesReason}
          />
          {ellipse ? (
            <>
              <MeasurementRow label="Speed at periastron" q={ext.speedPeriKmS != null ? { value: ext.speedPeriKmS, status: 'calculated', basis: viva } : null} unit="km/s" unavailableReason="Requires star mass and semi-major axis" />
              <MeasurementRow label="Speed at apoastron" q={ext.speedApoKmS != null ? { value: ext.speedApoKmS, status: 'calculated', basis: viva } : null} unit="km/s" unavailableReason="Requires star mass and semi-major axis" />
            </>
          ) : (
            <MeasurementRow label="Orbital speed" q={circularSpeed} unit="km/s" unavailableReason="Requires star mass and semi-major axis" />
          )}
          <MeasurementRow label="Star mass" q={isScientific(planet.star?.massSun) ? planet.star.massSun : null} unit="M☉" />
        </dl>

        {el.assumptions.length > 0 && (
          <>
            <h2 className="os-panel__title">Assumptions</h2>
            <ul className="os-assumptions">
              {el.assumptions.map((a) => (
                <li key={a.key}>{a.text}</li>
              ))}
            </ul>
          </>
        )}
        <p className="os-method">
          Positions from Kepler&apos;s equation, speeds from the vis-viva equation, for a two-body orbit with the
          planet&apos;s mass neglected. Real dates appear only when the propagated timing uncertainty is under 5% of an
          orbit (1% when the reference-time error is not in the dataset).
        </p>
      </aside>
    </div>
  )
}
