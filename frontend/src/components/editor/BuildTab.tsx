import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { EnumSelect } from '../ui/EnumSelect'
import { FieldOverrideInline } from './FieldOverrideInline'
import { CANNOT_EDIT_TITLE } from './editPermission'
import { selectBaseRow } from '../../lib/api/baseRow'
import type { ComponentDetail } from '../../lib/types'
import type { ComponentUpdateRequest } from '../../hooks/useComponent'
import type { UseMutationResult } from '@tanstack/react-query'
import { useOptimisticConflict } from '../../hooks/useOptimisticConflict'

interface BuildTabProps {
  component: ComponentDetail
  updateMutation: UseMutationResult<ComponentDetail, Error, ComponentUpdateRequest>
  toast: (opts: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void
  canEdit: boolean
}

export function BuildTab({ component, updateMutation, toast, canEdit }: BuildTabProps) {
  const handleConflict = useOptimisticConflict(component.id)
  const baseRow = selectBaseRow(component)
  const build = baseRow?.build

  const [buildSystem, setBuildSystem] = useState(build?.buildSystem ?? '')
  // ui-swift-sloth §5: buildSystem is required server-side. Track touched
  // state locally (BuildTab is plain `useState`, not RHF/Zod) so the inline
  // error doesn't blare on initial mount with a legacy empty value.
  const [buildSystemTouched, setBuildSystemTouched] = useState(false)
  // localError is the surface for the handleSave guard — covers the case
  // where the user clicks Save without ever interacting with the field.
  const [localError, setLocalError] = useState<string | null>(null)
  const [buildSystemVersion, setBuildSystemVersion] = useState(build?.buildSystemVersion ?? '')
  const [buildFilePath, setBuildFilePath] = useState(build?.buildFilePath ?? '')
  const [javaVersion, setJavaVersion] = useState(build?.javaVersion ?? '')
  const [mavenVersion, setMavenVersion] = useState(build?.mavenVersion ?? '')
  const [gradleVersion, setGradleVersion] = useState(build?.gradleVersion ?? '')
  const [deprecated, setDeprecated] = useState(build?.deprecated ?? false)
  const [requiredProject, setRequiredProject] = useState(build?.requiredProject ?? false)
  const [projectVersion, setProjectVersion] = useState(build?.projectVersion ?? '')
  const [systemProperties, setSystemProperties] = useState(build?.systemProperties ?? '')
  const [buildTasks, setBuildTasks] = useState(build?.buildTasks ?? '')
  const [requiredToolsInput, setRequiredToolsInput] = useState((baseRow?.requiredTools ?? []).join(', '))

  useEffect(() => {
    const br = selectBaseRow(component)
    const b = br?.build
    setBuildSystem(b?.buildSystem ?? '')
    setBuildSystemVersion(b?.buildSystemVersion ?? '')
    setBuildFilePath(b?.buildFilePath ?? '')
    setJavaVersion(b?.javaVersion ?? '')
    setMavenVersion(b?.mavenVersion ?? '')
    setGradleVersion(b?.gradleVersion ?? '')
    setDeprecated(b?.deprecated ?? false)
    setRequiredProject(b?.requiredProject ?? false)
    setProjectVersion(b?.projectVersion ?? '')
    setSystemProperties(b?.systemProperties ?? '')
    setBuildTasks(b?.buildTasks ?? '')
    setRequiredToolsInput((br?.requiredTools ?? []).join(', '))
  }, [component])

  async function handleSave() {
    if (!canEdit) return // Save is disabled when !canEdit; guard the handler too (backend also 403s).
    // ui-swift-sloth §5: hard guard — empty buildSystem would 400 once the
    // CRS strict contract lands. Surface the error inline (mirrors the
    // touched-on-blur path) and bail before calling the mutation.
    if (!buildSystem) {
      setLocalError('Build System is required')
      setBuildSystemTouched(true)
      return
    }
    setLocalError(null)
    try {
      const requiredToolsArray = [...new Set(
        requiredToolsInput.split(',').map((t) => t.trim()).filter(Boolean)
      )]
      // Guard against wiping server-side requiredTools when no BASE row was
      // loaded yet. The form's requiredToolsInput would be '' (parsed to []),
      // and BaseConfigurationRequest.requiredTools = [] is an explicit clear.
      // Sending null = "don't touch" preserves whatever the server has.
      const baseRowPresent = selectBaseRow(component) !== undefined
      const requiredToolsPayload = baseRowPresent ? requiredToolsArray : null

      await updateMutation.mutateAsync({
        version: component.version,
        clearGroup: false,
        baseConfiguration: {
          build: {
            buildSystem: buildSystem || null,
            buildSystemVersion: buildSystemVersion || null,
            buildFilePath: buildFilePath || null,
            javaVersion: javaVersion || null,
            mavenVersion: mavenVersion || null,
            gradleVersion: gradleVersion || null,
            deprecated,
            requiredProject,
            projectVersion: projectVersion || null,
            systemProperties: systemProperties || null,
            buildTasks: buildTasks || null,
          },
          // requiredTools lives at the BaseConfigurationRequest level, not inside build
          requiredTools: requiredToolsPayload,
        },
      })
      toast({ title: 'Build configuration saved' })
    } catch (err) {
      const conflict = await handleConflict(err)
      if (conflict) {
        toast({ ...conflict, variant: 'destructive' })
        return
      }
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    }
  }

  const parsedRequiredTools = [...new Set(
    requiredToolsInput.split(',').map((t) => t.trim()).filter(Boolean)
  )]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="build-buildSystem">
            Build System <span className="text-destructive">*</span>
          </Label>
          <EnumSelect
            fieldPath="buildSystem"
            value={buildSystem}
            onValueChange={(v) => {
              setBuildSystem(v)
              if (v) setLocalError(null)
            }}
            onBlur={() => setBuildSystemTouched(true)}
            placeholder="Select build system"
            id="build-buildSystem"
            aria-required
            aria-invalid={(buildSystemTouched && !buildSystem) || localError !== null}
            aria-describedby={
              (buildSystemTouched && !buildSystem) || localError ? 'build-buildSystem-error' : undefined
            }
          />
          {((buildSystemTouched && !buildSystem) || localError) && (
            <p id="build-buildSystem-error" className="text-xs text-destructive">
              {localError ?? 'Build System is required'}
            </p>
          )}
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.buildSystem" />
        </div>

        <div className="space-y-1.5">
          <Label>Build System Version</Label>
          <Input
            value={buildSystemVersion}
            onChange={(e) => setBuildSystemVersion(e.target.value)}
            placeholder="e.g. 3.9.6"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.buildSystemVersion" />
        </div>

        <div className="space-y-1.5">
          <Label>Build File Path</Label>
          <Input
            value={buildFilePath}
            onChange={(e) => setBuildFilePath(e.target.value)}
            placeholder="pom.xml / build.gradle"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.buildFilePath" />
        </div>

        <div className="space-y-1.5">
          <Label>Java Version</Label>
          <Input
            value={javaVersion}
            onChange={(e) => setJavaVersion(e.target.value)}
            placeholder="1.8 / 11 / 17 / 21"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.javaVersion" />
        </div>

        <div className="space-y-1.5">
          <Label>Maven Version</Label>
          <Input
            value={mavenVersion}
            onChange={(e) => setMavenVersion(e.target.value)}
            placeholder="3.9.6"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.mavenVersion" />
        </div>

        <div className="space-y-1.5">
          <Label>Gradle Version</Label>
          <Input
            value={gradleVersion}
            onChange={(e) => setGradleVersion(e.target.value)}
            placeholder="8.6"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.gradleVersion" />
        </div>

        <div className="space-y-1.5">
          <Label>Project Version</Label>
          <Input
            value={projectVersion}
            onChange={(e) => setProjectVersion(e.target.value)}
            placeholder="1.0.0"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.projectVersion" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Build Tasks</Label>
        <Input
          value={buildTasks}
          onChange={(e) => setBuildTasks(e.target.value)}
          placeholder="clean install / assemble"
        />
        <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.buildTasks" />
      </div>

      <div className="space-y-1.5">
        <Label>System Properties</Label>
        <textarea
          className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[80px]"
          value={systemProperties}
          onChange={(e) => setSystemProperties(e.target.value)}
          placeholder="-Dproperty=value"
          spellCheck={false}
        />
        <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.systemProperties" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <Switch
            id="build-deprecated"
            checked={deprecated}
            onCheckedChange={setDeprecated}
          />
          <Label htmlFor="build-deprecated" className="cursor-pointer">Deprecated</Label>
        </div>
        <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.deprecated" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <Switch
            id="build-required-project"
            checked={requiredProject}
            onCheckedChange={setRequiredProject}
          />
          <Label htmlFor="build-required-project" className="cursor-pointer">Required Project</Label>
        </div>
        <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.requiredProject" />
      </div>

      <div className="space-y-1.5">
        <Label>Required Tools</Label>
        <Input
          value={requiredToolsInput}
          onChange={(e) => setRequiredToolsInput(e.target.value)}
          placeholder="tool-a, tool-b"
        />
        {parsedRequiredTools.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {parsedRequiredTools.map((tool) => (
              <Badge key={tool} variant="outline">{tool}</Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={updateMutation.isPending || !canEdit}
          title={!canEdit ? CANNOT_EDIT_TITLE : undefined}
        >
          <Save className="h-4 w-4" />
          {updateMutation.isPending ? 'Saving...' : 'Save Build'}
        </Button>
      </div>
    </div>
  )
}
