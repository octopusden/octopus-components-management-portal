import { UseFormReturn } from 'react-hook-form'
import { Boxes } from 'lucide-react'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import type { GeneralFormValues } from './GeneralTab'

interface SolutionTabProps {
  form: UseFormReturn<GeneralFormValues>
  /**
   * Field-config visibility for `component.solution`. 'readonly' disables the
   * switch (defense-in-depth pairs with buildUpdateRequest omitting it); the
   * page never mounts this tab when the field is 'hidden'.
   */
  visibility?: 'editable' | 'readonly' | 'hidden'
}

/**
 * Solution toggle, split out of GeneralTab into its own sidebar topic. The topic
 * is rendered by ComponentDetailPage ONLY for a component whose key matches a
 * service-config solution pattern (isSolutionCandidate); for every other
 * component `solution` stays server-owned and is surfaced read-only as a header
 * badge/banner. Works on the same page-owned form — `solution` is hydrated by
 * GeneralTab's mount effect and re-baselined by the page reset.
 */
export function SolutionTab({ form, visibility = 'editable' }: SolutionTabProps) {
  const { setValue, watch } = form
  const solution = watch('solution')
  const readonly = visibility === 'readonly'

  return (
    <section data-testid="section-solution" className="space-y-4">
      <div className="flex items-center gap-1">
        <h3 className="text-sm font-medium text-muted-foreground">
          <FieldLabelText path="component.solution" fallback="Solution" />
        </h3>
        <FieldInfo path="component.solution" label="Solution" />
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-badge-blue-fg)]/30 bg-[color:var(--color-badge-blue-bg)] p-4">
        <Boxes className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--color-badge-blue-fg)]" aria-hidden />
        <div className="flex flex-1 items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="solution" className="cursor-pointer text-[color:var(--color-badge-blue-fg)]">
              Mark this component as a Solution
            </Label>
            <p className="text-[13px] text-[color:var(--color-badge-blue-fg)]/90">
              A solution groups and ships other components together. This toggle is available because the component
              key matches a configured solution pattern.
            </p>
          </div>
          <Switch
            id="solution"
            checked={solution}
            disabled={readonly}
            // shouldDirty/shouldTouch mirror the original GeneralTab toggle: dirty
            // arms the page-level save gate; touch preserves a clear-to-default
            // toggle (true→false == RHF default) across a tab-switch remount so the
            // hydration re-guard does not silently flip it back.
            onCheckedChange={(checked) => setValue('solution', checked, { shouldDirty: true, shouldTouch: true })}
          />
        </div>
      </div>
    </section>
  )
}
