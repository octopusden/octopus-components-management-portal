import { useState, useRef, useEffect } from 'react'
import { Input } from './input'
import { Badge } from './badge'
import { useOwners } from '../../hooks/useOwners'
import type { EmployeeMatch } from '../../hooks/useEmployees'

interface PeopleInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  lookupFn?: (query: string) => Promise<EmployeeMatch[]>
  status?: boolean | null
}

export function EmployeeStatusBadge({
  status,
  showActive = false,
}: {
  status?: boolean | null
  showActive?: boolean
}) {
  if (status === false) {
    return <Badge variant="destructive" className="shrink-0">Inactive</Badge>
  }
  if (showActive && status === true) {
    return <Badge variant="success" className="shrink-0">Active</Badge>
  }
  return null
}

export function PeopleInput({
  value,
  onChange,
  id,
  placeholder = 'owner@example.com',
  lookupFn,
  status,
}: PeopleInputProps) {
  const { data: owners = [] } = useOwners()
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value)
  const [externalResults, setExternalResults] = useState<EmployeeMatch[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setInputValue(value)
  }, [value])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!lookupFn || !inputValue || inputValue.length < 2) {
      setExternalResults([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const results = await lookupFn(inputValue)
        if (!cancelled) setExternalResults(results ?? [])
      } catch {
        if (!cancelled) setExternalResults([])
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [inputValue, lookupFn])

  const filtered = inputValue
    ? owners.filter((o) => o.toLowerCase().includes(inputValue.toLowerCase()))
    : owners

  const exactStatuses = new Map(externalResults.map((result) => [result.username, result.active]))
  const suggestions = [
    ...filtered.map((username) => ({ username, active: exactStatuses.get(username) })),
    ...externalResults
      .filter((result) => !filtered.includes(result.username))
      .map((result) => ({ username: result.username, active: result.active })),
  ].slice(0, 10)

  return (
    <div ref={wrapperRef} className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Input
          id={id}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onChange(inputValue)
              setOpen(false)
            }
          }}
          onBlur={() => {
            onChange(inputValue)
          }}
          placeholder={placeholder}
        />
        {open && suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-md border bg-popover shadow-md">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.username}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setInputValue(suggestion.username)
                  onChange(suggestion.username)
                  setOpen(false)
                }}
              >
                <span className="min-w-0 flex-1 truncate">{suggestion.username}</span>
                <EmployeeStatusBadge status={suggestion.active} showActive />
              </button>
            ))}
          </div>
        )}
      </div>
      <EmployeeStatusBadge status={status} />
    </div>
  )
}
