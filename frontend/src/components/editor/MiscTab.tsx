import { UseFormReturn } from 'react-hook-form'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { ComponentSelect } from '../ui/ComponentSelect'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import type { ComponentDetail } from '../../lib/types'
import { useFieldConfigEntry } from '../../hooks/useFieldConfig'
import type { GeneralFormValues } from './GeneralTab'

/**
 * Field names rendered on the Misc tab (parenting / grouping). Used by
 * ComponentDetailPage to route a CRS 400 to the owning tab (auto-switch) and to
 * suppress the toast — the counterpart to GeneralTab's GENERAL_TAB_FIELDS.
 * Only fields that render an inline-error <p> belong here.
 */
export const MISC_TAB_FIELDS = ['parentComponentName', 'canBeParent'] as const

interface MiscTabProps {
  component: ComponentDetail
  form: UseFormReturn<GeneralFormValues>
}

/**
 * "Misc" tab — parenting and (read-only) aggregator-grouping fields, moved off the
 * General tab to keep it focused. Shares the same RHF form as GeneralTab, so the
 * header Save covers these fields via buildUpdateRequest (parentComponentName /
 * canBeParent stay in GeneralFormValues). Group Key + synthetic-group are read-only
 * (migration-owned).
 */
export function MiscTab({ component, form }: MiscTabProps) {
  const {
    setValue,
    watch,
    formState: { errors },
  } = form

  const parentComponentName = watch('parentComponentName')
  const canBeParent = watch('canBeParent')

  const { entry: groupIdEntry } = useFieldConfigEntry('component.groupId')
  const { entry: canBeParentEntry } = useFieldConfigEntry('component.canBeParent')

  // NOTE: parentComponentName / canBeParent are hydrated by GeneralTab (the default,
  // always-mounted tab) — Radix unmounts this inactive tab, so hydrating here would leave
  // them unset until the user opens Misc. This tab only reads/edits the shared form values.

  return (
    <div className="space-y-6">
      <section data-testid="section-misc">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Parent & Group</h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Parent Component — strict single-select limited to canBeParent
              components. A can-be-parent component may not itself have a parent
              (single-level): the picker is disabled when canBeParent && no parent;
              when canBeParent && a (grandfathered) parent exists, only clearing is
              offered for remediation. */}
          <div className="space-y-1.5 sm:col-span-2 sm:max-w-md">
            <div className="flex items-center gap-1">
              <Label htmlFor="parentComponentName"><FieldLabelText path="component.parentComponentName" fallback="Parent Component" /></Label>
              <FieldInfo path="component.parentComponentName" label="Parent Component" />
            </div>
            {canBeParent && (parentComponentName ?? '') !== '' ? (
              <div className="flex items-center gap-2">
                <Input
                  id="parentComponentName"
                  value={parentComponentName ?? ''}
                  disabled
                  readOnly
                  className="bg-muted"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setValue('parentComponentName', '', { shouldDirty: true, shouldTouch: true })}
                >
                  Clear
                </Button>
              </div>
            ) : (
              <ComponentSelect
                id="parentComponentName"
                value={parentComponentName ?? ''}
                excludeName={component.name}
                // shouldTouch:true so the GeneralTab hydration re-guard preserves a parent
                // edit/clear (clear-to-'' == RHF default leaves dirtyFields empty) on tab switch.
                onChange={(val) => setValue('parentComponentName', val, { shouldDirty: true, shouldTouch: true })}
                placeholder={
                  canBeParent
                    ? 'A can-be-parent component cannot have a parent'
                    : 'No parent (top-level component)'
                }
                filter={{ canBeParent: true }}
                strict
                disabled={canBeParent}
              />
            )}
            {errors.parentComponentName ? (
              <p className="text-xs text-destructive">{errors.parentComponentName.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {canBeParent
                  ? 'This component can be a parent, so it cannot itself have a parent.'
                  : 'Pick a component marked “can be parent”. Leave blank for a top-level component.'}
              </p>
            )}
          </div>

          {/* CAN_BE_PARENT — whether this component may be referenced as a parent. */}
          {canBeParentEntry.visibility !== 'hidden' && (
            <div className="sm:col-span-2 flex items-center gap-3">
              <Switch
                id="canBeParent"
                checked={canBeParent}
                disabled={canBeParentEntry.visibility === 'readonly'}
                onCheckedChange={(checked) =>
                  setValue('canBeParent', checked, { shouldDirty: true, shouldTouch: true })
                }
              />
              <Label htmlFor="canBeParent" className="cursor-pointer"><FieldLabelText path="component.canBeParent" fallback="Can be a parent" /></Label>
              <FieldInfo path="component.canBeParent" label="Can be a parent" />
              <span className="text-xs text-muted-foreground">
                May be selected as another component&apos;s parent (not an aggregator).
              </span>
              {errors.canBeParent && (
                <p className="text-xs text-destructive">{errors.canBeParent.message}</p>
              )}
            </div>
          )}

          {/* Group Key + Synthetic group — READ-ONLY. The group is the DSL aggregator
              this component belongs to (an aggregator owns a `components { }` block):
              filled for aggregator members, empty for standalone components. Set by the
              migration/import path only, never via the API — not user-editable here. */}
          {groupIdEntry.visibility !== 'hidden' && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="groupId"><FieldLabelText path="component.groupId" fallback="Group Key" /></Label>
                <FieldInfo path="component.groupId" label="Group Key" />
              </div>
              <Input
                id="groupId"
                value={component.group?.groupKey ?? ''}
                disabled
                readOnly
                className="bg-muted"
                placeholder="(none — standalone component)"
              />
              <div className="flex items-center gap-3 pt-1">
                {component.group?.isFake && (
                  <Badge variant="outline" className="text-xs">Synthetic group (isFake)</Badge>
                )}
                {component.group?.role && (
                  <Badge variant="outline" className="text-xs">{component.group.role}</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  Aggregator membership (read-only; set by migration).
                </span>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
