// App frame: header with side-drawer navigation, page outlet — owner: UI
// (D2.2; drawer implemented by LEAD on request).

import { ChevronDown, Menu, Telescope, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import AstronomerDrawer from '../components/ai/AstronomerDrawer.jsx'
import { DataFreshness, UpdateNotice } from '../components/sync/SyncStatus.jsx'
import { FEATURED_PLANET_IDS } from '../data/featured.js'
import { useCelestria } from '../store/useCelestria.js'
import './AppShell.css'

// `planets: true` marks the entry whose planet list can be expanded.
const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/explore', label: 'System View' },
  { to: '/viewport', label: 'Planet Viewport', planets: true },
  { to: '/orbit', label: 'Orbital Simulator' },
  { to: '/habitability', label: 'Habitability' },
  { to: '/about', label: 'About' },
]

export default function AppShell() {
  const [open, setOpen] = useState(false)
  const [planetsOpen, setPlanetsOpen] = useState(false)
  const planets = useCelestria((st) => st.planets)
  const byId = useCelestria((st) => st.byId)
  // Featured planets only (the full catalogue is ~6,500); "Browse all" leads
  // to Planet Viewport's searchable picker.
  const planetGroups = useMemo(() => {
    const m = new Map()
    for (const p of FEATURED_PLANET_IDS.map((id) => byId[id]).filter(Boolean)) m.set(p.host, [...(m.get(p.host) ?? []), p])
    return [...m.entries()]
  }, [byId])
  const menuButton = useRef(null)
  const firstLink = useRef(null)
  const astronomerButton = useRef(null)
  const astronomerOpen = useCelestria((st) => st.astronomerOpen)
  const astronomerBusy = useCelestria((st) => st.astronomerTurns.some((t) => t.status === 'pending'))
  const openAstronomer = useCelestria((st) => st.openAstronomer)
  const closeAstronomer = useCelestria((st) => st.closeAstronomer)

  // Escape closes; focus moves into the drawer and back to the button.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    firstLink.current?.focus()
    const button = menuButton.current
    return () => {
      window.removeEventListener('keydown', onKey)
      button?.focus({ preventScroll: true })
    }
  }, [open])

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          ref={menuButton}
          type="button"
          className="app-menu-btn"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="app-drawer"
          onClick={() => setOpen(true)}
        >
          <Menu size={20} strokeWidth={1.6} />
        </button>
        <NavLink to="/" className="app-wordmark">
          CELESTRIA
        </NavLink>
        <button
          ref={astronomerButton}
          type="button"
          className="ai-trigger"
          aria-expanded={astronomerOpen}
          aria-controls="astronomer"
          aria-label="Ask the Astronomer"
          onClick={() => (astronomerOpen ? closeAstronomer() : openAstronomer())}
        >
          <Telescope size={16} strokeWidth={1.6} aria-hidden="true" />
          <span className="ai-trigger__label">Ask the Astronomer</span>
          {astronomerBusy && <span className="ai-trigger__dot" aria-label="answering" />}
        </button>
      </header>
      <UpdateNotice />
      <AstronomerDrawer returnFocusRef={astronomerButton} />

      <div className={`app-backdrop${open ? ' is-open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <nav
        id="app-drawer"
        className={`app-drawer${open ? ' is-open' : ''}`}
        aria-label="Main"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="app-drawer__head">
          <span className="app-wordmark app-wordmark--small">CELESTRIA</span>
          <button type="button" className="app-menu-btn" aria-label="Close menu" onClick={() => setOpen(false)}>
            <X size={18} strokeWidth={1.6} />
          </button>
        </div>
        <ul className="app-drawer__list">
          {NAV.map((item, i) => (
            <li key={item.to} style={{ '--i': i }}>
              <div className="app-drawer__row">
                <NavLink ref={i === 0 ? firstLink : undefined} to={item.to} end={item.end} onClick={() => setOpen(false)}>
                  {item.label}
                </NavLink>
                {item.planets && (
                  <button
                    type="button"
                    className={`app-drawer__expand${planetsOpen ? ' is-open' : ''}`}
                    aria-expanded={planetsOpen}
                    aria-controls="app-drawer-planets"
                    aria-label={`${planetsOpen ? 'Hide' : 'Show'} planet list`}
                    onClick={() => setPlanetsOpen((v) => !v)}
                  >
                    <ChevronDown size={18} strokeWidth={1.6} />
                  </button>
                )}
              </div>
              {item.planets && (
                <div
                  id="app-drawer-planets"
                  className={`app-drawer__sub${planetsOpen ? ' is-open' : ''}`}
                  aria-hidden={!planetsOpen}
                  inert={!planetsOpen}
                >
                  <div className="app-drawer__sub-inner">
                    {planetGroups.length === 0 ? (
                      <p className="app-drawer__empty">Planets appear here once the catalog has loaded.</p>
                    ) : (
                      <>
                        <p className="app-drawer__host app-drawer__featured">Featured planets</p>
                        {planetGroups.map(([host, list]) => (
                          <div key={host} className="app-drawer__group">
                            {list.map((p) => (
                              <NavLink key={p.id} to={`/viewport/${p.id}`} onClick={() => setOpen(false)}>
                                {p.name}
                              </NavLink>
                            ))}
                          </div>
                        ))}
                        <NavLink to="/viewport" className="app-drawer__all" onClick={() => setOpen(false)} end>
                          Browse all {planets.length.toLocaleString('en-US')} planets →
                        </NavLink>
                      </>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="app-drawer__ask"
          onClick={() => {
            setOpen(false)
            openAstronomer()
          }}
        >
          <Telescope size={16} strokeWidth={1.6} aria-hidden="true" /> Ask the Astronomer
        </button>
        {import.meta.env.DEV && (
          <NavLink to="/lab" className="app-drawer__dev" onClick={() => setOpen(false)}>
            3D Lab (development)
          </NavLink>
        )}
        <div className="app-drawer__foot-wrap">
          <NavLink to="/about" className="app-drawer__freshness" onClick={() => setOpen(false)}>
            <DataFreshness />
          </NavLink>
          <p className="app-drawer__foot">Explore Worlds Beyond Our Solar System.</p>
        </div>
      </nav>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
