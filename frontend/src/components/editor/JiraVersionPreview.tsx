import { useState } from 'react'
import { computeLadder, expandFormat, parseVersion, type LadderState, type LadderRow, type VersionParts } from '../../lib/versionPreview'

/**
 * Version-ladder preview panel (design brief §4, P-0 prototype). Reads the
 * current (possibly unsaved) Jira format values, decomposes an editable sample
 * version and renders one row per usage — Release / RC / Minor / Line / Build and
 * the two Hotfix rows. Row VALUES and approx flags come from the shared
 * `computeLadder` lib (reused, not reimplemented); this component supplies the
 * presentation copy (tags/destinations from P-0) and the two-way hover linking.
 * The row↔field hover mapping is computed here rather than read from the lib's
 * `fieldId`, because the lib always reports the Build row's own path and does not
 * encode the Build→Release mirror leader this panel needs for cross-highlighting.
 */
export interface JiraVersionPreviewProps {
  versionPrefix: string
  versionFormat: string
  lineVersionFormat: string
  /** Separate Minor value; used only when `minorSeparate` (else Minor mirrors Line). */
  minorVersionFormat: string
  minorSeparate: boolean
  releaseVersionFormat: string
  /** Separate Build value; used only when `buildSeparate` (else Build mirrors Release). */
  buildVersionFormat: string
  buildSeparate: boolean
  hotfixVersionFormat: string
  technical: boolean
  hotfixEnabled: boolean
  /** Shared hovered field-path (lifted to JiraTab) — drives cross-highlighting. */
  hoveredField: string | null
  /** Report the field a hovered/left row links back to (null on leave). */
  onHoverField: (field: string | null) => void
}

// Field-config paths — shared hover vocabulary with JiraTab's format fields and
// the lib's `fieldId`.
const PREFIX = 'jira.versionPrefix'
const VERSION_FORMAT = 'jira.versionFormat'
const LINE = 'jira.lineVersionFormat'
const MINOR = 'jira.minorVersionFormat'
const RELEASE = 'jira.releaseVersionFormat'
const BUILD = 'jira.buildVersionFormat'
const HOTFIX = 'jira.hotfixVersionFormat'

// Canonical positional part values used to synthesise a realistic default sample
// version. Non-zero so every referenced segment renders a believable number
// (e.g. `$major.$minor.$service-$fix` → `1.2.3-87`, not `1.2.3-0`).
const CANONICAL_PARTS: VersionParts = { major: '1', minor: '2', service: '3', fix: '87', build: '512' }
const PART_ORDER = ['major', 'minor', 'service', 'fix', 'build'] as const

/** Highest positional segment (1-based) a template references, 0 if none. */
function templateDepth(template: string): number {
  let depth = 0
  PART_ORDER.forEach((key, i) => {
    if (new RegExp(`\\$${key}(?![A-Za-z])`).test(template)) depth = Math.max(depth, i + 1)
  })
  return depth
}

/**
 * Synthesise a default sample version whose segment count matches the deepest of
 * the given format templates — so the preview never shows a fake trailing `0` for
 * a segment the format actually uses. The deepest template supplies the display
 * separators (`1.2.3-87` vs `1.2.3.87`); ties prefer the first (leading) template.
 *
 * The rendered sample must round-trip through positional `parseVersion` (the same
 * decode the ladder rows use), else a template that skips a leading position
 * (e.g. `$service.$fix`) would show a sample the rows then recompute differently.
 * When it doesn't round-trip, fall back to a positional canonical join that fills
 * every used position.
 */
function deriveSample(templates: string[]): string {
  const candidates = templates.filter((t) => t.trim())
  if (candidates.length === 0) return '1.2.3'
  // reduce with no seed → returns a `string` (throws on empty, which we guarded).
  const deepest = candidates.reduce((best, t) => (templateDepth(t) > templateDepth(best) ? t : best))
  const depth = templateDepth(deepest)
  if (depth === 0) return '1.2.3'
  const rendered = expandFormat(deepest, CANONICAL_PARTS)
  const parsed = parseVersion(rendered)
  const roundTrips =
    rendered.trim() !== '' && PART_ORDER.slice(0, depth).every((k) => parsed[k] === CANONICAL_PARTS[k])
  return roundTrips ? rendered : PART_ORDER.slice(0, depth).map((k) => CANONICAL_PARTS[k]).join('.')
}

interface MirrorFlags {
  minorMirrored: boolean
  buildMirrored: boolean
}

/** Ladder rows a hovered field highlights (field → rows). */
function fieldToRows(field: string | null, { minorMirrored, buildMirrored }: MirrorFlags): string[] {
  switch (field) {
    case LINE:
      return minorMirrored ? ['line', 'minor'] : ['line']
    // A mirrored Minor points at its leading Line row; a separate Minor at its own.
    case MINOR:
      return minorMirrored ? ['line'] : ['minor']
    // Release also lights the Build row when Build mirrors it — symmetric with the
    // Line→Minor pair, and it makes a mirrored Build row highlight itself (its
    // hover reports RELEASE as the leader).
    case RELEASE:
      return buildMirrored ? ['release', 'rc', 'build'] : ['release', 'rc']
    // A mirrored Build points at its leading Release row; a separate Build at its own.
    case BUILD:
      return buildMirrored ? ['release'] : ['build']
    // Prefix + Full Version Format wrap every Jira-facing row.
    case PREFIX:
    case VERSION_FORMAT:
      return ['release', 'rc', 'minor', 'hotfix-jira']
    case HOTFIX:
      return ['hotfix-build', 'hotfix-jira']
    default:
      return []
  }
}

/** The field a hovered row links back to (row → field), honouring mirror state. */
function rowToField(id: string, { minorMirrored, buildMirrored }: MirrorFlags): string {
  switch (id) {
    case 'release':
    case 'rc':
      return RELEASE
    case 'minor':
      return minorMirrored ? LINE : MINOR
    case 'line':
      return LINE
    case 'build':
      return buildMirrored ? RELEASE : BUILD
    case 'hotfix-build':
    case 'hotfix-jira':
    default:
      return HOTFIX
  }
}

interface RowChrome {
  /** Small pill beside the label (mirror tag / "no prefix" / "in Jira"). */
  tag: string
  /** "→ …" caption under the value. */
  dest: string
  /** Left-accent the primary Release row. */
  accent?: boolean
  /** Jira-facing row — its "in Jira" tag renders in the accent (blue) colour. */
  jira?: boolean
}

/** Presentation copy per row (P-0 prototype §preview); mirror tags depend on state. */
function rowChrome(id: string, technical: boolean, { buildMirrored }: MirrorFlags): RowChrome {
  switch (id) {
    case 'release':
      return { tag: 'in Jira', jira: true, accent: true, dest: technical ? 'SubComponent Fix Version/s' : 'Jira "Fix Version/s"' }
    case 'rc':
      return {
        tag: 'in Jira',
        jira: true,
        dest: technical
          ? 'Jira, until the release replaces it in SubComponent Fix Version/s'
          : 'Jira, until the release replaces it in Fix Version/s',
      }
    case 'minor':
      // Minor is a Jira-facing planning version → always tagged "in Jira" (the
      // Line-mirror relationship is still shown by the field pill + hover link).
      return { tag: 'in Jira', jira: true, dest: 'used for planning in Jira' }
    case 'line':
      return { tag: 'no prefix', dest: 'CRN report — all versions belonging to this line are included by default' }
    case 'build':
      return { tag: buildMirrored ? '= release format' : 'no prefix', dest: 'TeamCity builds / Artifactory' }
    case 'hotfix-build':
      return { tag: 'hotfix build, no prefix', dest: 'hotfix builds in TeamCity / Artifactory' }
    case 'hotfix-jira':
    default:
      return {
        tag: 'in Jira',
        jira: true,
        dest: technical
          ? 'Jira SubComponent Fix Version/s, wrapped like a release'
          : 'Jira Fix Version, wrapped like a release',
      }
  }
}

export function JiraVersionPreview(props: JiraVersionPreviewProps) {
  const {
    versionPrefix,
    versionFormat,
    lineVersionFormat,
    minorVersionFormat,
    minorSeparate,
    releaseVersionFormat,
    buildVersionFormat,
    buildSeparate,
    hotfixVersionFormat,
    technical,
    hotfixEnabled,
    hoveredField,
    onHoverField,
  } = props

  // Editable samples. Default arity is derived from the current formats (hotfix
  // carries an extra trailing segment), so the preview matches how many indices
  // each format uses. A manual edit (override) wins and pins the value; until then
  // the sample tracks format edits reactively.
  const [sampleOverride, setSampleOverride] = useState<string | null>(null)
  const [hotfixOverride, setHotfixOverride] = useState<string | null>(null)
  const effectiveBuildFormat = buildSeparate ? buildVersionFormat : releaseVersionFormat
  const sample = sampleOverride ?? deriveSample([releaseVersionFormat, effectiveBuildFormat])
  const hotfixSample = hotfixOverride ?? deriveSample([hotfixVersionFormat])

  // Feed the lib the effective values: a mirrored derived field passes '' so the
  // lib falls back to its leader (Minor→Line, Build→Release), matching the
  // section's materialization/fallback and keeping the ladder in step with what
  // is saved.
  const ladderState: LadderState = {
    sample,
    hotfixSample,
    versionPrefix,
    versionFormat,
    releaseVersionFormat,
    minorVersionFormat: minorSeparate ? minorVersionFormat : '',
    lineVersionFormat,
    buildVersionFormat: buildSeparate ? buildVersionFormat : '',
    hotfixVersionFormat,
    hotfixEnabled,
    technical,
  }
  const rows = computeLadder(ladderState)
  // Hotfix rows live in their own group below the main ladder (with the hotfix
  // sample input), so the standard preview reads without the extra-arity noise.
  const mainRows = rows.filter((r) => !r.id.startsWith('hotfix'))
  const hotfixRows = rows.filter((r) => r.id.startsWith('hotfix'))

  const flags: MirrorFlags = { minorMirrored: !minorSeparate, buildMirrored: !buildSeparate }
  const highlightedRows = new Set(fieldToRows(hoveredField, flags))

  const renderRow = (r: LadderRow) => (
    <LadderRowView
      key={r.id}
      row={r}
      chrome={rowChrome(r.id, technical, flags)}
      highlighted={highlightedRows.has(r.id)}
      onEnter={() => onHoverField(rowToField(r.id, flags))}
      onLeave={() => onHoverField(null)}
    />
  )

  const sampleInputClass =
    'w-36 rounded-md border bg-background px-2 py-1 font-mono text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div
      data-testid="jira-version-preview"
      className="rounded-xl border bg-muted/40 p-4 lg:sticky lg:top-6"
    >
      <div className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Version Preview
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <label className="flex items-center gap-2">
          version
          <input
            aria-label="version"
            value={sample}
            onChange={(e) => setSampleOverride(e.target.value)}
            className={sampleInputClass}
          />
        </label>
      </div>

      <div>{mainRows.map(renderRow)}</div>

      {hotfixEnabled && hotfixRows.length > 0 && (
        <div className="mt-3 border-t border-dashed pt-3">
          <label
            className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"
            title="Hotfix versions carry an extra trailing segment vs standard ones — previewed from their own sample."
          >
            hotfix version
            <input
              aria-label="hotfix version"
              value={hotfixSample}
              onChange={(e) => setHotfixOverride(e.target.value)}
              className={sampleInputClass}
            />
          </label>
          <div>{hotfixRows.map(renderRow)}</div>
        </div>
      )}

      <p className="mt-3 border-t border-dashed pt-3 text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-mono">$fix</span> and <span className="font-mono">$build</span> are filled by the
        server at build/release time.
      </p>
    </div>
  )
}

function LadderRowView({
  row,
  chrome,
  highlighted,
  onEnter,
  onLeave,
}: {
  row: LadderRow
  chrome: RowChrome
  highlighted: boolean
  onEnter: () => void
  onLeave: () => void
}) {
  return (
    <div
      data-testid={`ladder-row-${row.id}`}
      data-highlighted={highlighted ? 'true' : undefined}
      // Row→field linking works for keyboard users too, not just mouse: the row is
      // focusable and focus/blur mirror mouseenter/leave (Codex #153 P2 a11y).
      // No role="button": focusing already performs the (only) effect — highlighting
      // the source field — so there is no separate activation to announce (Copilot #153).
      tabIndex={0}
      aria-label={`${row.label} — focus to highlight its source field`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      className={[
        '-mx-2 rounded-md px-2 py-2 transition-colors data-[highlighted=true]:bg-accent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        chrome.accent ? 'border-l-2 border-primary pl-3' : '',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{row.label}</span>
        <span
          className={
            chrome.jira
              ? 'rounded-full border border-transparent bg-[color:var(--color-badge-blue-bg)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--color-badge-blue-fg)]'
              : 'rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground'
          }
        >
          {chrome.tag}
        </span>
      </div>
      <div data-testid="ladder-value" className="font-mono text-base font-semibold tracking-tight">
        {row.value}
      </div>
      <div className="text-xs text-muted-foreground">→ {chrome.dest}</div>
    </div>
  )
}
