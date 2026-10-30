// owner: LEAD (M2). Hosts <SystemViewport /> plus selection panels.
import { useParams } from 'react-router'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'

export default function ExplorePage() {
  const { host } = useParams()
  return (
    <PagePlaceholder title={host ? `System: ${host}` : 'Explore'} owner="LEAD" deliverable="M2 System viewer">
      <p>The interactive planetary system viewer arrives in M2.</p>
    </PagePlaceholder>
  )
}
