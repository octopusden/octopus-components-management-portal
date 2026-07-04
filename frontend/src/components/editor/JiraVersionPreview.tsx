import { useMemo, useState, type ReactNode } from 'react'
import { expandFormat, parseVersion, type LadderRow, type VersionParts } from '../../lib/versionPreview'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useVersionPreview, type VersionPreviewOverride, type VersionPreviewRequest } from '../../hooks/useVersionPreview'
import type { DetailedComponentVersion } from '../../lib/types'

/**
 * Version-ladder preview panel (design brief §4). Reads the current (possibly
 * unsaved) Jira format values + per-range overrides, renders one row per usage —
 * Release / RC / Minor / Line / Build and the two Hotfix rows. Row VALUES come
 * from the CRS preview endpoint (server-truth — see [JiraVersionPreview]); this
 * component supplies the editable sample versions, the presentation copy
 * (tags/destinations from P-0) and the two-way hover linking. The row↔field
 * hover mapping is computed here so it can encode the Minor→Line / Build→Release
 * mirror leaders for cross-highlighting.
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
  /** Per-range jira format overrides (from the overrides draft), for the live preview. */
  overrides?: VersionPreviewOverride[]
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

const SAMPLE_INPUT_CLASS =
  'w-36 rounded-md border bg-background px-2 py-1 font-mono text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** The bordered, sticky preview card + its "Version Preview" heading. */
function PreviewShell({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="jira-version-preview"
      className="rounded-xl border bg-muted/40 p-4 lg:sticky lg:top-6"
    >
      <div className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Version Preview
      </div>
      {children}
    </div>
  )
}

/** Map a server DetailedComponentVersion to the panel's ladder rows (bare vs Jira form). */
function mapDetailedToRows(d: DetailedComponentVersion, hotfixEnabled: boolean): LadderRow[] {
  const mk = (id: string, label: string, value: string): LadderRow => ({
    id,
    label,
    value,
    dest: '',
    approx: false,
    fieldId: '',
  })
  const rows = [
    mk('release', 'Release Version', d.releaseVersion.jiraVersion),
    mk('rc', 'RC Version', d.rcVersion.jiraVersion),
    mk('minor', 'Minor Version', d.minorVersion.jiraVersion),
    mk('line', 'Major (Line) Version', d.lineVersion.version),
    mk('build', 'Build Version', d.buildVersion.version),
  ]
  if (hotfixEnabled && d.hotfixVersion) {
    rows.push(
      mk('hotfix-build', 'Hotfix Version', d.hotfixVersion.version),
      mk('hotfix-jira', 'Hotfix Version', d.hotfixVersion.jiraVersion),
    )
  }
  return rows
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

/**
 * Version Preview — renders the six version coordinates LIVE from the unsaved
 * editor formats (base + per-range overrides) via the CRS preview endpoint, for
 * EVERY build system. Rendering server-truth (not a client re-implementation of
 * the version formatter) is what makes per-range overrides, custom prefixes,
 * zero-padding and the formatter's special cases match what CRS actually
 * computes — no client/server drift. Two editable, arity-derived samples drive
 * it: `version` for the standard rows and a separate `hotfix version` (hotfix
 * coordinates carry an extra trailing segment). A manual edit pins a sample;
 * until then it tracks the format arity. A version matching no format, or any
 * 4xx, falls back to a notice.
 */
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
    overrides = [],
    hoveredField,
    onHoverField,
  } = props

  // Editable samples, arity-derived from the current formats — a manual edit pins
  // the value; until then it tracks format edits so the sample always has as many
  // indices as the deepest template uses.
  const effectiveBuildFormat = buildSeparate ? buildVersionFormat : releaseVersionFormat
  const [versionOverride, setVersionOverride] = useState<string | null>(null)
  const [hotfixOverride, setHotfixOverride] = useState<string | null>(null)
  const version = versionOverride ?? deriveSample([releaseVersionFormat, effectiveBuildFormat])
  const hotfixSample = hotfixOverride ?? deriveSample([hotfixVersionFormat])

  // Base sent to the endpoint — EXACTLY the save-path materialization
  // (useJiraSection.normalizeJira): Minor mirrors Line → send the Line value (CRS
  // treats minor as the leader); Build mirrors Release → send '' so CRS's own
  // server-side fallback resolves it to the effective (override-aware) release.
  const base = useMemo(
    () => ({
      minorVersionFormat: minorSeparate ? minorVersionFormat : lineVersionFormat,
      releaseVersionFormat,
      buildVersionFormat: buildSeparate ? buildVersionFormat : '',
      lineVersionFormat,
      hotfixVersionFormat,
      versionPrefix,
      versionFormat,
    }),
    [
      minorSeparate,
      minorVersionFormat,
      lineVersionFormat,
      releaseVersionFormat,
      buildSeparate,
      buildVersionFormat,
      hotfixVersionFormat,
      versionPrefix,
      versionFormat,
    ],
  )

  // Standard rows: render the `version` sample with hotfix OFF — the hotfix
  // coordinate has its own, deeper sample below. Debounce the whole request
  // (serialized, so equal content settles) since formats + version change live.
  const mainRequest = useMemo<VersionPreviewRequest>(
    () => ({ version, technical, hotfixEnabled: false, base, overrides }),
    [version, technical, base, overrides],
  )
  const mainKey = useDebouncedValue(JSON.stringify(mainRequest), 350)
  const mainQuery = useVersionPreview(
    useMemo(() => JSON.parse(mainKey) as VersionPreviewRequest, [mainKey]),
    true,
  )

  // Hotfix rows: only when hotfixEnabled (VCS-branch-derived in JiraTab via
  // isHotfixEnabled), rendered from the separate hotfix sample with hotfix ON.
  const hotfixRequest = useMemo<VersionPreviewRequest>(
    () => ({ version: hotfixSample, technical, hotfixEnabled: true, base, overrides }),
    [hotfixSample, technical, base, overrides],
  )
  const hotfixKey = useDebouncedValue(JSON.stringify(hotfixRequest), 350)
  const hotfixQuery = useVersionPreview(
    useMemo(() => JSON.parse(hotfixKey) as VersionPreviewRequest, [hotfixKey]),
    hotfixEnabled,
  )

  const mainRows = mainQuery.data ? mapDetailedToRows(mainQuery.data, false) : []
  const hotfixRows =
    hotfixEnabled && hotfixQuery.data ? mapDetailedToRows(hotfixQuery.data, true).filter((r) => r.id.startsWith('hotfix')) : []

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

  return (
    <PreviewShell>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <label className="flex items-center gap-2">
          version
          <input
            aria-label="version"
            value={version}
            onChange={(e) => setVersionOverride(e.target.value)}
            className={SAMPLE_INPUT_CLASS}
          />
        </label>
      </div>

      {mainQuery.isLoading && (
        <p data-testid="version-preview-loading" className="py-6 text-center text-sm text-muted-foreground">
          Rendering…
        </p>
      )}

      {!mainQuery.isLoading && mainRows.length === 0 && (
        <p data-testid="version-preview-empty" className="rounded-md bg-muted px-3 py-4 text-xs leading-relaxed text-muted-foreground">
          No preview for this version — enter a version this component’s scheme can parse.
        </p>
      )}

      {/* The hotfix block is nested UNDER a successful main render so the main
          "No preview" notice can never contradict a populated hotfix section
          (the two run as independent queries). When the hotfix sample itself
          doesn't render, a scoped note explains it rather than failing silently. */}
      {mainRows.length > 0 && (
        <>
          <div>{mainRows.map(renderRow)}</div>

          {hotfixEnabled && (
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
                  className={SAMPLE_INPUT_CLASS}
                />
              </label>
              {hotfixRows.length > 0 ? (
                <div>{hotfixRows.map(renderRow)}</div>
              ) : (
                !hotfixQuery.isLoading && (
                  <p
                    data-testid="hotfix-preview-empty"
                    className="rounded-md bg-muted px-3 py-3 text-xs leading-relaxed text-muted-foreground"
                  >
                    No hotfix preview for this version — enter a hotfix version this component’s scheme can parse.
                  </p>
                )
              )}
            </div>
          )}
        </>
      )}
    </PreviewShell>
  )
}
