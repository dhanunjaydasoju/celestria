// Provenance label for one value — owner: UI (implemented by LEAD).
// MEASURED · CALCULATED · ESTIMATED · MINIMUM MASS · UNAVAILABLE

import './data.css'

const LABELS = {
  measured: 'Measured',
  calculated: 'Calculated',
  estimated: 'Estimated',
  minimum: 'Minimum mass',
  assumed: 'Assumed',
  missing: 'Unavailable',
}

const TITLES = {
  measured: 'Reported as a measurement in the cited publication',
  calculated: 'Derived from other values (NASA archive or CELESTRIA); see basis',
  estimated: 'Model-based estimate, e.g. a mass–radius relation',
  minimum: 'M sin i: true mass is this value or larger (orbital tilt unknown)',
  assumed: 'Fixed by assumption in the source analysis, not measured',
  missing: 'Not available in the NASA Exoplanet Archive',
}

/** @param {{ kind: keyof LABELS, title?: string }} props */
export default function ProvenanceBadge({ kind, title }) {
  return (
    <span className={`prov prov--${kind}`} title={title ?? TITLES[kind]}>
      {LABELS[kind]}
    </span>
  )
}
