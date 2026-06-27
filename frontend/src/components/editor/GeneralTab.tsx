import { useEffect } from 'react'
import { UseFormReturn, useFieldArray } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { EmployeeStatusBadge, PeopleInput } from '../ui/PeopleInput'
import { PeopleListInput } from '../ui/PeopleListInput'
import { ComponentSelect } from '../ui/ComponentSelect'
import { ChipsInput } from '../ui/ChipsInput'
import { EnumSelect } from '../ui/EnumSelect'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import { ArtifactOwnershipEditor } from './ArtifactOwnershipEditor'
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
import { useLabelsDictionary } from '../../hooks/useLabelsDictionary'
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
  'labels',
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
    control,
    register,
    setValue,
    watch,
    formState: { errors },
  } = form

  const solution = watch('solution')
  const componentOwner = watch('componentOwner')
  // parentComponentName / canBeParent moved to the Misc tab (MiscTab.tsx).
  // SYS-039 watchers — PeopleListInput (multi-value) / Switch are controlled,
  // not register'd. releaseManager / securityChampion are ordered string[].
  const releaseManager = watch('releaseManager')
  const securityChampion = watch('securityChampion')
  // Task #14: `system` is a scalar string (single-select EnumSelect).
  // `labels` stays an array (chips UX). Both watched so the controlled
  // primitives receive the current value.
  const systemValue = watch('system')
  const labelsValue = watch('labels')

  // Labels dictionary powers the chips UX. Task #14: systems dictionary
  // is needed too for the EnumSelect single-select — see note next to
  // its render block for why we override EnumSelect's internal hook.
  // 404/501 → [] (handled by the hooks).
  const labelsDict = useLabelsDictionary()
  const systemsDict = useSystemsDictionary()
  const { data: employeeStatuses = {} } = useEmployeeStatuses([
    component.componentOwner ?? '',
    ...(component.releaseManager ?? []),
    ...(component.securityChampion ?? []),
  ])

  // schema-v2 list editors. useFieldArray provides stable `id` keys so row
  // re-renders don't blow away focus on text inputs.
  const docsFieldArray = useFieldArray({ control, name: 'docs' })
  // Ownership is edited as a whole list by ArtifactOwnershipEditor (not a simple field-array of
  // inputs), so it is watched + replaced wholesale via setValue.
  const watchedArtifactIds = watch('artifactIds')
  // Override mappings must reference an existing configuration range (CRS invariant); offer the
  // component's distinct non-base ranges.
  const ownershipConfigRanges = Array.from(
    new Set((component.configurations ?? []).map((c) => c.versionRange).filter((r) => r && r !== OWNERSHIP_ALL_VERSIONS)),
  )

  // Doc-link rows use a controlled ComponentSelect (filtered to label=doc), so
  // watch the array to feed each row's current value.
  const watchedDocs = watch('docs')

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
  const { entry: labelsEntry } = useFieldConfigEntry('component.labels')

  useEffect(() => {
    // Form mirrors server state unconditionally — hidden fields just stay
    // unrendered. Visibility filtering happens at save time in
    // ComponentDetailPage.handleSave (hidden → undefined in payload), so
    // populating the form here cannot leak server data: there's no input
    // to show it and no save path that emits it.
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
    // Hydration MUST NOT set `shouldTouch:true` — the touched flag is the
    // signal ComponentDetailPage.handleSave uses to distinguish a real
    // user clear-all from the pre-hydration race (PR #44 follow-up).
    // Only the ChipsInput onChange below sets shouldTouch, when the user
    // actually interacts with the field.
    setValue('labels', component.labels ?? [])
    // schema-v2 lists. setValue replaces the array wholesale; useFieldArray
    // picks up the new keys on the next render.
    setValue(
      'docs',
      (component.docs ?? []).map((d) => ({
        docComponentKey: d.docComponentKey,
        majorVersion: d.majorVersion ?? '',
      })),
    )
    setValue('artifactIds', (component.artifactIds ?? []).map(fromArtifactId))
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
              Misc tab (MiscTab.tsx) to keep General focused on identity/ownership/metadata. */}

          {/* Solution toggle */}
          <div className="sm:col-span-2 flex items-center gap-3">
            <Switch
              id="solution"
              checked={solution}
              // shouldDirty:true so the page-level handleSave's
              // dirtyFields.solution gate actually fires. Without this the
              // boolean is set on the form but never marked dirty, and the
              // save handler omits the field every time.
              onCheckedChange={(checked) => setValue('solution', checked, { shouldDirty: true })}
            />
            <Label htmlFor="solution" className="cursor-pointer"><FieldLabelText path="component.solution" fallback="Solution" /></Label>
            <FieldInfo path="component.solution" label="Solution" />
          </div>

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
                    value={componentOwner}
                    onChange={(val) => setValue('componentOwner', val)}
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
        copyrightEntry.visibility !== 'hidden' ||
        labelsEntry.visibility !== 'hidden') && (
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

            {/* Labels — chips/tags UX (task #9). Each value renders as a
                shadcn Badge with an inline × close button; an inline
                "Add label" picker offers the dictionary minus already-
                added values. No free-text path — picks are restricted to
                useLabelsDictionary(). Wire contract unchanged:
                buildUpdateRequest still emits `labels: []` on dirty+
                explicit-clear, omits on pre-hydration. */}
            {labelsEntry.visibility !== 'hidden' && (
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="component-labels"><FieldLabelText path="component.labels" fallback="Labels" /></Label>
                  <FieldInfo path="component.labels" label="Labels" />
                </div>
                <ChipsInput
                  id="component-labels"
                  value={labelsValue ?? []}
                  onChange={(next) =>
                    // shouldTouch:true marks the field as user-interacted
                    // even when shouldDirty's value-equality check fails
                    // (e.g. user removes the last chip and the new value
                    // [] equals the form default []). ComponentDetailPage
                    // reads `touchedFields.labels` to distinguish a real
                    // clear-all from the pre-hydration race where the
                    // form-default [] and a non-empty component.labels
                    // would otherwise look identical to the value-compare.
                    setValue('labels', next, { shouldDirty: true, shouldTouch: true })
                  }
                  options={labelsDict.data ?? []}
                  isLoading={labelsDict.isLoading}
                  placeholder="Add label"
                  disabled={labelsEntry.visibility === 'readonly'}
                  ariaInvalid={Boolean(errors.labels)}
                  ariaDescribedBy={errors.labels ? 'component-labels-error' : undefined}
                />
                {errors.labels && (
                  <p id="component-labels-error" className="text-xs text-destructive">
                    {errors.labels.message}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── References (Doc Links + Artifact IDs) ─────────────────────────────
          Both are per-component child lists introduced by schema-v2. No
          field-config gates today; full visibility for all editors. */}
      <section data-testid="section-references">
        <div className="flex items-center gap-1 mb-3">
          <h3 className="text-sm font-medium text-muted-foreground"><FieldLabelText path="component.docs" fallback="Doc Links" /></h3>
          <FieldInfo path="component.docs" label="Doc Links" />
        </div>
        <div className="space-y-2">
          {docsFieldArray.fields.length === 0 ? (
            <p className="text-xs text-muted-foreground">No documentation links configured.</p>
          ) : (
            docsFieldArray.fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                {/* Doc target restricted to components carrying the `doc` label.
                    `strict` enforces the restriction: only a suggestion click
                    (drawn from the doc-filtered list) commits — a free-typed
                    non-doc key reverts on blur instead of being saved. Without
                    it the `filter` only narrowed the suggestions while any typed
                    key still committed. */}
                <ComponentSelect
                  id={`docs-${index}-key`}
                  ariaLabel={`Doc link component key (row ${index + 1})`}
                  value={watchedDocs?.[index]?.docComponentKey ?? ''}
                  onChange={(val) =>
                    setValue(`docs.${index}.docComponentKey` as const, val, { shouldDirty: true })
                  }
                  filter={{ labels: ['doc'] }}
                  strict
                  placeholder="docs-component-key"
                />
                <Input
                  placeholder="majorVersion (e.g. 3.x)"
                  aria-label={`Doc link major version (row ${index + 1})`}
                  {...register(`docs.${index}.majorVersion` as const)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive"
                  onClick={() => docsFieldArray.remove(index)}
                  aria-label="Remove doc link"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => docsFieldArray.append({ docComponentKey: '', majorVersion: '' })}
          >
            <Plus className="h-4 w-4" />
            Add doc link
          </Button>
        </div>
      </section>

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
