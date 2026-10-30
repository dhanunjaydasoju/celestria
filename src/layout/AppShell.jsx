// App frame: header, navigation, page outlet — owner: UI (D2.2).
// M0 placeholder so routes are navigable; restyle and extend freely.

import { NavLink, Outlet } from 'react-router'
import './AppShell.css'

const NAV = [
  { to: '/explore', label: 'Explore' },
  { to: '/catalog', label: 'Catalog' },
  { to: '/compare', label: 'Compare' },
]

export default function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/" className="app-wordmark">
          CELESTRIA
        </NavLink>
        <nav className="app-nav" aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
          {import.meta.env.DEV && <NavLink to="/lab">Lab</NavLink>}
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
