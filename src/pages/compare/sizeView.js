// Size comparison model for /compare — owner: UI (implemented by LEAD,
// Stage 2c). Pure. Turns the comparison's radius row into drawable bodies on
// one shared scale (createSizeCompareScale, src/three/scale.js).
//
// Only catalogue radii are drawn. A missing radius or one known only as a
// limit is never given a size: it becomes an outline marked "no size".
// Model-based and NASA-calculated radii are drawn, but styled and labelled
// differently from measured ones.

import { findRow } from '../../science/compare.js'
import { createSizeCompareScale } from '../../three/scale.js'
import { formatCell } from './compareView.js'

/** Largest drawn radius in px, and the visibility-mode floor. */
export const SIZE_MAX_PX = 96
export const SIZE_MIN_PX = 12
/** Below this a true-scale circle is effectively invisible. */
const SUBPIXEL_PX = 0.75

const STYLE = {
  measured: { style: 'measured', tag: 'Measured' },
  calculated: { style: 'calculated', tag: 'Calculated by NASA' },
  estimated: { style: 'model', tag: 'Estimated' },
}

/**
 * Bodies for the size view: the compared planets in order, then Earth when
 * the reference is shown.
 * @param {ReturnType<typeof import('../../science/compare.js').buildComparison>} comparison
 * @param {{ id: string, name: string }[]} planets
 * @param {'true'|'visibility'} mode
 */
export function sizeBodies(comparison, planets, mode) {
  const row = findRow(comparison, 'radiusEarth')
  const cells = row?.cells ?? []

  const bodies = planets.map((p, i) => {
    const cell = cells[i]
    const base = { id: p.id, name: p.name, reference: false }
    if (!cell || cell.value == null) return { ...base, drawable: false, style: 'none', tag: 'Radius unavailable', reason: cell?.reason ?? null }
    if (cell.limit) {
      const f = formatCell(cell)
      return { ...base, drawable: false, style: 'none', tag: cell.limit === '<' ? 'Upper limit only' : 'Lower limit only', valueText: `${cell.limit} ${f.value} R⊕`, reason: cell.reason }
    }
    const f = formatCell(cell)
    const look = cell.modelBased ? { style: 'model', tag: 'Model-based' } : (STYLE[cell.kind] ?? STYLE.measured)
    return { ...base, drawable: true, radius: cell.value, err: cell.err, valueText: valueText(f), ...look }
  })

  if (comparison.includeEarth && row?.earth) {
    bodies.push({ id: 'earth', name: 'Earth', reference: true, drawable: true, radius: row.earth.value, err: null, valueText: '1 R⊕', style: 'reference', tag: 'Reference' })
  }

  const scale = createSizeCompareScale(bodies.map((b) => (b.drawable ? b.radius : null)), { mode, maxSceneRadius: SIZE_MAX_PX, minVisibleRadius: SIZE_MIN_PX })
  for (const b of bodies) {
    if (!b.drawable) continue
    b.px = scale.toScene(b.radius)
    b.enlarged = scale.isEnlarged(b.radius)
    b.subpixel = scale.isTrueScale && b.px < SUBPIXEL_PX
    const range = b.err ? [b.radius - Math.abs(b.err[1]), b.radius + Math.abs(b.err[0])] : null
    // The uncertainty band is drawn only at true scale, where it means something.
    b.band = scale.isTrueScale && range && range[0] > 0 ? range.map((r) => scale.toScene(r)) : null
  }

  return { bodies, note: scale.note, isTrueScale: scale.isTrueScale, drawn: bodies.filter((b) => b.drawable).length }
}

function valueText(f) {
  if (!f.plus) return `${f.value} R⊕`
  return f.symmetric ? `${f.value} ± ${f.plus} R⊕` : `${f.value} +${f.plus} −${f.minus} R⊕`
}

/** Screen-reader description of one body. */
export function describeBody(b, isTrueScale) {
  if (!b.drawable) return `${b.name}: ${b.tag.toLowerCase()}${b.valueText ? ` (${b.valueText})` : ''}; not drawn to any size.`
  const how = b.subpixel ? 'too small to see at true scale' : b.enlarged ? 'enlarged so it stays visible' : isTrueScale ? 'drawn at true relative size' : 'drawn to the shared scale'
  return `${b.name}: radius ${b.valueText}, ${b.tag.toLowerCase()}; ${how}.`
}
