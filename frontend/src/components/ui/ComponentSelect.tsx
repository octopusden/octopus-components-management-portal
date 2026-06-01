import { useEffect, useRef, useState } from 'react'
import { Input } from './input'
import { useComponents } from '../../hooks/useComponents'
import type { ComponentFilter } from '../../lib/types'

interface ComponentSelectProps {
  /** Current component name selected (or empty string for "no parent"). */
  value: string
  /** Called with the new name on selection or with empty string when cleared. */
  onChange: (value: string) => void
  /**
   * Name of the component currently being edited. Excluded from suggestions —
   * a component cannot be its own parent and offering itself in the dropdown is
   * a usability footgun.
   */
  excludeName?: string
  placeholder?: string
  id?: string
  /** Forwarded to the inner input as `aria-label` (for icon-only / no-visible-label rows). */
  ariaLabel?: string
  /**
   * Extra server-side filter merged into the suggestion query — e.g.
   * `{ labels: ['doc'] }` to only offer doc-labelled components. Applied
   * alongside the typed `search`.
   */
  filter?: Partial<ComponentFilter>
  /**
   * Strict mode: only a suggestion click (or clearing to empty) commits a value;
   * a free-typed string that matches no suggestion is reverted on blur. Used for
   * the parent picker, which must reference a real `canBeParent` component.
   */
  strict?: boolean
  /** Disable the input (e.g. a can-be-parent component, which may not itself have a parent). */
  disabled?: boolean
}

/**
 * Autocomplete picker for `parentComponentName`. Driven by
 * `GET /rest/api/4/components?search=<query>` so the suggestion list reflects
 * the same name resolution the resolver uses (server-side ILIKE on `name` /
 * `displayName`). Submits the canonical `name` to the form, never displayName,
 * because the backend stores `parentComponentName` as a name, not a UUID or
 * displayName.
 *
 * Empty input ⇒ caller receives `""`. The `ComponentDetailPage` save handler
 * is responsible for translating that into the wire-level "clear field" value
 * (currently `null` per JSON Merge Patch semantics, see SYS-035 / FS §1.4).
 */
export function ComponentSelect({
  value,
  onChange,
  excludeName,
  placeholder = 'Search components…',
  id,
  ariaLabel,
  filter,
  strict = false,
  disabled = false,
}: ComponentSelectProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Mirror inbound prop so the input updates when the parent re-fetches.
  useEffect(() => {
    setInputValue(value)
  }, [value])

  // Click-outside collapses the dropdown without committing — matches
  // PeopleInput so the two pickers behave identically from a user POV.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Drive suggestions from the live components list. We pass the raw input
  // through `search`, which the backend interprets as case-insensitive ILIKE on
  // both `name` and `displayName`. Two-character minimum keeps the suggestions
  // useful and the request volume sane (matches PeopleInput's external lookup
  // threshold).
  const trimmed = inputValue.trim()
  const enabled = trimmed.length >= 2
  const { data } = useComponents({
    filter: enabled ? { search: trimmed, ...filter } : undefined,
    page: 0,
    size: 10,
  })

  const suggestions = (data?.content ?? [])
    .map((c) => c.name)
    .filter((name) => name !== excludeName)
    .slice(0, 10)

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        id={id}
        aria-label={ariaLabel}
        value={inputValue}
        disabled={disabled}
        onChange={(e) => {
          setInputValue(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          const next = inputValue.trim()
          if (strict && next !== '' && next !== value && !suggestions.includes(next)) {
            // Strict: a free-typed non-match reverts to the committed value.
            // Only a suggestion click (handled in onMouseDown) or clearing to
            // empty changes the value.
            setInputValue(value)
            return
          }
          // Non-strict (and strict-clear / strict-exact-match): commit raw input.
          // The backend validates; an invalid value returns 400 on save.
          onChange(next)
        }}
        placeholder={placeholder}
      />
      {open && enabled && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-auto">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onMouseDown={(e) => {
                // onMouseDown fires before the input's onBlur, so we can update
                // state and short-circuit the blur-commit path.
                e.preventDefault()
                setInputValue(name)
                onChange(name)
                setOpen(false)
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
