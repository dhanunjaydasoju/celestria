// owner: UI.
import { Link } from 'react-router'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'

export default function NotFoundPage() {
  return (
    <PagePlaceholder title="Page not found" owner="UI" deliverable="404">
      <Link to="/">Return to CELESTRIA</Link>
    </PagePlaceholder>
  )
}
