import { useState, type FocusEvent } from 'react'
import { LockKeyhole } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { StatusBanner } from '../ui/status-banner'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import { FieldOverrideInline } from './FieldOverrideInline'
import { useOverridesDraft } from './overridesDraft'
import type { ComponentDetail } from '../../lib/types'
import { isHotfixEnabled } from '../../lib/versionPreview'
import { JiraVersionPreview } from './JiraVersionPreview'
import { cn } from '../../lib/utils'
import { useFieldConfigEntry, useFieldEditable } from '../../hooks/useFieldConfig'
import type { JiraSection } from './useJiraSection'

interface JiraTabProps {
  component: ComponentDetail
  section: JiraSection
  canEdit: boolean
  /**
   * Inline (projectKey, versionPrefix) uniqueness-conflict message from the last
   * failed save (page-level 409 classification). Renders a red border + error
   * under Project Key. Cleared by the page at the start of the next save.
   */
  conflictError?: string | null
  /**
   * EFFECTIVE (outgoing) BASE build system — the Build section's DRAFT value from
   * the page, NOT the persisted component — so the Skip Commit Check Whiskey rule
   * reacts to an unsaved Build-tab switch in the same combined save (Codex #151 P1).
   */
  effectiveBuildSystem: string
}

/** Field-config-derived state of a single jira field for the current user. */
interface FieldState {
  hidden: boolean
  disabled: boolean
  adminOnly: boolean
}

/** Resolve visibility + effective editability for one field path (P-1 axes). */
function useJiraFieldState(path: string): FieldState {
  const { entry } = useFieldConfigEntry(path)
  const editable = useFieldEditable(path)
  return {
    hidden: entry.visibility === 'hidden',
    disabled: !editable,
    adminOnly: entry.editable === 'adminOnly',
  }
}

/**
 * Shared hover/focus link between a format field and its ladder-preview row(s).
 * The current hovered field-path is lifted to JiraTab so field inputs and preview
 * rows can cross-highlight; mouse AND focus drive it so it stays keyboard-usable.
 */
interface HoverLink {
  hoveredField: string | null
  onHoverField: (field: string | null) => void
}

// Ring shown while the field is the shared hovered/focused one (activates only on
// data-highlighted=true, so it is inert when no hover link is wired).
const HOVER_RING =
  'rounded-md transition-shadow data-[highlighted=true]:ring-2 data-[highlighted=true]:ring-primary/60 data-[highlighted=true]:ring-offset-2 data-[highlighted=true]:ring-offset-background'

/** Spread onto a format-field container to wire highlight + hover/focus reporting. */
function hoverProps(path: string, hover?: HoverLink) {
  if (!hover) return {}
  return {
    'data-highlighted': hover.hoveredField === path ? 'true' : undefined,
    onMouseEnter: () => hover.onHoverField(path),
    onMouseLeave: () => hover.onHoverField(null),
    // Focus-within semantics: report on focus, and clear only when focus actually
    // LEAVES the container. A field block has several focusable descendants (input,
    // "Set/Remove separate" buttons, "+ Add override"); tabbing between them bubbles
    // blur, so a naive onBlur→null would flicker the highlight (Copilot #153).
    onFocus: () => hover.onHoverField(path),
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hover.onHoverField(null)
    },
  }
}

/** Small "admin only" lock pill shown beside an admin-gated control for non-admins. */
function AdminOnlyPill({ title }: { title?: string }) {
  return (
    <Badge variant="secondary" className="gap-1 font-normal" title={title}>
      <LockKeyhole className="h-3 w-3" aria-hidden="true" />
      admin only
    </Badge>
  )
}

/** A plain editable format-template field (label + info + input + overrides). */
function FormatField({
  path,
  fallback,
  sub,
  value,
  onChange,
  placeholder,
  state,
  canEdit,
  hover,
}: {
  path: string
  fallback: string
  sub?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  state: FieldState
  canEdit: boolean
  hover?: HoverLink
}) {
  if (state.hidden) return null
  return (
    <div className={cn('space-y-1.5', HOVER_RING)} data-field={path} {...hoverProps(path, hover)}>
      <div className="flex items-center gap-1">
        <Label>
          <FieldLabelText path={path} fallback={fallback} />
          {sub && <span className="ml-1 font-normal text-muted-foreground">{sub}</span>}
        </Label>
        <FieldInfo path={path} label={fallback} />
        {state.adminOnly && state.disabled && <AdminOnlyPill title="Only administrators can change this." />}
      </div>
      <Input
        aria-label={fallback}
        data-field-input={path}
        value={value}
        disabled={state.disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <FieldOverrideInline canEdit={canEdit} overriddenAttribute={path} />
    </div>
  )
}

/**
 * A derived (mirror) format field — Minor mirrors Line, Build mirrors Release.
 * Mirrored: read-only box showing the leading value + pill + "Set separate…".
 * Separate: editable input + "Remove separate format" (disabled with an amber
 * note when per-range overrides exist — the pair must not collapse then).
 */
function MirrorField({
  path,
  fallback,
  pill,
  setLabel,
  leadingValue,
  separate,
  separateValue,
  onEdit,
  onSetSeparate,
  onRemoveSeparate,
  hasOverrides,
  placeholder,
  state,
  canEdit,
  hover,
}: {
  path: string
  fallback: string
  pill: string
  setLabel: string
  leadingValue: string
  separate: boolean
  separateValue: string
  onEdit: (v: string) => void
  onSetSeparate: () => void
  onRemoveSeparate: () => void
  hasOverrides: boolean
  placeholder?: string
  state: FieldState
  canEdit: boolean
  hover?: HoverLink
}) {
  if (state.hidden) return null
  return (
    <div className={cn('space-y-1.5', HOVER_RING)} data-field={path} {...hoverProps(path, hover)}>
      <div className="flex items-center gap-1">
        <Label>
          <FieldLabelText path={path} fallback={fallback} />
        </Label>
        <FieldInfo path={path} label={fallback} />
        {state.adminOnly && state.disabled && <AdminOnlyPill title="Only administrators can change this." />}
        {/* Mirror pill sits on the label row (not inside the value box) so the full
            mirrored format value stays visible. */}
        {!separate && (
          <Badge variant="secondary" className="ml-auto font-normal">
            {pill}
          </Badge>
        )}
      </div>

      {!separate ? (
        <>
          <div className="flex h-9 items-center rounded-md border bg-muted px-3">
            <input
              readOnly
              tabIndex={-1}
              aria-label={`${fallback} (mirrored)`}
              data-field-mirror={path}
              value={leadingValue}
              className="w-full bg-transparent font-mono text-sm text-muted-foreground outline-none"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={state.disabled}
            onClick={onSetSeparate}
          >
            {setLabel}
          </Button>
        </>
      ) : (
        <>
          <Input
            aria-label={fallback}
            data-field-input={path}
            value={separateValue}
            disabled={state.disabled}
            onChange={(e) => onEdit(e.target.value)}
            placeholder={placeholder}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={state.disabled || hasOverrides}
            onClick={onRemoveSeparate}
          >
            Remove separate format
          </Button>
          {hasOverrides && (
            <p className="text-xs text-[color:var(--color-badge-yellow-fg)]">
              Can’t remove — per-range overrides exist on this field.
            </p>
          )}
        </>
      )}

      <FieldOverrideInline canEdit={canEdit} overriddenAttribute={path} />
    </div>
  )
}

/** Jira tab — presentational. State + slice live in `useJiraSection` (page-owned). */
export function JiraTab({ component, section, canEdit, conflictError, effectiveBuildSystem }: JiraTabProps) {
  const { state, set, setMinorSeparate, setBuildSeparate } = section
  const { effectiveOverrides } = useOverridesDraft()

  // Field-config visibility + per-user editability for every jira field.
  const projectKeyFs = useJiraFieldState('jira.projectKey')
  const versionPrefixFs = useJiraFieldState('jira.versionPrefix')
  const versionFormatFs = useJiraFieldState('jira.versionFormat')
  const lineFs = useJiraFieldState('jira.lineVersionFormat')
  const minorFs = useJiraFieldState('jira.minorVersionFormat')
  const releaseFs = useJiraFieldState('jira.releaseVersionFormat')
  const buildFs = useJiraFieldState('jira.buildVersionFormat')
  const hotfixFs = useJiraFieldState('jira.hotfixVersionFormat')
  const technicalFs = useJiraFieldState('jira.technical')
  // Hotfix is a top-level scalar CRS enforces on `component.jiraHotfixVersionFormat`
  // while the tab renders under `jira.hotfixVersionFormat`; disable the input when
  // EITHER path is non-editable so the UI matches the hook's send-gate.
  const hotfixWriteEditable = useFieldEditable('component.jiraHotfixVersionFormat')
  const hotfixState: FieldState = { ...hotfixFs, disabled: hotfixFs.disabled || !hotfixWriteEditable }

  const { entry: releasesEntry } = useFieldConfigEntry('component.releasesInDefaultBranch')
  const releasesReadonly = releasesEntry.visibility === 'readonly'
  const releasesHidden = releasesEntry.visibility === 'hidden'

  const { entry: jiraDisplayNameEntry } = useFieldConfigEntry('jira.displayName')
  // Show the Jira display name only when set AND divergent from the component
  // display name (decision fixed on loaded values so it can't vanish mid-edit).
  const showJiraDisplayName =
    jiraDisplayNameEntry.visibility !== 'hidden' &&
    (component.jiraDisplayName ?? '') !== '' &&
    component.jiraDisplayName !== component.displayName

  // Effective (outgoing) BASE build system drives the Whiskey rule for Skip
  // Commit Check — from the page's Build draft, so a cross-tab switch reacts live.
  const isWhiskey = effectiveBuildSystem === 'WHISKEY'

  const hotfixEnabled = isHotfixEnabled(component)

  // Shared hovered format-field path, lifted here so the format fields (below)
  // and the ladder-preview rows cross-highlight in both directions (P-2b).
  const [hoveredField, setHoveredField] = useState<string | null>(null)
  const hover: HoverLink = { hoveredField, onHoverField: setHoveredField }

  // Per-range overrides on a mirror field block collapse and force the expanded
  // view (task B: never collapse if overrides exist).
  const minorHasOverrides = effectiveOverrides.some((o) => o.overriddenAttribute === 'jira.minorVersionFormat')
  const buildHasOverrides = effectiveOverrides.some((o) => o.overriddenAttribute === 'jira.buildVersionFormat')
  const minorSeparateView = state.minorSeparate || minorHasOverrides
  const buildSeparateView = state.buildSeparate || buildHasOverrides

  return (
    <div className="space-y-8">
      {/* ── Group 1: Jira project ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold">Jira project</h3>
          <p className="text-sm text-muted-foreground">
            Where releases and issues of this component are tracked.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!projectKeyFs.hidden && (
            <div className="space-y-1.5" data-field="jira.projectKey">
              <div className="flex items-center gap-1">
                <Label htmlFor="jira-projectKey">
                  <FieldLabelText path="jira.projectKey" fallback="Project Key" />
                  <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>
                </Label>
                <FieldInfo path="jira.projectKey" label="Project Key" />
                {projectKeyFs.adminOnly && projectKeyFs.disabled && <AdminOnlyPill title="Only administrators can change this." />}
              </div>
              <Input
                id="jira-projectKey"
                aria-label="Project Key"
                aria-invalid={conflictError ? true : undefined}
                value={state.projectKey}
                disabled={projectKeyFs.disabled}
                onChange={(e) => set('projectKey', e.target.value)}
                placeholder="JIRA project key"
                className={conflictError ? 'border-destructive focus-visible:ring-destructive' : undefined}
              />
              {conflictError && (
                <p role="alert" className="text-sm text-destructive">
                  {conflictError}
                </p>
              )}
              <FieldOverrideInline canEdit={canEdit} overriddenAttribute="jira.projectKey" />
            </div>
          )}

          {showJiraDisplayName && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="jira-displayName">
                  <FieldLabelText path="jira.displayName" fallback="Display Name" />
                </Label>
                <FieldInfo path="jira.displayName" label="Display Name" />
              </div>
              <Input
                id="jira-displayName"
                aria-label="Jira Display Name"
                value={state.displayName}
                onChange={(e) => set('displayName', e.target.value)}
                disabled={jiraDisplayNameEntry.visibility === 'readonly'}
                className={jiraDisplayNameEntry.visibility === 'readonly' ? 'bg-muted' : undefined}
                placeholder="Component display name in Jira"
              />
              <p className="text-xs text-muted-foreground">
                Shown because it differs from the component display name.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Group 2: Version formats ──────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold">Version formats</h3>
          <p className="text-sm text-muted-foreground">
            Templates that render a version for Jira, CI and reports.
          </p>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            {/* Prefix + Full Version Format (adjacent pair) */}
            <FormatField
              path="jira.versionPrefix"
              fallback="Jira Version Prefix"
              value={state.versionPrefix}
              onChange={(v) => set('versionPrefix', v)}
              placeholder="e.g. v"
              state={versionPrefixFs}
              canEdit={canEdit}
              hover={hover}
            />
            <FormatField
              path="jira.versionFormat"
              fallback="Full Version Format in Jira"
              value={state.versionFormat}
              onChange={(v) => set('versionFormat', v)}
              placeholder="$versionPrefix-$baseVersionFormat"
              state={versionFormatFs}
              canEdit={canEdit}
              hover={hover}
            />

            {/* Line (leading) + Minor (mirror) */}
            <FormatField
              path="jira.lineVersionFormat"
              fallback="Line Version Format"
              sub="(Major)"
              value={state.lineVersionFormat}
              onChange={(v) => set('lineVersionFormat', v)}
              placeholder="e.g. {major}.{minor}.x"
              state={lineFs}
              canEdit={canEdit}
              hover={hover}
            />
            <MirrorField
              path="jira.minorVersionFormat"
              fallback="Minor Version Format"
              pill="from Line"
              setLabel="Set separate minor format"
              leadingValue={state.lineVersionFormat}
              separate={minorSeparateView}
              separateValue={state.minorSeparate ? state.minorVersionFormat : state.lineVersionFormat}
              onEdit={(v) => (state.minorSeparate ? set('minorVersionFormat', v) : setMinorSeparate(true, v))}
              onSetSeparate={() => setMinorSeparate(true)}
              onRemoveSeparate={() => setMinorSeparate(false)}
              hasOverrides={minorHasOverrides}
              placeholder="e.g. {major}.0.0"
              state={minorFs}
              canEdit={canEdit}
              hover={hover}
            />

            {/* Release (leading) + Build (mirror) */}
            <FormatField
              path="jira.releaseVersionFormat"
              fallback="Release Version Format"
              value={state.releaseVersionFormat}
              onChange={(v) => set('releaseVersionFormat', v)}
              placeholder="e.g. {major}.{minor}.0"
              state={releaseFs}
              canEdit={canEdit}
              hover={hover}
            />
            <MirrorField
              path="jira.buildVersionFormat"
              fallback="Build Version Format"
              pill="same as release"
              setLabel="Set separate build format"
              leadingValue={state.releaseVersionFormat}
              separate={buildSeparateView}
              separateValue={state.buildSeparate ? state.buildVersionFormat : ''}
              onEdit={(v) => (state.buildSeparate ? set('buildVersionFormat', v) : setBuildSeparate(true, v))}
              onSetSeparate={() => setBuildSeparate(true)}
              onRemoveSeparate={() => setBuildSeparate(false)}
              hasOverrides={buildHasOverrides}
              placeholder="e.g. {major}.{minor}.{patch}"
              state={buildFs}
              canEdit={canEdit}
              hover={hover}
            />

            {/* Hotfix — only when hotfixes are enabled (task D) */}
            {hotfixEnabled && !hotfixState.hidden && (
              <div className="sm:col-span-2">
                <FormatField
                  path="jira.hotfixVersionFormat"
                  fallback="Hotfix Version Format"
                  value={state.hotfixVersionFormat}
                  onChange={(v) => set('hotfixVersionFormat', v)}
                  placeholder="e.g. {major}.{minor}.{patch}.{hotfix}"
                  state={hotfixState}
                  canEdit={canEdit}
                  hover={hover}
                />
              </div>
            )}
          </div>

          {/* P-2b version-ladder preview — cross-highlights with the fields above. */}
          <aside data-testid="version-preview-slot" className="w-full lg:w-[360px] lg:flex-none">
            <JiraVersionPreview
              versionPrefix={state.versionPrefix}
              versionFormat={state.versionFormat}
              lineVersionFormat={state.lineVersionFormat}
              minorVersionFormat={state.minorVersionFormat}
              minorSeparate={state.minorSeparate}
              releaseVersionFormat={state.releaseVersionFormat}
              buildVersionFormat={state.buildVersionFormat}
              buildSeparate={state.buildSeparate}
              hotfixVersionFormat={state.hotfixVersionFormat}
              technical={state.technical}
              hotfixEnabled={hotfixEnabled}
              hoveredField={hoveredField}
              onHoverField={setHoveredField}
            />
          </aside>
        </div>
      </section>

      {/* ── Group 3: Flags ────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold">Flags</h3>
        </div>

        {!releasesHidden && (
          <div className="flex items-center gap-3" data-field="component.releasesInDefaultBranch">
            <Switch
              id="releasesInDefaultBranch"
              checked={state.releasesInDefaultBranch}
              disabled={releasesReadonly}
              onCheckedChange={(v) => set('releasesInDefaultBranch', v)}
            />
            <Label htmlFor="releasesInDefaultBranch" className="cursor-pointer">
              <FieldLabelText path="component.releasesInDefaultBranch" fallback="Releases in default branch" />
            </Label>
            <FieldInfo path="component.releasesInDefaultBranch" label="Releases in default branch" />
          </div>
        )}

        {!technicalFs.hidden && (
          <div className="space-y-2" data-field="jira.technical">
            <div className="flex items-center gap-3">
              <Switch
                id="jira-technical"
                checked={state.technical}
                disabled={technicalFs.disabled}
                onCheckedChange={(v) => set('technical', v)}
              />
              <Label htmlFor="jira-technical" className="cursor-pointer">
                <FieldLabelText path="jira.technical" fallback="Technical" />
              </Label>
              <FieldInfo path="jira.technical" label="Technical" />
              {technicalFs.adminOnly && technicalFs.disabled && <AdminOnlyPill title="Only administrators can change this." />}
            </div>
            {state.technical && (
              <StatusBanner variant="info" className="ml-14 max-w-2xl">
                Versions of this technical component are tracked in the Jira field{' '}
                <strong>“SubComponent Fix Version/s”</strong> and are excluded from customer-facing
                release notes. When it is later included in a main component, the main component’s
                version is also written to the issue’s Fix Version/s.
              </StatusBanner>
            )}
            <FieldOverrideInline canEdit={canEdit} overriddenAttribute="jira.technical" />
          </div>
        )}

        {/* Skip Commit Check — new; editable by any editor (canEdit), disabled
            for Whiskey components. No per-range override affordance (component-level). */}
        <div className="space-y-1" data-field="skipCommitCheck">
          <div className="flex items-center gap-3">
            <Switch
              id="jira-skipCommitCheck"
              checked={state.skipCommitCheck && !isWhiskey}
              disabled={isWhiskey}
              onCheckedChange={(v) => set('skipCommitCheck', v)}
            />
            <Label htmlFor="jira-skipCommitCheck" className="cursor-pointer">
              <FieldLabelText path="jira.skipCommitCheck" fallback="Skip Commit Check at Issue Assignment at Release" />
            </Label>
            <FieldInfo path="jira.skipCommitCheck" label="Skip Commit Check at Issue Assignment at Release" />
          </div>
          {isWhiskey && (
            <p className="ml-14 text-xs italic text-muted-foreground">
              Not applicable for Whiskey components
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
