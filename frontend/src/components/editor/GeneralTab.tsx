import { useEffect } from 'react'
import { UseFormReturn } from 'react-hook-form'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { EmployeeStatusBadge, PeopleInput } from '../ui/PeopleInput'
import { PeopleListInput } from '../ui/PeopleListInput'
import { EnumSelect } from '../ui/EnumSelect'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import { ArtifactOwnershipEditor } from './ArtifactOwnershipEditor'
import { useSupportedGroups } from '../../hooks/useSupportedGroups'
import { fromArtifactId, OWNERSHIP_ALL_VERSIONS, type OwnershipMappingValue } from '../../lib/artifactOwnership'
import type { ComponentDetail } from '../../lib/types'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { hasPermission, PERMISSIONS } from '../../lib/auth'
import { useFieldConfigEntry } from '../../hooks/useFieldConfig'
// Task #14: system is single-select but still needs the FULL dictionary
// (not just in-use values). EnumSelect's default fallback hits
// /components/meta/systems (in-use), so we override its options with
// useSystemsDictionary() → /components/meta/systems/dictionary. The
// filter bar deliberately keeps the in-use endpoint via useFieldOptions
// (filter UX wants to offer values that exist).
import { useSystemsDictionary } from '../../hooks/useSystemsDictionary'
import { lookupEmployee, useEmployeeStatuses } from '../../hooks/useEmployees'
import { WhoCanEditPanel } from './WhoCanEditPanel'

/**
 * Canonical list of field names owned by GeneralTab — used by
 * ComponentDetailPage to decide which CRS 400 field errors are wired to
 * form.setError (and the toast suppressed) vs. surfaced as a toast.
 *
 * Membership rule: a field belongs here only if GeneralTab actually renders
 * an inline-error <p> for it. Otherwise the 400 path would call setError on
 * an unrendered field while suppressing the toast, leaving the user with no
 * visible error. Intentionally excluded:
 *   - productType: rendered/saved by EscrowTab (§7.0/2c migration)
 *   - solution / archived: boolean Switches with no inline error display; let
 *     CRS business-rule violations like "cannot archive while children exist"
 *     surface as a toast. (releasesInDefaultBranch moved to the Jira tab.)
 *   - labels: the editor moved to the component header (badges + popover);
 *     GeneralTab renders no labels input. A labels 400 is mapped by the page's
 *     error handler to form.setError('labels') and surfaced inline in the
 *     always-visible header editor (see ComponentDetailPage + HeaderLabelsEditor).
 */
export const GENERAL_TAB_FIELDS = [
  'name',
  'displayName',
  'componentOwner',
  'system',
  'clientCode',
  // parentComponentName / canBeParent moved to the Misc tab (see MISC_TAB_FIELDS in MiscTab).
  'releaseManager',
  'securityChampion',
  'copyright',
] as const

export interface GeneralFormValues {
  /**
   * Component name. Editable only by users with RENAME_COMPONENTS (today
   * granted to ROLE_ADMIN per CRS application-common.yml). For everyone else
   * the input is disabled and the form value stays equal to component.name.
   * The save handler in ComponentDetailPage compares to component.name and
   * only sends the field on a real change so a non-admin's save does not
   * trip the @PreAuthorize canRenameComponent guard with a 403.
   */
  name: string
  displayName: string
  componentOwner: string
  /** productType stays in GeneralFormValues (still part of the ComponentDetail
   *  DTO) but is rendered and saved from EscrowTab (§7.0/2c migration). */
  productType: string
  // System is single-value per component (CRS PR #301 collapsed the
  // legacy `systems: Set<String>` DTO to scalar). Build-System-style
  // EnumSelect UX. Labels remain `string[]` (chips UX, multi-value).
  system: string
  clientCode: string
  solution: boolean
  archived: boolean
  parentComponentName: string
  // canBeParent — editable Switch: whether this component may be picked as another
  // component's parent. A canBeParent component may not itself have a parent (single
  // level, enforced server-side + in the UI). NOTE: this is NOT the same as an
  // aggregator (a DSL `components { }` owner that forms a group). The `group` is
  // read-only (migration-owned), so the old groupId/groupIsFake form fields are gone.
  canBeParent: boolean
  // SYS-039 → multi-value: ordered people lists (first = primary). The JSON
  // field names stay singular; only the TS type changed string → string[].
  releaseManager: string[]
  securityChampion: string[]
  copyright: string
  labels: string[]
  // schema-v2 per-component child lists. Each list mirrors server state on
  // mount via useEffect; the save handler maps empty + had-prior → [] (clear),
  // empty + no-prior → omit (don't touch), non-empty → REPLACE.
  // (releasesInDefaultBranch moved to the Jira tab; teamcityProjects are now
  // read-only header links, no longer edited here.)
  docs: { docComponentKey: string; majorVersion: string }[]
  // #357 ownership editor: a LIST of mappings (base + per-range overrides), each with a mode.
  artifactIds: OwnershipMappingValue[]
}

interface GeneralTabProps {
  component: ComponentDetail
  form: UseFormReturn<GeneralFormValues>
  isNew?: boolean
  /**
   * Per-component edit gate (from ComponentDetailPage). Drives the "who can edit"
   * footer: editors see it here, while read-only viewers get the same panel as a
   * header banner instead (so it never renders twice or duplicates its testid).
   */
  canEdit?: boolean
  /**
   * In-flight signal of the owner PeopleInput's async directory validation.
   * The typed owner only commits to the form after the lookup resolves, so
   * ComponentDetailPage holds the global Save while this reports true —
   * otherwise the PATCH would silently omit the user's still-uncommitted edit.
   */
  onOwnerValidatingChange?: (validating: boolean) => void
}

export function GeneralTab({ component, form, isNew = false, canEdit = true, onOwnerValidatingChange }: GeneralTabProps) {
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = form

  // Supported groupId prefixes drive the ownership group-prefix check (CRS rule
  // #10). Shared (cached) query — also read by the page for the Save gate.
  const { groups: supportedGroups } = useSupportedGroups()

  const componentOwner = watch('componentOwner')
  // parentComponentName / canBeParent moved to the Misc tab (MiscTab.tsx).
  // SYS-039 watchers — PeopleListInput (multi-value) is controlled, not
  // register'd. releaseManager / securityChampion are ordered string[].
  const releaseManager = watch('releaseManager')
  const securityChampion = watch('securityChampion')
  // Task #14: `system` is a scalar string (single-select EnumSelect), watched
  // so the controlled primitive receives the current value. (Labels moved to
  // the header editor; Doc Links → Documentation tab; Solution → Solution tab —
  // all see ComponentDetailPage.)
  const systemValue = watch('system')

  // Systems dictionary powers the EnumSelect single-select — see note next to
  // its render block for why we override EnumSelect's internal hook.
  // 404/501 → [] (handled by the hook).
  const systemsDict = useSystemsDictionary()

  const { data: employeeStatuses = {} } = useEmployeeStatuses([
    component.componentOwner ?? '',
    ...(component.releaseManager ?? []),
    ...(component.securityChampion ?? []),
  ])

  // Ownership is edited as a whole list by ArtifactOwnershipEditor (not a simple field-array of
  // inputs), so it is watched + replaced wholesale via setValue.
  const watchedArtifactIds = watch('artifactIds')
  // Override mappings must reference an existing configuration range (CRS invariant); offer the
  // component's distinct non-base ranges.
  const ownershipConfigRanges = Array.from(
    new Set((component.configurations ?? []).map((c) => c.versionRange).filter((r) => r && r !== OWNERSHIP_ALL_VERSIONS)),
  )

  // RENAME_COMPONENTS gates the Name input on the edit surface. The same
  // permission is enforced server-side in ComponentControllerV4's PATCH SpEL
  // (canRenameComponent), so the UI gate is UX-only — a non-admin who bypasses
  // it would still be 403'd. We trust hasPermission rather than scrambling to
  // hide on isLoading: an in-flight /auth/me request returns user=undefined,
  // hasPermission returns false, and the input renders disabled, which is the
  // safe-default we want during page load.
  const { data: user } = useCurrentUser()
  const canRename = hasPermission(user, PERMISSIONS.RENAME_COMPONENTS)

  // Field-config visibility entries — section-prefixed paths per ADR-011
  const { entry: displayNameEntry } = useFieldConfigEntry('component.displayName')
  const { entry: componentOwnerEntry } = useFieldConfigEntry('component.componentOwner')
  const { entry: systemEntry } = useFieldConfigEntry('component.system')
  const { entry: clientCodeEntry } = useFieldConfigEntry('component.clientCode')
  // SYS-039 fields. (component.groupId / component.canBeParent FC entries moved to MiscTab.)
  const { entry: releaseManagerEntry } = useFieldConfigEntry('component.releaseManager')
  const { entry: securityChampionEntry } = useFieldConfigEntry('component.securityChampion')
  const { entry: copyrightEntry } = useFieldConfigEntry('component.copyright')

  useEffect(() => {
    // Re-hydration guard. This effect re-runs on every (re)mount and whenever the
    // `component` reference changes (a ['component',id] refetch). Radix unmounts the
    // inactive tab, so switching away from General and back re-mounts GeneralTab and
    // would re-run this — and the form is page-owned, so it survives the unmount. An
    // unconditional re-hydrate there silently stomps in-progress edits with server
    // values and falsely clears the save bar. So skip once the form has unsaved edits
    // (dirty for register()ed inputs, touched for the setValue/chips fields). A genuine
    // component-id change is re-hydrated by the page-level reset (ComponentDetailPage
    // hydratedIdRef effect), not here.
    //
    // Use dirtyFields KEYS, NOT formState.isDirty: subscribing `isDirty` flips RHF's
    // dirty tracking from a collapsed boolean to a per-element array for the whole
    // form, which breaks the page's `dirtyFields.<arrayField> === true` save gates
    // (labels / releaseManager / securityChampion never read as dirty → Save never
    // arms). dirtyFields/touchedFields are already subscribed by the page, so reading
    // their keys here adds no new subscription. (SYS-039 multi-list regression.)
    if (
      Object.keys(form.formState.dirtyFields).length > 0 ||
      Object.keys(form.formState.touchedFields).length > 0
    )
      return
    // Form mirrors server state — hidden fields just stay unrendered. Visibility
    // filtering happens at save time in ComponentDetailPage.handleSave (hidden →
    // undefined in payload), so populating the form here cannot leak server data:
    // there's no input to show it and no save path that emits it.
    setValue('name', component.name)
    setValue('displayName', component.displayName ?? '')
    setValue('componentOwner', component.componentOwner ?? '')
    setValue('productType', component.productType ?? '')
    // CRS PR #301: scalar DTO field, hydrate directly. The `?.[0]` bridge
    // from task #14 is now obsolete.
    setValue('system', component.system ?? '')
    setValue('clientCode', component.clientCode ?? '')
    setValue('solution', component.solution ?? false)
    setValue('archived', component.archived)
    // parentComponentName / canBeParent render on the Misc tab but are hydrated HERE: General
    // is the default tab (always mounted on load), whereas Radix unmounts the inactive Misc
    // tab, so hydrating in MiscTab would leave these unset until the user opens Misc.
    setValue('parentComponentName', component.parentComponentName ?? '')
    setValue('canBeParent', component.canBeParent ?? false)
    // Multi-value lists. Like `labels`, hydration MUST NOT set shouldTouch —
    // the touched flag is the signal ComponentDetailPage.handleSave uses to
    // tell a real user clear-all from the pre-hydration race.
    setValue('releaseManager', component.releaseManager ?? [])
    setValue('securityChampion', component.securityChampion ?? [])
    setValue('copyright', component.copyright ?? '')
    // labels/docs/solution are hydrated HERE (General is the always-mounted
    // default tab) even though their EDITORS now live elsewhere — labels in the
    // header, docs in the Documentation tab, solution in the Solution tab. Those
    // surfaces read/write this same page-owned form. Hydration MUST NOT set
    // `shouldTouch:true` — the touched flag is the signal
    // ComponentDetailPage.handleSave uses to distinguish a real user clear-all
    // from the pre-hydration race (PR #44 follow-up); only the header
    // ChipsInput's onChange sets shouldTouch, on real interaction.
    setValue('labels', component.labels ?? [])
    // schema-v2 lists. setValue replaces the array wholesale.
    setValue(
      'docs',
      (component.docs ?? []).map((d) => ({
        docComponentKey: d.docComponentKey,
        majorVersion: d.majorVersion ?? '',
      })),
    )
    setValue('artifactIds', (component.artifactIds ?? []).map(fromArtifactId))
    // dirtyFields / touchedFields are read as a point-in-time guard, NOT as triggers —
    // adding them to deps would re-run hydration whenever dirtiness changes (i.e. on
    // every edit) and re-stomp the form. Re-hydrate only on a new `component`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [component, setValue])

  return (
    <div className="space-y-6">
      {/* ── Identity ──────────────────────────────────────────────────────── */}
      <section data-testid="section-identity">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Identity</h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Name — editable only with RENAME_COMPONENTS (B7.1.4). On the create
              surface (isNew) the field is unconditionally editable because the
              server enforces RENAME_COMPONENTS only on PATCH; POST permits
              anything the CREATE_COMPONENTS holder can name. */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="name"><FieldLabelText path="component.name" fallback="Component Key" /></Label>
              <FieldInfo path="component.name" label="Component Key" />
            </div>
            <Input
              id="name"
              placeholder="my-component"
              disabled={!isNew && !canRename}
              className={!isNew && !canRename ? 'bg-muted' : undefined}
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
            {!errors.name && !isNew && !canRename && (
              <p className="text-xs text-muted-foreground">
                Renaming requires the RENAME_COMPONENTS permission (typically ROLE_ADMIN).
                Ask an admin to rename this component or request the permission.
              </p>
            )}
            {!errors.name && !isNew && canRename && (
              <p className="text-xs text-muted-foreground">
                Renaming changes the canonical identifier — every legacy v1/v2/v3 lookup
                by old key will resolve to the renamed component.
              </p>
            )}
          </div>

          {/* Display Name — visibility-gated */}
          {displayNameEntry.visibility !== 'hidden' && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="displayName"><FieldLabelText path="component.displayName" fallback="Display Name" /></Label>
                <FieldInfo path="component.displayName" label="Display Name" />
              </div>
              <Input
                id="displayName"
                placeholder="Human-readable name"
                disabled={displayNameEntry.visibility === 'readonly'}
                className={displayNameEntry.visibility === 'readonly' ? 'bg-muted' : undefined}
                {...register('displayName')}
              />
              {errors.displayName && (
                <p className="text-xs text-destructive">{errors.displayName.message}</p>
              )}
            </div>
          )}

          {/* Parent Component, Can-be-parent, and Group Key / Synthetic-group moved to the
              Misc tab (MiscTab.tsx) to keep General focused on identity/ownership/metadata.
              Solution toggle moved to the dedicated Solution tab (conditional on the key
              pattern); Labels moved to the component header. */}
        </div>
      </section>

      {/* ── Ownership ─────────────────────────────────────────────────────── */}
      {(componentOwnerEntry.visibility !== 'hidden' ||
        releaseManagerEntry.visibility !== 'hidden' ||
        securityChampionEntry.visibility !== 'hidden') && (
        <section data-testid="section-ownership">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Ownership</h3>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Component Owner */}
            {componentOwnerEntry.visibility !== 'hidden' && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label htmlFor="componentOwner"><FieldLabelText path="component.componentOwner" fallback="Component Owner" /></Label>
                  <FieldInfo path="component.componentOwner" label="Component Owner" />
                </div>
                {componentOwnerEntry.visibility === 'readonly' ? (
                  <div className="flex items-center gap-2">
                    <Input
                      id="componentOwner"
                      value={componentOwner}
                      disabled
                      className="bg-muted"
                      readOnly
                    />
                    <EmployeeStatusBadge status={employeeStatuses[componentOwner]} />
                  </div>
                ) : (
                  <PeopleInput
                    id="componentOwner"
                    // shouldDirty/shouldTouch are required: componentOwner is written via setValue
                    // (PeopleInput is not a native register()ed input), so without these flags an
                    // edit/clear never marks the form interacted and buildUpdateRequest's
                    // interacted-gate omits it — the clear would be silently dropped.
                    onChange={(val) => setValue('componentOwner', val, { shouldDirty: true, shouldTouch: true })}
                    value={componentOwner}
                    lookupFn={lookupEmployee}
                    status={employeeStatuses[componentOwner]}
                    onValidatingChange={onOwnerValidatingChange}
                  />
                )}
                {errors.componentOwner && (
                  <p className="text-xs text-destructive">{errors.componentOwner.message}</p>
                )}
              </div>
            )}

            {/* Release Managers — SYS-039 multi-value (ordered list). Label is
                plural; the form field key / JSON field name stays singular
                `releaseManager`. */}
            {releaseManagerEntry.visibility !== 'hidden' && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label htmlFor="releaseManager"><FieldLabelText path="component.releaseManager" fallback="Release Managers" /></Label>
                  <FieldInfo path="component.releaseManager" label="Release Managers" />
                </div>
                {releaseManagerEntry.visibility === 'readonly' ? (
                  <div className="flex items-center gap-2">
                    <Input
                      id="releaseManager"
                      value={(releaseManager ?? []).join(', ')}
                      disabled
                      className="bg-muted"
                      readOnly
                    />
                    {(releaseManager ?? []).some((username) => employeeStatuses[username] === false) && (
                      <EmployeeStatusBadge status={false} />
                    )}
                  </div>
                ) : (
                  <PeopleListInput
                    value={releaseManager ?? []}
                    // shouldTouch:true is essential: the form default is [], so
                    // RHF's value-equality dirty check misses a clear-all. The
                    // touched flag is the reliable "user interacted" signal
                    // (mirrors the `labels` precedent for clear-all).
                    onChange={(val) =>
                      setValue('releaseManager', val, { shouldDirty: true, shouldTouch: true })
                    }
                    lookupFn={lookupEmployee}
                    statuses={employeeStatuses}
                  />
                )}
                {errors.releaseManager && (
                  <p className="text-xs text-destructive">{errors.releaseManager.message}</p>
                )}
              </div>
            )}

            {/* Security Champions — SYS-039 multi-value (ordered list). Label is
                plural; the form field key / JSON field name stays singular
                `securityChampion`. */}
            {securityChampionEntry.visibility !== 'hidden' && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label htmlFor="securityChampion"><FieldLabelText path="component.securityChampion" fallback="Security Champions" /></Label>
                  <FieldInfo path="component.securityChampion" label="Security Champions" />
                </div>
                {securityChampionEntry.visibility === 'readonly' ? (
                  <div className="flex items-center gap-2">
                    <Input
                      id="securityChampion"
                      value={(securityChampion ?? []).join(', ')}
                      disabled
                      className="bg-muted"
                      readOnly
                    />
                    {(securityChampion ?? []).some((username) => employeeStatuses[username] === false) && (
                      <EmployeeStatusBadge status={false} />
                    )}
                  </div>
                ) : (
                  <PeopleListInput
                    value={securityChampion ?? []}
                    onChange={(val) =>
                      setValue('securityChampion', val, { shouldDirty: true, shouldTouch: true })
                    }
                    lookupFn={lookupEmployee}
                    statuses={employeeStatuses}
                  />
                )}
                {errors.securityChampion && (
                  <p className="text-xs text-destructive">{errors.securityChampion.message}</p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Metadata ──────────────────────────────────────────────────────── */}
      {(systemEntry.visibility !== 'hidden' ||
        clientCodeEntry.visibility !== 'hidden' ||
        copyrightEntry.visibility !== 'hidden') && (
        <section data-testid="section-metadata">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Metadata</h3>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* System — single-select EnumSelect. Matches the Build System
                UX. We pass the FULL systems dictionary via `optionsOverride`
                rather than relying on EnumSelect's default
                `useFieldOptions('component.system')` fallback — that
                fallback hits the in-use endpoint, which would hide
                newly-defined dictionary values that no component is
                attached to yet. */}
            {systemEntry.visibility !== 'hidden' && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label htmlFor="component-system"><FieldLabelText path="component.system" fallback="System" /></Label>
                  <FieldInfo path="component.system" label="System" />
                </div>
                <EnumSelect
                  id="component-system"
                  fieldPath="component.system"
                  value={systemValue ?? ''}
                  onValueChange={(v) =>
                    setValue('system', v, { shouldDirty: true, shouldTouch: true })
                  }
                  placeholder="Select system"
                  disabled={systemEntry.visibility === 'readonly'}
                  optionsOverride={systemsDict.data ?? []}
                  isLoadingOverride={systemsDict.isLoading}
                  aria-invalid={Boolean(errors.system)}
                  aria-describedby={errors.system ? 'component-system-error' : undefined}
                />
                {errors.system && (
                  <p id="component-system-error" className="text-xs text-destructive">
                    {errors.system.message}
                  </p>
                )}
              </div>
            )}

            {/* Client Code */}
            {clientCodeEntry.visibility !== 'hidden' && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label htmlFor="clientCode"><FieldLabelText path="component.clientCode" fallback="Client Code" /></Label>
                  <FieldInfo path="component.clientCode" label="Client Code" />
                </div>
                <Input
                  id="clientCode"
                  placeholder="CLIENT_CODE"
                  disabled={clientCodeEntry.visibility === 'readonly'}
                  className={clientCodeEntry.visibility === 'readonly' ? 'bg-muted' : undefined}
                  {...register('clientCode')}
                />
                {errors.clientCode && (
                  <p className="text-xs text-destructive">{errors.clientCode.message}</p>
                )}
              </div>
            )}

            {/* Copyright — SYS-039 */}
            {copyrightEntry.visibility !== 'hidden' && (
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="copyright"><FieldLabelText path="component.copyright" fallback="Copyright" /></Label>
                  <FieldInfo path="component.copyright" label="Copyright" />
                </div>
                <Input
                  id="copyright"
                  placeholder="(c) 2026 Acme Inc."
                  disabled={copyrightEntry.visibility === 'readonly'}
                  className={copyrightEntry.visibility === 'readonly' ? 'bg-muted' : undefined}
                  {...register('copyright')}
                />
                {errors.copyright && (
                  <p className="text-xs text-destructive">{errors.copyright.message}</p>
                )}
              </div>
            )}

          </div>
        </section>
      )}

      {/* Doc Links moved to the dedicated Documentation tab (DocumentationTab). */}
      <section data-testid="section-artifact-ids">
        <div className="flex items-center gap-1 mb-3">
          <h3 className="text-sm font-medium text-muted-foreground"><FieldLabelText path="component.artifactIds" fallback="Artifact IDs" /></h3>
          <FieldInfo path="component.artifactIds" label="Artifact IDs" />
        </div>
        <p className="mb-3 text-[13px] text-muted-foreground">
          Artifact coordinates — the groupId and artifactId of artifacts produced at the build and published in
          Artifactory. A component may own several, each with its own rule.
        </p>
        <ArtifactOwnershipEditor
          value={watchedArtifactIds ?? []}
          configRanges={ownershipConfigRanges}
          supportedGroups={supportedGroups}
          disabled={!canEdit}
          onChange={(next) => setValue('artifactIds', next, { shouldDirty: true, shouldTouch: true })}
        />
      </section>

      {/* Who can edit — highlighted read-only footer (owner + RMs + SCs from the
          /editors endpoint; admins also edit). Placed at the bottom of the form
          rather than mid-section so it reads as a summary, not an editable field.
          Editors only: read-only viewers see the same panel as a header banner
          (ComponentDetailPage), so rendering it here too would duplicate it.
          Skip on the create surface (isNew): there's no persisted component yet,
          so /editors would just report "(no people assigned)". */}
      {canEdit && !isNew && <WhoCanEditPanel componentId={component.id} />}

      {component.createdAt && (
        <div className="flex gap-6 text-xs text-muted-foreground">
          <span>Created: {new Date(component.createdAt).toLocaleString()}</span>
          {component.updatedAt && (
            <span>Updated: {new Date(component.updatedAt).toLocaleString()}</span>
          )}
          <span>Version: {component.version}</span>
        </div>
      )}
    </div>
  )
}
