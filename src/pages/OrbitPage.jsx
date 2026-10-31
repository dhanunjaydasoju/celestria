// owner: LEAD (M3). Orbital Simulator over the store's catalog.
import { useEffect } from 'react'
import { useParams } from 'react-router'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'
import { useCelestria } from '../store/useCelestria.js'
import OrbitSimulator from './orbit/OrbitSimulator.jsx'

export default function OrbitPage() {
  const { id } = useParams()
  const status = useCelestria((s) => s.catalogStatus)
  const indexPlanet = useCelestria((s) => s.byId[id])
  const detail = useCelestria((s) => s.details[id])
  const detailStatus = useCelestria((s) => s.detailStatus[id])
  const loadDetail = useCelestria((s) => s.loadDetail)
  const reducedMotion = useCelestria((s) => s.reducedMotion)

  useEffect(() => {
    if (indexPlanet) loadDetail(id)
  }, [id, indexPlanet, loadDetail])

  // Real-date reliability depends on uncertainties, which only the full
  // record carries, so wait for it (fall back to the index on error).
  const planet = detail ?? (detailStatus === 'error' ? indexPlanet : null)

  if (indexPlanet && !planet) {
    return (
      <PagePlaceholder title="Orbital simulator" owner="LEAD" deliverable="M3 Orbital Simulator">
        <p>Loading {indexPlanet.name}…</p>
      </PagePlaceholder>
    )
  }

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
