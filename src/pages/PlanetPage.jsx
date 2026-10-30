// owner: UI (D2.4). Embeds <PlanetViewport /> (LEAD) and AI panels (AI).
import { Link, useParams } from 'react-router'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'
import { useCelestria } from '../store/useCelestria.js'

export default function PlanetPage() {
  const { id } = useParams()
  const planet = useCelestria((s) => s.byId[id])
  return (
    <PagePlaceholder title={planet?.name ?? id} owner="UI" deliverable="D2.4 Planet profile">
      <p>
        <Link to={`/planet/${id}/orbit`}>Open Orbital Simulator</Link>
      </p>
    </PagePlaceholder>
  )
}
