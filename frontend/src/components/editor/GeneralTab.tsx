import { useEffect, useMemo } from 'react'
import { UseFormReturn, useFieldArray } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { PeopleInput } from '../ui/PeopleInput'
import { ComponentSelect } from '../ui/ComponentSelect'
import { FieldOverrideInline } from './FieldOverrideInline'
import type { ComponentDetail } from '../../lib/types'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { hasPermission, PERMISSIONS } from '../../lib/auth'
import { useFieldConfigEntry } from '../../hooks/useFieldConfig'

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
 *   - solution / archived / releasesInDefaultBranch: boolean Switches with
 *     no inline error display; let CRS business-rule violations like
 *     "cannot archive while children exist" surface as a toast.
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
  releaseManager: string
  securityChampion: string
  copyright: string
  releasesInDefaultBranch: boolean
  labels: string
  // schema-v2 per-component child lists. Each list mirrors server state on
  // mount via useEffect; the save handler maps empty + had-prior → [] (clear),
  // empty + no-prior → omit (don't touch), non-empty → REPLACE.
  teamcityProjects: { projectId: string }[]
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
  // SYS-039 watchers — PeopleInput / Switch are controlled, not register'd
  const releaseManager = watch('releaseManager')
  const securityChampion = watch('securityChampion')
  const releasesInDefaultBranch = watch('releasesInDefaultBranch')
  const groupIsFake = watch('groupIsFake')

  // schema-v2 list editors. useFieldArray provides stable `id` keys so row
  // re-renders don't blow away focus on text inputs.
  const tcFieldArray = useFieldArray({ control, name: 'teamcityProjects' })
  const docsFieldArray = useFieldArray({ control, name: 'docs' })
  const artifactIdsFieldArray = useFieldArray({ control, name: 'artifactIds' })

  // Map projectId → server-side projectUrl so the per-row URL display stays
  // correct after the user reorders or removes rows. The previous index-based
  // lookup against component.teamcityProjects desynchronised once useFieldArray
  // shuffled indices.
  const tcUrlByProjectId = useMemo(() => {
    const m = new Map<string, string>()
    for (const tc of component.teamcityProjects ?? []) {
      if (tc.projectId && tc.projectUrl) m.set(tc.projectId, tc.projectUrl)
    }
    return m
  }, [component.teamcityProjects])
  const watchedTcProjects = watch('teamcityProjects')

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
  const { entry: systemEntry } = useFieldConfigEntry('component.systems')
  const { entry: clientCodeEntry } = useFieldConfigEntry('component.clientCode')
  // SYS-039 fields
  const { entry: groupIdEntry } = useFieldConfigEntry('component.groupId')
  const { entry: releaseManagerEntry } = useFieldConfigEntry('component.releaseManager')
  const { entry: securityChampionEntry } = useFieldConfigEntry('component.securityChampion')
  const { entry: copyrightEntry } = useFieldConfigEntry('component.copyright')
  const { entry: releasesInDefaultBranchEntry } =
    useFieldConfigEntry('component.releasesInDefaultBranch')
  const { entry: labelsEntry } = useFieldConfigEntry('component.labels')
  // TC link restoration — manual override pair gated by field-config so
  // admins can hide these from non-admin editors per role.
  const { entry: teamcityProjectIdEntry } = useFieldConfigEntry('component.teamcityProjectId')
  const { entry: teamcityProjectUrlEntry } = useFieldConfigEntry('component.teamcityProjectUrl')

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
    setValue('system', (component.systems ?? []).join(', '))
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
    setValue('releaseManager', component.releaseManager ?? '')
    setValue('securityChampion', component.securityChampion ?? '')
    setValue('copyright', component.copyright ?? '')
    setValue('releasesInDefaultBranch', component.releasesInDefaultBranch ?? false)
    setValue('labels', (component.labels ?? []).join(', '))
    // schema-v2 lists. setValue replaces the array wholesale; useFieldArray
    // picks up the new keys on the next render.
    setValue(
      'teamcityProjects',
      (component.teamcityProjects ?? []).map((tc) => ({ projectId: tc.projectId })),
    )
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
            <Label htmlFor="name">Name</Label>
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
                by old name will resolve to the renamed component.
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
              badge so the user can see the resolved role without editing. */}
          {groupIdEntry.visibility !== 'hidden' && (
            <div className="space-y-1.5">
              <Label htmlFor="groupId">Group Key</Label>
              <Input
                id="groupId"
                placeholder="org.example.product"
                disabled={groupIdEntry.visibility === 'readonly'}
                className={groupIdEntry.visibility === 'readonly' ? 'bg-muted' : undefined}
                {...register('groupId')}
              />
              {errors.groupId && (
                <p className="text-xs text-destructive">{errors.groupId.message}</p>
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
              onCheckedChange={(checked) => setValue('solution', checked)}
            />
            <Label htmlFor="solution" className="cursor-pointer">Solution</Label>
          </div>

          {/* releasesInDefaultBranch toggle — SYS-039 */}
          {releasesInDefaultBranchEntry.visibility !== 'hidden' && (
            <div className="sm:col-span-2 flex items-center gap-3">
              <Switch
                id="releasesInDefaultBranch"
                checked={releasesInDefaultBranch}
                disabled={releasesInDefaultBranchEntry.visibility === 'readonly'}
                onCheckedChange={(checked) =>
                  setValue('releasesInDefaultBranch', checked, { shouldDirty: true })
                }
              />
              <Label htmlFor="releasesInDefaultBranch" className="cursor-pointer">
                Releases in default branch
              </Label>
            </div>
          )}
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
                <FieldOverrideInline componentId={component.id} overriddenAttribute="componentOwner" />
              </div>
            )}

            {/* Release Manager — SYS-039 */}
            {releaseManagerEntry.visibility !== 'hidden' && (
              <div className="space-y-1.5">
                <Label htmlFor="releaseManager">Release Manager</Label>
                {releaseManagerEntry.visibility === 'readonly' ? (
                  <Input
                    id="releaseManager"
                    value={releaseManager}
                    disabled
                    className="bg-muted"
                    readOnly
                  />
                ) : (
                  <PeopleInput
                    value={releaseManager}
                    onChange={(val) => setValue('releaseManager', val)}
                  />
                )}
                {errors.releaseManager && (
                  <p className="text-xs text-destructive">{errors.releaseManager.message}</p>
                )}
              </div>
            )}

            {/* Security Champion — SYS-039 */}
            {securityChampionEntry.visibility !== 'hidden' && (
              <div className="space-y-1.5">
                <Label htmlFor="securityChampion">Security Champion</Label>
                {securityChampionEntry.visibility === 'readonly' ? (
                  <Input
                    id="securityChampion"
                    value={securityChampion}
                    disabled
                    className="bg-muted"
                    readOnly
                  />
                ) : (
                  <PeopleInput
                    value={securityChampion}
                    onChange={(val) => setValue('securityChampion', val)}
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
            {/* System (comma-separated) */}
            {systemEntry.visibility !== 'hidden' && (
              <div className="space-y-1.5">
                <Label htmlFor="system">System(s)</Label>
                <Input
                  id="system"
                  placeholder="SYSTEM1, SYSTEM2"
                  disabled={systemEntry.visibility === 'readonly'}
                  className={systemEntry.visibility === 'readonly' ? 'bg-muted' : undefined}
                  {...register('system')}
                />
                {errors.system ? (
                  <p className="text-xs text-destructive">{errors.system.message}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Comma-separated list of systems.</p>
                )}
                <FieldOverrideInline componentId={component.id} overriddenAttribute="system" />
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
                <FieldOverrideInline componentId={component.id} overriddenAttribute="clientCode" />
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

            {/* Labels — SYS-039. Comma-separated input matching the System
                pattern; a real chips widget is backlog. */}
            {labelsEntry.visibility !== 'hidden' && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="labels">Labels</Label>
                <Input
                  id="labels"
                  placeholder="backend, internal, owned-by-platform"
                  disabled={labelsEntry.visibility === 'readonly'}
                  className={labelsEntry.visibility === 'readonly' ? 'bg-muted' : undefined}
                  {...register('labels')}
                />
                {errors.labels ? (
                  <p className="text-xs text-destructive">{errors.labels.message}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Comma-separated tags.</p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── TeamCity Projects ─────────────────────────────────────────────────
          schema-v2 list editor. The URL column is server-derived (CRS resync
          fills it from TC project params); the portal can only supply the
          projectId. Empty list + had-prior server data → save sends `[]`
          (REPLACE clear). Empty list + no prior → omit (don't touch). The
          legacy `teamcityProjectId`/`teamcityProjectUrl` FC entries gate
          section visibility — either hidden → section absent. */}
      {(teamcityProjectIdEntry.visibility !== 'hidden' &&
        teamcityProjectUrlEntry.visibility !== 'hidden') && (
        <section data-testid="section-teamcity">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">TeamCity Projects</h3>
          <div className="space-y-2">
            {tcFieldArray.fields.length === 0 ? (
              <p className="text-xs text-muted-foreground">No TeamCity projects configured.</p>
            ) : (
              tcFieldArray.fields.map((field, index) => {
                const currentProjectId = watchedTcProjects?.[index]?.projectId
                const serverUrl = currentProjectId ? tcUrlByProjectId.get(currentProjectId) : undefined
                return (
                  <div key={field.id} className="flex items-start gap-2">
                    <div className="flex-1 space-y-1">
                      <Input
                        placeholder="MyProject_Build"
                        disabled={teamcityProjectIdEntry.visibility === 'readonly'}
                        aria-label={`TC project ID (row ${index + 1})`}
                        {...register(`teamcityProjects.${index}.projectId` as const)}
                      />
                      {serverUrl && (
                        <p className="text-xs text-muted-foreground truncate">URL: {serverUrl}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive"
                      disabled={teamcityProjectIdEntry.visibility === 'readonly'}
                      onClick={() => tcFieldArray.remove(index)}
                      aria-label="Remove TC project"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={teamcityProjectIdEntry.visibility === 'readonly'}
              onClick={() => tcFieldArray.append({ projectId: '' })}
            >
              <Plus className="h-4 w-4" />
              Add TC project
            </Button>
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
                <Input
                  placeholder="docs-component-key"
                  aria-label={`Doc link component key (row ${index + 1})`}
                  {...register(`docs.${index}.docComponentKey` as const)}
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
