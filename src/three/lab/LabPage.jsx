// Dev-only 3D sandbox — owner: LEAD. Mounts one viewport against a chosen
// fixture so each 3D component is built and tested in isolation (CLAUDE.md §12).
// Registered in App.jsx only when import.meta.env.DEV is true.

import { NavLink, useParams } from 'react-router'
import { fixturePlanets } from '../../data/fixtures/index.js'

// Filled in as viewports land: { key, label, Component, defaultProps(fixture) }.
const VIEWPORTS = []

export default function LabPage() {
  const { viewport } = useParams()
  const active = VIEWPORTS.find((v) => v.key === viewport)
  return (
    <section style={{ padding: 'var(--space-6)' }}>
      <h1 style={{ marginTop: 0 }}>3D Lab</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Development only. {fixturePlanets.length} fixtures loaded.
        {VIEWPORTS.length === 0 && ' No viewports registered yet (M1).'}
      </p>
      <nav style={{ display: 'flex', gap: 'var(--space-4)' }}>
        {VIEWPORTS.map((v) => (
          <NavLink key={v.key} to={`/lab/${v.key}`}>
            {v.label}
          </NavLink>
        ))}
      </nav>
      {active && <active.Component {...active.defaultProps(fixturePlanets[0])} />}
    </section>
  )
}
