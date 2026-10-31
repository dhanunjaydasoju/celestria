// App frame: header with side-drawer navigation, page outlet — owner: UI
// (D2.2; drawer implemented by LEAD on request).

import { ChevronDown, Menu, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useCelestria } from '../store/useCelestria.js'
import './AppShell.css'

// `planets: true` marks the entry whose planet list can be expanded.
const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/explore', label: 'System View' },
  { to: '/viewport', label: 'Planet Viewport', planets: true },
  { to: '/orbit', label: 'Orbital Simulator' },
  { to: '/about', label: 'About' },
]

export default function AppShell() {
  const [open, setOpen] = useState(false)
  const [planetsOpen, setPlanetsOpen] = useState(false)
  const planets = useCelestria((st) => st.planets)
  const planetGroups = useMemo(() => {
    const m = new Map()
    for (const p of planets) m.set(p.host, [...(m.get(p.host) ?? []), p])
    return [...m.entries()]
  }, [planets])
  const menuButton = useRef(null)
  const firstLink = useRef(null)

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
      </header>

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
                      planetGroups.map(([host, list]) => (
                        <div key={host} className="app-drawer__group">
                          <p className="app-drawer__host">{host}</p>
                          {list.map((p) => (
                            <NavLink key={p.id} to={`/viewport/${p.id}`} onClick={() => setOpen(false)}>
                              {p.name}
                            </NavLink>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {import.meta.env.DEV && (
          <NavLink to="/lab" className="app-drawer__dev" onClick={() => setOpen(false)}>
            3D Lab (development)
          </NavLink>
        )}
        <p className="app-drawer__foot">Explore Worlds Beyond Our Solar System.</p>
      </nav>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
