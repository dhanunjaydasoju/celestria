// About — owner: UI. Placeholder.
import { SyncPanel } from '../components/sync/SyncStatus.jsx'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'

export default function AboutPage() {
  return (
    <PagePlaceholder title="About CELESTRIA">
      <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
        CELESTRIA is an interactive exploration of confirmed exoplanets built on the NASA Exoplanet Archive. Every
        value shows its source and whether it was measured, calculated or estimated; 3D planets are artistic
        impressions. More about the project, data and team will appear here.
      </p>
      <SyncPanel />
    </PagePlaceholder>
  )
}
