// owner: UI (D2.2). Will embed <HeroScene /> from three/viewports (LEAD, M5).
import { Link } from 'react-router'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'

export default function LandingPage() {
  return (
    <PagePlaceholder title="Explore Worlds Beyond Our Solar System">
      <p>
        <Link to="/explore">Enter the observatory</Link>
      </p>
    </PagePlaceholder>
  )
}
