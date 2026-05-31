import { useEffect, useState } from 'react'
import { UseFormReturn, useFieldArray } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { PeopleInput } from '../ui/PeopleInput'
import { PeopleListInput } from '../ui/PeopleListInput'
import { ComponentSelect } from '../ui/ComponentSelect'
import { ChipsInput } from '../ui/ChipsInput'
import { EnumSelect } from '../ui/EnumSelect'
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
import { useSupportedGroups } from '../../hooks/useSupportedGroups'

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
  'parentComponentName',
  'groupId',
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
  // schema-v2: groupId is the user-facing label for component.group.groupKey;
  // groupIsFake checkboxes the typed ComponentGroupRequest.isFake flag. Blank
  // groupId + existing component.group → clearGroup:true on save.
  groupId: string
  groupIsFake: boolean
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
  artifactIds: { groupPattern: string; artifactPattern: string }[]
}

interface GeneralTabProps {
  component: ComponentDetail
  form: UseFormReturn<GeneralFormValues>
  isNew?: boolean
}

export function GeneralTab({ component, form, isNew = false }: GeneralTabProps) {
  const {
    control,
    register,
    setValue,
    watch,
    formState: { errors },
  } = form

  const solution = watch('solution')
  const componentOwner = watch('componentOwner')
  const parentComponentName = watch('parentComponentName')
  // SYS-039 watchers — PeopleListInput (multi-value) / Switch are controlled,
  // not register'd. releaseManager / securityChampion are ordered string[].
  const releaseManager = watch('releaseManager')
  const securityChampion = watch('securityChampion')
  const groupIsFake = watch('groupIsFake')
  // Task #14: `system` is a scalar string (single-select EnumSelect).
  // `labels` stays an array (chips UX). Both watched so the controlled
  // primitives receive the current value.
  const systemValue = watch('system')
  const labelsValue = watch('labels')
  const groupIdValue = watch('groupId')

  // Labels dictionary powers the chips UX. Task #14: systems dictionary
  // is needed too for the EnumSelect single-select — see note next to
  // its render block for why we override EnumSelect's internal hook.
  // 404/501 → [] (handled by the hooks).
  const labelsDict = useLabelsDictionary()
  const systemsDict = useSystemsDictionary()

  // Supported groupId prefixes — same loud error policy as the Create
  // dialog. Empty list (loading/errored) → skip the prefix check so a
  // transient hiccup doesn't lock the user out of saving an already-valid
  // group; the required-marker guard still blocks blank inputs.
  const supportedGroups = useSupportedGroups()
  const supportedGroupsList = supportedGroups.data ?? []

  // Group Key required-on-blur state. Tracked locally because the field is
  // RHF-registered but the required check is not a Zod refinement — the
  // editor surface composes its own validation around the page-level save.
  const [groupIdTouched, setGroupIdTouched] = useState(false)
  const trimmedGroupId = (groupIdValue ?? '').trim()
  const groupIdRequiredError = groupIdTouched && trimmedGroupId === ''
  // PR #44 review (Sonnet): also gate the prefix error on `groupIdTouched`.
  // Legacy components whose stored groupKey doesn't match the current
  // supported-prefix list would otherwise render a red inline error on
  // page load, alarming users editing unrelated fields. The save-side
  // guard in ComponentDetailPage.handleSave already gates on
  // `groupIdDirty`, so the render-side mirror keeps the two layers
  // consistent.
  const groupIdPrefixError = (() => {
    if (!groupIdTouched) return null
    if (trimmedGroupId === '') return null
    if (supportedGroupsList.length === 0) return null
    const v = trimmedGroupId.toLowerCase()
    const ok = supportedGroupsList.some((p) => {
      const lp = p.toLowerCase()
      return v === lp || v.startsWith(lp + '.')
    })
    return ok ? null : `Group Key must start with one of: ${supportedGroupsList.join(', ')}`
  })()

  // schema-v2 list editors. useFieldArray provides stable `id` keys so row
  // re-renders don't blow away focus on text inputs.
  const docsFieldArray = useFieldArray({ control, name: 'docs' })
  const artifactIdsFieldArray = useFieldArray({ control, name: 'artifactIds' })

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
  // SYS-039 fields
  const { entry: groupIdEntry } = useFieldConfigEntry('component.groupId')
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
    setValue('parentComponentName', component.parentComponentName ?? '')
    // schema-v2: groupId is the typed component.group.groupKey; isFake mirrors
    // ComponentGroup.isFake. The component.group.role is server-derived
    // (AGGREGATOR | MEMBER) and rendered as a readonly badge — it never enters
    // the form.
    setValue('groupId', component.group?.groupKey ?? '')
    setValue('groupIsFake', component.group?.isFake ?? false)
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
    setValue(
      'artifactIds',
      (component.artifactIds ?? []).map((a) => ({
        groupPattern: a.groupPattern,
        artifactPattern: a.artifactPattern,
      })),
    )
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
              anything the EDIT_COMPONENTS holder can name. */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Component Key</Label>
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
              <Label htmlFor="displayName">Display Name</Label>
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

          {/* Parent Component — editable autocomplete (7.1.5). Backend stores the
              canonical `name`, so the picker writes the same. Empty string maps to
              "no parent" at save time (ComponentDetailPage hands the wire layer a
              `null`, see useComponent.ts ComponentUpdateRequest). */}
          <div className="space-y-1.5 sm:col-span-2 sm:max-w-md">
            <Label htmlFor="parentComponentName">Parent Component</Label>
            <ComponentSelect
              id="parentComponentName"
              value={parentComponentName ?? ''}
              excludeName={component.name}
              onChange={(val) => setValue('parentComponentName', val, { shouldDirty: true })}
              placeholder="No parent (top-level component)"
            />
            {errors.parentComponentName ? (
              <p className="text-xs text-destructive">{errors.parentComponentName.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Reference another component by name. Leave blank for a top-level component.
              </p>
            )}
          </div>

          {/* schema-v2 group editor — typed ComponentGroup row.
              groupId = group.groupKey; isFake = group.isFake; role is
              server-derived (AGGREGATOR | MEMBER) and displayed as a readonly
              badge so the user can see the resolved role without editing.
              ui-swift-sloth §3.5: Group Key is required server-side, surfaced
              via the `*` marker, blur-empty inline error, and a disallowed-
              prefix gate driven by useSupportedGroups(). */}
          {groupIdEntry.visibility !== 'hidden' && (
            <div className="space-y-1.5">
              <Label htmlFor="groupId">
                Group Key <span className="text-destructive">*</span>
              </Label>
              <Input
                id="groupId"
                placeholder="org.example.product"
                disabled={groupIdEntry.visibility === 'readonly'}
                aria-required
                aria-invalid={Boolean(errors.groupId || groupIdRequiredError || groupIdPrefixError)}
                // PR #44 comment (copilot-pull-request-reviewer): associate
                // the visible error <p> with the field so screen readers
                // announce the actual message rather than just "invalid".
                aria-describedby={
                  errors.groupId
                    ? 'groupId-server-error'
                    : groupIdRequiredError
                      ? 'groupId-required-error'
                      : groupIdPrefixError
                        ? 'groupId-prefix-error'
                        : undefined
                }
                className={groupIdEntry.visibility === 'readonly' ? 'bg-muted' : undefined}
                {...register('groupId', {
                  onBlur: () => setGroupIdTouched(true),
                  // Typing into the field is also "touched" — without this
                  // the prefix-error would stay hidden until the user
                  // explicitly tabs away, which is awkward when the user
                  // is iterating on the value.
                  onChange: () => {
                    if (!groupIdTouched) setGroupIdTouched(true)
                  },
                })}
              />
              {errors.groupId && (
                <p id="groupId-server-error" className="text-xs text-destructive">
                  {errors.groupId.message}
                </p>
              )}
              {!errors.groupId && groupIdRequiredError && (
                <p id="groupId-required-error" className="text-xs text-destructive">
                  Group Key is required
                </p>
              )}
              {!errors.groupId && !groupIdRequiredError && groupIdPrefixError && (
                <p id="groupId-prefix-error" className="text-xs text-destructive">
                  {groupIdPrefixError}
                </p>
              )}
              <div className="flex items-center gap-3 pt-1">
                <Switch
                  id="groupIsFake"
                  checked={groupIsFake}
                  disabled={groupIdEntry.visibility === 'readonly'}
                  onCheckedChange={(checked) => setValue('groupIsFake', checked, { shouldDirty: true })}
                />
                <Label htmlFor="groupIsFake" className="cursor-pointer text-xs">Synthetic group (isFake)</Label>
                {component.group?.role && (
                  <Badge variant="outline" className="text-xs">{component.group.role}</Badge>
                )}
              </div>
            </div>
          )}

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
            <Label htmlFor="solution" className="cursor-pointer">Solution</Label>
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
                <Label htmlFor="componentOwner">Component Owner</Label>
                {componentOwnerEntry.visibility === 'readonly' ? (
                  <Input
                    id="componentOwner"
                    value={componentOwner}
                    disabled
                    className="bg-muted"
                    readOnly
                  />
                ) : (
                  <PeopleInput
                    value={componentOwner}
                    onChange={(val) => setValue('componentOwner', val)}
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
                <Label htmlFor="releaseManager">Release Managers</Label>
                {releaseManagerEntry.visibility === 'readonly' ? (
                  <Input
                    id="releaseManager"
                    value={(releaseManager ?? []).join(', ')}
                    disabled
                    className="bg-muted"
                    readOnly
                  />
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
                <Label htmlFor="securityChampion">Security Champions</Label>
                {securityChampionEntry.visibility === 'readonly' ? (
                  <Input
                    id="securityChampion"
                    value={(securityChampion ?? []).join(', ')}
                    disabled
                    className="bg-muted"
                    readOnly
                  />
                ) : (
                  <PeopleListInput
                    value={securityChampion ?? []}
                    onChange={(val) =>
                      setValue('securityChampion', val, { shouldDirty: true, shouldTouch: true })
                    }
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
                <Label htmlFor="component-system">System</Label>
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
                <Label htmlFor="clientCode">Client Code</Label>
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
                <Label htmlFor="copyright">Copyright</Label>
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
                <Label htmlFor="component-labels">Labels</Label>
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
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Doc Links</h3>
        <div className="space-y-2">
          {docsFieldArray.fields.length === 0 ? (
            <p className="text-xs text-muted-foreground">No documentation links configured.</p>
          ) : (
            docsFieldArray.fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                {/* Doc target restricted to components carrying the `doc` label. */}
                <ComponentSelect
                  id={`docs-${index}-key`}
                  ariaLabel={`Doc link component key (row ${index + 1})`}
                  value={watchedDocs?.[index]?.docComponentKey ?? ''}
                  onChange={(val) =>
                    setValue(`docs.${index}.docComponentKey` as const, val, { shouldDirty: true })
                  }
                  filter={{ labels: ['doc'] }}
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
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Artifact IDs</h3>
        <div className="space-y-2">
          {artifactIdsFieldArray.fields.length === 0 ? (
            <p className="text-xs text-muted-foreground">No artifact IDs configured.</p>
          ) : (
            artifactIdsFieldArray.fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  placeholder="org.example.alpha"
                  aria-label={`Artifact ID group pattern (row ${index + 1})`}
                  {...register(`artifactIds.${index}.groupPattern` as const)}
                />
                <Input
                  placeholder="my-component-*"
                  aria-label={`Artifact ID artifact pattern (row ${index + 1})`}
                  {...register(`artifactIds.${index}.artifactPattern` as const)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive"
                  onClick={() => artifactIdsFieldArray.remove(index)}
                  aria-label="Remove artifact ID"
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
            onClick={() => artifactIdsFieldArray.append({ groupPattern: '', artifactPattern: '' })}
          >
            <Plus className="h-4 w-4" />
            Add artifact ID
          </Button>
        </div>
      </section>

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
