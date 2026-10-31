// Searchable planet selector grouped by host star — owner: UI (implemented
// by LEAD). Only switches planets; no viewer settings.
// Keyboard: ↑/↓ move, Enter selects, Escape closes.

import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import './PlanetPicker.css'

/**
 * @param {{ planets: { id: string, name: string, host: string }[], value: string, onChange: (id: string) => void, label?: string }} props
 */
export default function PlanetPicker({ planets, value, onChange, label = 'Choose a planet' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef(null)
  const button = useRef(null)
  const search = useRef(null)
  const list = useRef(null)
  const uid = useId()
  const current = planets.find((p) => p.id === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? planets.filter((p) => p.name.toLowerCase().includes(q) || p.host.toLowerCase().includes(q)) : planets
  }, [planets, query])

  const groups = useMemo(() => {
    const m = new Map()
    filtered.forEach((p, i) => m.set(p.host, [...(m.get(p.host) ?? []), { ...p, index: i }]))
    return [...m.entries()]
  }, [filtered])

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
        aria-label={`${label}. Current: ${current?.name ?? 'none'}`}
        onClick={() => (open ? close() : openPicker())}
      >
        <span className="ppk__current">
          <span className="ppk__name">{current?.name ?? 'Select a planet'}</span>
          {current && <span className="ppk__host">{current.host}</span>}
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
              placeholder="Search planets or stars"
              aria-label="Search planets or stars"
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
              <li key={host} role="presentation">
                <div className="ppk__group" aria-hidden="true">
                  {host}
                  <span>{items.length}</span>
                </div>
                <ul role="group" aria-label={host}>
                  {items.map((p) => (
                    <li
                      key={p.id}
                      id={`${uid}-opt-${p.index}`}
                      data-index={p.index}
                      role="option"
                      aria-selected={p.id === value}
                      className={`ppk__option${p.index === active ? ' is-active' : ''}`}
                      onPointerEnter={() => setActive(p.index)}
                      onClick={() => choose(p.id)}
                    >
                      {p.name}
                      {p.id === value && <Check size={14} aria-hidden="true" />}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {filtered.length === 0 && <p className="ppk__empty">No planets match “{query}”</p>}
          <p className="ppk__count">
            {filtered.length} of {planets.length} planets
          </p>
        </div>
      )}
    </div>
  )
}
