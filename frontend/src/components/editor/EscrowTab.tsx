import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Badge } from '../ui/badge'
import { EnumSelect } from '../ui/EnumSelect'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import { FieldOverrideInline } from './FieldOverrideInline'
import { useFieldConfigEntry } from '../../hooks/useFieldConfig'
import type { EscrowSection } from './useEscrowSection'

interface EscrowTabProps {
  section: EscrowSection
  canEdit: boolean
}

/** Escrow tab — presentational. State + slice live in `useEscrowSection`. */
export function EscrowTab({ section, canEdit }: EscrowTabProps) {
  const { state, set, parsedRequiredTools } = section
  const { entry: productTypeEntry } = useFieldConfigEntry('component.productType')

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {productTypeEntry.visibility !== 'hidden' && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label><FieldLabelText path="component.productType" fallback="Product Type" /></Label>
              <FieldInfo path="component.productType" label="Product Type" />
            </div>
            <EnumSelect
              fieldPath="component.productType"
              value={state.productType}
              onValueChange={(v) => set('productType', v)}
              placeholder="Select product type"
              disabled={productTypeEntry.visibility === 'readonly'}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="escrow.generation" fallback="Generation" /></Label>
            <FieldInfo path="escrow.generation" label="Generation" />
          </div>
          <EnumSelect fieldPath="generation" value={state.generation} onValueChange={(v) => set('generation', v)} placeholder="Select generation" />
          <FieldOverrideInline canEdit={canEdit} overriddenAttribute="escrow.generation" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="escrow.diskSpace" fallback="Disk Space" /></Label>
            <FieldInfo path="escrow.diskSpace" label="Disk Space" />
          </div>
          <Input value={state.diskSpace} onChange={(e) => set('diskSpace', e.target.value)} placeholder="e.g. 10GB" />
          <FieldOverrideInline canEdit={canEdit} overriddenAttribute="escrow.diskSpace" />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <Switch id="escrow-reusable" checked={state.reusable} onCheckedChange={(v) => set('reusable', v)} />
          <Label htmlFor="escrow-reusable" className="cursor-pointer"><FieldLabelText path="escrow.reusable" fallback="Reusable" /></Label>
          <FieldInfo path="escrow.reusable" label="Reusable" />
        </div>
        <FieldOverrideInline canEdit={canEdit} overriddenAttribute="escrow.reusable" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <Label><FieldLabelText path="escrow.providedDependencies" fallback="Provided Dependencies" /></Label>
          <FieldInfo path="escrow.providedDependencies" label="Provided Dependencies" />
        </div>
        <textarea
          className="w-full h-24 rounded-md border bg-background px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          value={state.providedDependencies}
          onChange={(e) => set('providedDependencies', e.target.value)}
          spellCheck={false}
          placeholder="Comma-separated list of provided dependencies"
        />
        <FieldOverrideInline canEdit={canEdit} overriddenAttribute="escrow.providedDependencies" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <Label><FieldLabelText path="escrow.additionalSources" fallback="Additional Sources" /></Label>
          <FieldInfo path="escrow.additionalSources" label="Additional Sources" />
        </div>
        <Input value={state.additionalSources} onChange={(e) => set('additionalSources', e.target.value)} placeholder="Additional source paths" />
        <FieldOverrideInline canEdit={canEdit} overriddenAttribute="escrow.additionalSources" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="escrow.gradleIncludeConfigurations" fallback="Gradle Include Configurations" /></Label>
            <FieldInfo path="escrow.gradleIncludeConfigurations" label="Gradle Include Configurations" />
          </div>
          <Input value={state.gradleIncludeConfigurations} onChange={(e) => set('gradleIncludeConfigurations', e.target.value)} placeholder="e.g. compile,runtimeClasspath" />
          <FieldOverrideInline canEdit={canEdit} overriddenAttribute="escrow.gradleIncludeConfigurations" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="escrow.gradleExcludeConfigurations" fallback="Gradle Exclude Configurations" /></Label>
            <FieldInfo path="escrow.gradleExcludeConfigurations" label="Gradle Exclude Configurations" />
          </div>
          <Input value={state.gradleExcludeConfigurations} onChange={(e) => set('gradleExcludeConfigurations', e.target.value)} placeholder="e.g. testCompile,testRuntime" />
          <FieldOverrideInline canEdit={canEdit} overriddenAttribute="escrow.gradleExcludeConfigurations" />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <Switch id="escrow-gradle-include-test" checked={state.gradleIncludeTestConfigurations} onCheckedChange={(v) => set('gradleIncludeTestConfigurations', v)} />
          <Label htmlFor="escrow-gradle-include-test" className="cursor-pointer"><FieldLabelText path="escrow.gradleIncludeTestConfigurations" fallback="Gradle Include Test Configurations" /></Label>
          <FieldInfo path="escrow.gradleIncludeTestConfigurations" label="Gradle Include Test Configurations" />
        </div>
        <FieldOverrideInline canEdit={canEdit} overriddenAttribute="escrow.gradleIncludeTestConfigurations" />
      </div>

      {/* ── Build settings migrated from the Build tab (build.* paths unchanged) ── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <Label><FieldLabelText path="build.buildTasks" fallback="Build Tasks" /></Label>
          <FieldInfo path="build.buildTasks" label="Build Tasks" />
        </div>
        <Input value={state.buildTasks} onChange={(e) => set('buildTasks', e.target.value)} placeholder="clean install / assemble" />
        <FieldOverrideInline canEdit={canEdit} overriddenAttribute="build.buildTasks" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <Label><FieldLabelText path="build.systemProperties" fallback="System Properties" /></Label>
          <FieldInfo path="build.systemProperties" label="System Properties" />
        </div>
        <textarea
          className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[80px]"
          value={state.systemProperties}
          onChange={(e) => set('systemProperties', e.target.value)}
          placeholder="-Dproperty=value"
          spellCheck={false}
        />
        <FieldOverrideInline canEdit={canEdit} overriddenAttribute="build.systemProperties" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <Label><FieldLabelText path="build.projectVersion" fallback="Project Version" /></Label>
          <FieldInfo path="build.projectVersion" label="Project Version" />
        </div>
        <Input value={state.projectVersion} onChange={(e) => set('projectVersion', e.target.value)} placeholder="1.0.0" />
        <FieldOverrideInline canEdit={canEdit} overriddenAttribute="build.projectVersion" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <Switch id="build-deprecated" checked={state.deprecated} onCheckedChange={(v) => set('deprecated', v)} />
          <Label htmlFor="build-deprecated" className="cursor-pointer"><FieldLabelText path="build.deprecated" fallback="Deprecated" /></Label>
          <FieldInfo path="build.deprecated" label="Deprecated" />
        </div>
        <FieldOverrideInline canEdit={canEdit} overriddenAttribute="build.deprecated" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <Switch id="build-required-project" checked={state.requiredProject} onCheckedChange={(v) => set('requiredProject', v)} />
          <Label htmlFor="build-required-project" className="cursor-pointer"><FieldLabelText path="build.requiredProject" fallback="Required Project" /></Label>
          <FieldInfo path="build.requiredProject" label="Required Project" />
        </div>
        <FieldOverrideInline canEdit={canEdit} overriddenAttribute="build.requiredProject" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <Label><FieldLabelText path="build.requiredTools" fallback="Required Tools" /></Label>
          <FieldInfo path="build.requiredTools" label="Required Tools" />
        </div>
        <Input value={state.requiredToolsInput} onChange={(e) => set('requiredToolsInput', e.target.value)} placeholder="tool-a, tool-b" />
        {parsedRequiredTools.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {parsedRequiredTools.map((tool) => (
              <Badge key={tool} variant="outline">{tool}</Badge>
            ))}
          </div>
        )}
      </div>

      {/* Build Task — overridable per-version; no BASE input until the CRS contract widens. */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <Label><FieldLabelText path="escrow.buildTask" fallback="Build Task" /></Label>
          <FieldInfo path="escrow.buildTask" label="Build Task" />
        </div>
        <FieldOverrideInline canEdit={canEdit} overriddenAttribute="escrow.buildTask" />
      </div>
    </div>
  )
}
