// owner: UI.
import { Link } from 'react-router'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'

export default function NotFoundPage() {
  return (
    <PagePlaceholder title="Page not found">
      <Link to="/">Return to CELESTRIA</Link>
    </PagePlaceholder>
  )
}
