// Searchable planet selector grouped by host star — owner: UI (implemented
// by LEAD). Only switches planets; no viewer settings.
// Keyboard: ↑/↓ move, Enter selects, Escape closes.
// Large catalogues (> SHOW_ALL_LIMIT) are search-first: before typing, only
// featured items and the current planet's siblings are listed; typing shows
// the best `limit` matches (name prefix first).
// Add mode (Compare): pass value={null}, a `placeholder` and `excludeIds`;
// excluded planets stay listed but cannot be chosen.

import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import './PlanetPicker.css'

const SHOW_ALL_LIMIT = 300

/**
 * @param {{ planets: { id: string, name: string, host: string }[], value: string, onChange: (id: string) => void,
 *           label?: string, featuredIds?: string[], limit?: number, grouped?: boolean, noun?: string,
 *           placeholder?: string, hint?: string, excludeIds?: string[], excludedLabel?: string, disabled?: boolean }} props
 *   grouped=false renders a flat list with `host` as a subtitle (e.g. systems).
 */
export default function PlanetPicker({
  planets,
  value,
  onChange,
  label = 'Choose a planet',
  featuredIds = [],
  limit = 60,
  grouped = true,
  noun = 'planets',
  placeholder = 'Select a planet',
  hint = null,
  excludeIds = [],
  excludedLabel = 'Added',
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef(null)
  const button = useRef(null)
  const search = useRef(null)
  const list = useRef(null)
  const uid = useId()
  const current = planets.find((p) => p.id === value)
  const excluded = useMemo(() => new Set(excludeIds), [excludeIds])

  const large = planets.length > SHOW_ALL_LIMIT
  const searchable = useMemo(() => planets.map((p) => ({ p, name: p.name.toLowerCase(), host: p.host.toLowerCase() })), [planets])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q) {
      const prefix = []
      const contains = []
      for (const it of searchable) {
        if (it.name.startsWith(q) || it.host.startsWith(q)) prefix.push(it.p)
        else if (it.name.includes(q) || it.host.includes(q)) contains.push(it.p)
        if (large && prefix.length >= limit) break
      }
      const all = [...prefix, ...contains]
      return large ? all.slice(0, limit) : all
    }
    if (!large) return planets
    const byId = new Map(planets.map((p) => [p.id, p]))
    const current = byId.get(value)
    const picks = [
      ...featuredIds.map((id) => byId.get(id)),
      ...(current && grouped ? planets.filter((p) => p.host === current.host) : current ? [current] : []),
    ].filter(Boolean)
    return [...new Map(picks.map((p) => [p.id, p])).values()]
  }, [searchable, planets, query, large, limit, featuredIds, value, grouped])

  const groups = useMemo(() => {
    if (!grouped) return [[null, filtered.map((p, i) => ({ ...p, index: i }))]]
    const m = new Map()
    filtered.forEach((p, i) => m.set(p.host, [...(m.get(p.host) ?? []), { ...p, index: i }]))
    return [...m.entries()]
  }, [filtered, grouped])

  const openPicker = () => {
    setQuery('')
    setActive(Math.max(0, planets.findIndex((p) => p.id === value)))
    setOpen(true)
  }
  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }
  const choose = (id) => {
    if (excluded.has(id)) return
    close()
    if (id !== value) onChange(id)
  }

  // Outside click closes; focus the search field on devices with a fine pointer.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!root.current?.contains(e.target)) close(false)
    }
    document.addEventListener('pointerdown', onDown)
    if (window.matchMedia?.('(pointer: fine)').matches) search.current?.focus()
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // Keep the active option visible.
  useEffect(() => {
    if (!open) return
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(filtered.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter' && filtered[active]) {
      e.preventDefault()
      choose(filtered[active].id)
    }
  }

  return (
    <div className={`ppk${open ? ' is-open' : ''}`} ref={root} onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={button}
        type="button"
        className="ppk__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={current || !hint ? `${label}. Current: ${current?.name ?? 'none'}` : label}
        disabled={disabled}
        onClick={() => (open ? close() : openPicker())}
      >
        <span className="ppk__current">
          <span className="ppk__name">{current?.name ?? placeholder}</span>
          {current ? <span className="ppk__host">{current.host}</span> : hint && <span className="ppk__host">{hint}</span>}
        </span>
        <ChevronDown size={16} className="ppk__chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="ppk__pop">
          <label className="ppk__search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={search}
              type="search"
              value={query}
              placeholder={grouped ? 'Search planets or stars' : `Search ${noun}`}
              aria-label={grouped ? 'Search planets or stars' : `Search ${noun}`}
              aria-controls={`${uid}-list`}
              aria-activedescendant={filtered[active] ? `${uid}-opt-${active}` : undefined}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
            />
          </label>
          <ul ref={list} id={`${uid}-list`} className="ppk__list" role="listbox" aria-label={label}>
            {groups.map(([host, items]) => (
              <li key={host ?? 'all'} role="presentation">
                {host && (
                  <div className="ppk__group" aria-hidden="true">
                    {host}
                    <span>{items.length}</span>
                  </div>
                )}
                <ul role="group" aria-label={host ?? label}>
                  {items.map((p) => (
                    <li
                      key={p.id}
                      id={`${uid}-opt-${p.index}`}
                      data-index={p.index}
                      role="option"
                      aria-selected={p.id === value}
                      aria-disabled={excluded.has(p.id) || undefined}
                      className={`ppk__option${p.index === active ? ' is-active' : ''}${excluded.has(p.id) ? ' is-excluded' : ''}`}
                      onPointerEnter={() => setActive(p.index)}
                      onClick={() => choose(p.id)}
                    >
                      <span className="ppk__optname">
                        {p.name}
                        {!grouped && <small>{p.host}</small>}
                      </span>
                      {p.id === value && <Check size={14} aria-hidden="true" />}
                      {excluded.has(p.id) && <span className="ppk__tag">{excludedLabel}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {filtered.length === 0 && <p className="ppk__empty">No {noun} match “{query}”</p>}
          <p className="ppk__count">
            {large && !query.trim()
              ? `Featured · type to search all ${planets.length.toLocaleString('en-US')} ${noun}`
              : large && filtered.length >= limit
                ? `Top ${limit} matches of ${planets.length.toLocaleString('en-US')} ${noun}`
                : `${filtered.length} of ${planets.length.toLocaleString('en-US')} ${noun}`}
          </p>
        </div>
      )}
    </div>
  )
}
