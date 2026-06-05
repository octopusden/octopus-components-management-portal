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
  showUnknown = false,
}: {
  status?: boolean | null
  showActive?: boolean
  showUnknown?: boolean
}) {
  if (status === false) {
    return <Badge variant="destructive" className="shrink-0">Inactive</Badge>
  }
  if (showActive && status === true) {
    return <Badge variant="success" className="shrink-0">Active</Badge>
  }
  if (showUnknown && status === null) {
    return <Badge variant="outline" className="shrink-0">Not verified</Badge>
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
  const [validationError, setValidationError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const validationRunRef = useRef(0)
  const skipNextEmptySyncRef = useRef(false)

  useEffect(() => {
    validationRunRef.current += 1
    setValidating(false)
    setValidationError(null)
    if (skipNextEmptySyncRef.current && value === '') {
      skipNextEmptySyncRef.current = false
      return
    }
    setInputValue(value)
  }, [value])

  useEffect(() => {
    return () => {
      validationRunRef.current += 1
    }
  }, [])

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

  const commitCandidate = async (raw: string, knownActive?: boolean) => {
    const candidate = raw.trim()
    setInputValue(candidate)
    setOpen(false)
    setValidationError(null)

    if (!candidate) {
      onChange('')
      return
    }

    if (!lookupFn) {
      onChange(candidate)
      return
    }

    if (knownActive === true) {
      onChange(candidate)
      return
    }

    if (knownActive === false) {
      setValidationError('Person is inactive')
      return
    }

    const runId = validationRunRef.current + 1
    validationRunRef.current = runId
    setValidating(true)
    try {
      const results = (await lookupFn(candidate)) ?? []
      if (validationRunRef.current !== runId) return
      const exact = results.find(
        (result) => result.username.toLowerCase() === candidate.toLowerCase(),
      )
      if (!exact) {
        setValidationError('Select an active person from the directory')
        return
      }
      if (!exact.active) {
        setValidationError('Person is inactive')
        return
      }
      setInputValue(exact.username)
      onChange(exact.username)
    } catch {
      if (validationRunRef.current === runId) {
        setValidationError('Could not validate person')
      }
    } finally {
      if (validationRunRef.current === runId) {
        setValidating(false)
      }
    }
  }

  return (
    <div ref={wrapperRef} className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            id={id}
            value={inputValue}
            onChange={(e) => {
              const nextValue = e.target.value
              validationRunRef.current += 1
              setValidating(false)
              setInputValue(nextValue)
              setValidationError(null)
              setOpen(true)
              if (lookupFn && value.trim() !== '') {
                skipNextEmptySyncRef.current = true
                onChange('')
              }
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void commitCandidate(inputValue)
              }
            }}
            onBlur={() => {
              void commitCandidate(inputValue)
            }}
            placeholder={placeholder}
            aria-invalid={Boolean(validationError)}
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
                    void commitCandidate(suggestion.username, suggestion.active)
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
      {validating && (
        <p className="text-xs text-muted-foreground">Validating person...</p>
      )}
      {validationError && (
        <p role="alert" className="text-xs text-destructive">{validationError}</p>
      )}
    </div>
  )
}
