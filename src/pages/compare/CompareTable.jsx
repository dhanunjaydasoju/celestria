// Grouped comparison table for /compare — owner: UI (implemented by LEAD,
// Stage 2b). Desktop: one column per planet plus Earth. ≤ 860 px: each
// property becomes a block listing the planets (CSS only, same markup).
// The planet-name row is left out: the column headers and cards name them.

import { ArrowDown, ArrowUp } from 'lucide-react'
import ProvenanceBadge from '../../components/data/ProvenanceBadge.jsx'
import { sourceLabel } from '../../components/data/sourceLabel.js'
import { DERIVED_BASIS, RATIO_ROWS, formatCell, highlightOf, highlightWords, ratioText, rowNote } from './compareView.js'

const MODEL_NOTE = 'Model-based: mass and radius of a directly imaged planet come from evolutionary models'
const LIMIT_TITLE = { '<': 'Upper limit: the true value is below this', '>': 'Lower limit: the true value is above this' }

function Number_({ f, limit, unit }) {
  return (
    <span className="cmp-num">
      {limit && (
        <span className="cmp-num__limit" title={LIMIT_TITLE[limit]}>
          {limit}
        </span>
      )}
      {f.value}
      {f.plus &&
        (f.symmetric ? (
          <span className="cmp-num__err">±{f.plus}</span>
        ) : (
          <span className="cmp-num__err cmp-num__err--asym">
            <span>+{f.plus}</span>
            <span>−{f.minus}</span>
          </span>
        ))}
      {unit && <span className="cmp-num__unit">{unit}</span>}
    </span>
  )
}

function QuantityCell({ row, cell, name }) {
  if (cell.value == null) {
    return (
      <td className="cmp-cell cmp-cell--missing" data-label={name}>
        <span className="cmp-missing" title={cell.reason ?? undefined}>
          Unavailable
        </span>
      </td>
    )
  }
  const f = formatCell(cell, { derived: row.derived })
  const hl = highlightOf(row.ranking, cell.planetId)
  const [hiWord, loWord] = highlightWords(row.key)
  const ratio = RATIO_ROWS.has(row.key) ? ratioText(cell.earthRatio) : null
  const title = [
    f.exact && `Full value: ${cell.limit ?? ''}${f.exact}`,
    cell.basis,
    cell.modelBased && MODEL_NOTE,
    cell.reason,
    cell.source?.label && `Source: ${sourceLabel(cell.source)}`,
  ]
    .filter(Boolean)
    .join('\n')
  return (
    <td className={`cmp-cell cmp-cell--${cell.kind}${hl ? ` is-${hl}` : ''}`} data-label={name}>
      <span className="cmp-value" tabIndex={f.exact ? 0 : undefined} title={title || undefined}>
        <Number_ f={f} limit={cell.limit} unit={row.unit} />
        {title && <span className="cmp-sr">. {title.replaceAll('\n', '. ')}</span>}
      </span>
      <span className="cmp-meta">
        <ProvenanceBadge kind={cell.kind} />
        {cell.modelBased && (
          <span className="cmp-tag" title={MODEL_NOTE}>
            Model-based
          </span>
        )}
      </span>
      {ratio && <span className="cmp-ratio" title="Calculated by CELESTRIA: value ÷ Earth's reference value">{ratio}</span>}
      {hl && (
        <span className="cmp-hl">
          {hl === 'high' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
          {hl === 'high' ? hiWord : loWord}
        </span>
      )}
    </td>
  )
}

function TextCell({ cell, name, rowKey }) {
  const value = cell.value === true ? 'Yes' : cell.value === false ? 'No' : cell.value
  return (
    <td className={`cmp-cell cmp-cell--text${value == null ? ' cmp-cell--missing' : ''}`} data-label={name}>
      {value == null ? <span className="cmp-missing">Unavailable</span> : <span className={rowKey === 'name' ? 'cmp-text cmp-text--name' : 'cmp-text'}>{String(value)}</span>}
    </td>
  )
}

function EarthCell({ row }) {
  const e = row.earth
  if (!e) {
    return (
      <td className="cmp-cell cmp-cell--ref cmp-cell--na" data-label="Earth (reference)">
        <span className="cmp-missing" title="Earth has no comparable value for this property">
          —
        </span>
        <span className="cmp-sr">No comparable Earth value</span>
      </td>
    )
  }
  if (row.type === 'text') {
    return (
      <td className="cmp-cell cmp-cell--ref" data-label="Earth (reference)">
        <span className="cmp-text">{String(e.value)}</span>
      </td>
    )
  }
  const title = `${e.basis}\nSource: ${e.source.label}`
  return (
    <td className="cmp-cell cmp-cell--ref" data-label={row.key.startsWith('star.') ? 'Sun (reference)' : 'Earth (reference)'}>
      <span className="cmp-value" title={title}>
        <Number_ f={{ value: e.value.toLocaleString('en-US', { maximumFractionDigits: 6 }) }} unit={row.unit} />
        <span className="cmp-sr">. {title.replace('\n', '. ')}</span>
      </span>
      <span className="cmp-meta">
        <span className="cmp-tag cmp-tag--ref">Reference</span>
      </span>
    </td>
  )
}

/**
 * @param {{ comparison: ReturnType<typeof import('../../science/compare.js').buildComparison>,
 *           planets: import('../../contracts/planet.js').Planet[] }} props
 */
export default function CompareTable({ comparison, planets }) {
  const earth = comparison.includeEarth
  const cols = 1 + planets.length + (earth ? 1 : 0)
  const names = planets.map((p) => p.name)
  return (
    <div className="cmp-table-wrap">
      <p className="cmp-legend" id="cmp-legend">
        <ArrowUp size={12} aria-hidden="true" />
        <ArrowDown size={12} aria-hidden="true" /> marks a highest or lowest value only when every planet has a comparable value and its uncertainty range
        clears all the others.
      </p>
      <table className={`cmp-table cmp-table--n${planets.length}`} aria-describedby="cmp-legend">
        <caption className="cmp-sr">
          Comparison of {names.join(', ')}
          {earth ? ', with Earth and the Sun as reference values' : ''}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="cmp-col-prop">
              Property
            </th>
            {planets.map((p, i) => (
              <th scope="col" key={p.id}>
                <span className="cmp-slot" aria-hidden="true">
                  {i + 1}
                </span>
                {p.name}
              </th>
            ))}
            {earth && (
              <th scope="col" className="cmp-col-ref">
                <span className="cmp-slot cmp-slot--ref" aria-hidden="true">
                  ⊕
                </span>
                Earth <small>Reference</small>
              </th>
            )}
          </tr>
        </thead>
        {comparison.groups.map((g) => (
          <tbody key={g.key} className="cmp-group">
            <tr className="cmp-group__head">
              <th scope="rowgroup" colSpan={cols} id={`cmp-g-${g.key}`}>
                {g.label}
              </th>
            </tr>
            {g.rows.filter((row) => row.key !== 'name').map((row) => {
              const note = rowNote(row)
              const basis = DERIVED_BASIS[row.key]
              return (
                <tr key={row.key} className={`cmp-row cmp-row--${row.type}`}>
                  <th scope="row" className="cmp-prop">
                    <span className="cmp-prop__label">{row.label}</span>
                    {basis && <span className="cmp-prop__note">{basis}</span>}
                    {note && <span className="cmp-prop__note cmp-prop__note--rank">{note}</span>}
                  </th>
                  {row.cells.map((cell, i) =>
                    row.type === 'quantity' ? (
                      <QuantityCell key={cell.planetId} row={row} cell={cell} name={names[i]} />
                    ) : (
                      <TextCell key={cell.planetId} cell={cell} name={names[i]} rowKey={row.key} />
                    ),
                  )}
                  {earth && <EarthCell row={row} />}
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
    </div>
  )
}
