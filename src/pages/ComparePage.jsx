// owner: UI (D2.5). Embeds <SizeCompareViewport /> (LEAD, M6).
import PagePlaceholder from '../layout/PagePlaceholder.jsx'
import { useCelestria } from '../store/useCelestria.js'

export default function ComparePage() {
  const compareIds = useCelestria((s) => s.compareIds)
  return (
    <PagePlaceholder title="Compare" owner="UI" deliverable="D2.5 Comparison">
      <p className="num">{compareIds.length} selected</p>
    </PagePlaceholder>
  )
}
