import { UseFormReturn } from 'react-hook-form'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import { useFieldConfigEntry, useFieldEditable } from '../../hooks/useFieldConfig'
import type { GeneralFormValues } from './GeneralTab'

/**
 * "Release Process" tab — how releases of the component are started. Shares the General
 * form (the header Save covers it); `autoRelease` is hydrated by GeneralTab, the always-mounted tab.
 */
export function ReleaseProcessTab({ form }: { form: UseFormReturn<GeneralFormValues> }) {
  const { setValue, watch, formState: { errors } } = form
  const { entry: autoReleaseEntry } = useFieldConfigEntry('component.autoRelease')
  // Covers readonly and the `editable` axis (adminOnly / none) for the current user.
  const autoReleaseEditable = useFieldEditable('component.autoRelease')
  const autoRelease = watch('autoRelease')

  return (
    <section data-testid="section-release-process">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Release Process</h3>
      {autoReleaseEntry.visibility !== 'hidden' && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <Switch
              id="autoRelease"
              checked={autoRelease}
              disabled={!autoReleaseEditable}
              aria-describedby="autoRelease-help"
              onCheckedChange={(checked) =>
                setValue('autoRelease', checked, { shouldDirty: true, shouldTouch: true })
              }
            />
            <Label htmlFor="autoRelease" className="cursor-pointer">
              <FieldLabelText path="component.autoRelease" fallback="Auto release" />
            </Label>
            <FieldInfo path="component.autoRelease" label="Auto release" />
          </div>
          <p id="autoRelease-help" className="text-xs text-muted-foreground">
            Sync from TeamCity turns this on when every release line has a finish-build trigger, unless someone has turned it off.
          </p>
          {errors.autoRelease && <p className="text-xs text-destructive">{errors.autoRelease.message}</p>}
        </div>
      )}
    </section>
  )
}
