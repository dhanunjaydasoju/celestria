// owner: UI (D2.3). Search, filter and sort over the store's catalog.
import { Link } from 'react-router'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'
import { useCelestria } from '../store/useCelestria.js'

export default function CatalogPage() {
  const status = useCelestria((s) => s.catalogStatus)
  const planets = useCelestria((s) => s.planets)
  return (
    <PagePlaceholder title="Catalog" owner="UI" deliverable="D2.3 Search / filter / sort">
      <p className="num">
        Catalog: {status} · {planets.length} planets
      </p>
      <ul>
        {planets.map((p) => (
          <li key={p.id}>
            <Link to={`/planet/${p.id}`}>{p.name}</Link>
          </li>
        ))}
      </ul>
    </PagePlaceholder>
  )
}
