// owner: LEAD (M3). Orbital Simulator over the store's catalog.
import { useParams } from 'react-router'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'
import { useCelestria } from '../store/useCelestria.js'
import OrbitSimulator from './orbit/OrbitSimulator.jsx'

export default function OrbitPage() {
  const { id } = useParams()
  const status = useCelestria((s) => s.catalogStatus)
  const planet = useCelestria((s) => s.byId[id])
  const reducedMotion = useCelestria((s) => s.reducedMotion)

  if (!planet) {
    return (
      <PagePlaceholder title="Orbital simulator" owner="LEAD" deliverable="M3 Orbital Simulator">
        <p>
          {status === 'loading' || status === 'idle'
            ? 'Loading catalog…'
            : `No planet with id "${id}" in the catalog. The live NASA catalog arrives with D3.4.`}
        </p>
      </PagePlaceholder>
    )
  }
  return <OrbitSimulator planet={planet} profileHref={`/planet/${id}`} reducedMotion={reducedMotion} />
}
