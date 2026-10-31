// App frame: header with side-drawer navigation, page outlet — owner: UI
// (D2.2; drawer implemented by LEAD on request).

import { Menu, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import './AppShell.css'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/explore', label: 'Explore' },
  { to: '/orbit', label: 'Orbital Simulator' },
  { to: '/about', label: 'About' },
]

export default function AppShell() {
  const [open, setOpen] = useState(false)
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
              <NavLink ref={i === 0 ? firstLink : undefined} to={item.to} end={item.end} onClick={() => setOpen(false)}>
                {item.label}
              </NavLink>
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
