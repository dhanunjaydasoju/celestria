// owner: LEAD (M3). Dedicated orbital simulator: host star, planet, orbit only.
import { Link, useParams } from 'react-router'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'
import { useCelestria } from '../store/useCelestria.js'

export default function OrbitPage() {
  const { id } = useParams()
  const planet = useCelestria((s) => s.byId[id])
  return (
    <PagePlaceholder title={`Orbital Simulator: ${planet?.name ?? id}`} owner="LEAD" deliverable="M3 Orbital Simulator">
      <p>
        <Link to={`/planet/${id}`}>Back to profile</Link>
      </p>
    </PagePlaceholder>
  )
}
