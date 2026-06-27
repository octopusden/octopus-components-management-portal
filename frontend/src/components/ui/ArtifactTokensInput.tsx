import { useState } from 'react'
import { X } from 'lucide-react'
import { isBadToken, splitTokens } from '@/lib/artifactOwnership'
import { cn } from '@/lib/utils'

interface ArtifactTokensInputProps {
  tokens: string[]
  onChange: (tokens: string[]) => void
  disabled?: boolean
  ariaLabel?: string
}

/**
 * Literal artifact-ID chips for EXPLICIT ownership. Paste/type a comma / pipe / space list to
 * split into chips; regex metacharacters are rejected (artifact IDs are literal, not patterns).
 */
export function ArtifactTokensInput({ tokens, onChange, disabled, ariaLabel }: ArtifactTokensInputProps) {
  const [draft, setDraft] = useState('')
  const draftBad = draft !== '' && isBadToken(draft.trim())

  const commit = (raw: string) => {
    const parts = splitTokens(raw)
    if (parts.length === 0) {
      setDraft('')
      return
    }
    const next = [...tokens]
    for (const p of parts) {
      if (!isBadToken(p) && !next.includes(p)) next.push(p)
    }
    onChange(next)
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1',
          draftBad ? 'border-destructive' : 'border-input',
          disabled && 'opacity-60',
        )}
      >
        {tokens.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="inline-flex items-center gap-1 rounded bg-muted py-0.5 pl-2 pr-1 font-mono text-[13px] font-medium"
          >
            {t}
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove ${t}`}
                className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                onClick={() => onChange(tokens.filter((_, idx) => idx !== i))}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        <input
          className="min-w-[120px] flex-1 border-none bg-transparent px-0.5 py-0.5 font-mono text-[13px] outline-none disabled:cursor-not-allowed"
          aria-label={ariaLabel ?? 'Add artifact ID'}
          placeholder={tokens.length ? 'Add artifact…' : 'foo-service, foo-api'}
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value
            // Auto-split when a separator is typed/pasted.
            if (/[,|\s]/.test(v)) commit(v)
            else setDraft(v)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === '|') {
              e.preventDefault()
              commit(draft)
            } else if (e.key === 'Backspace' && draft === '' && tokens.length > 0) {
              onChange(tokens.slice(0, -1))
            }
          }}
          // Keep an invalid draft visible (with its error) on blur instead of silently dropping it.
          onBlur={() => {
            if (draft && !isBadToken(draft.trim())) commit(draft)
          }}
        />
      </div>
      {draftBad && (
        <span className="text-xs text-destructive">
          Artifact IDs are literal — "{draft.trim()}" contains a forbidden character.
        </span>
      )}
    </div>
  )
}
