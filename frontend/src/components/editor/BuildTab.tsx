import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { EnumSelect } from '../ui/EnumSelect'
import { FieldOverrideInline } from './FieldOverrideInline'
import { selectBaseRow } from '../../lib/api/baseRow'
import type { ComponentDetail } from '../../lib/types'
import type { ComponentUpdateRequest } from '../../hooks/useComponent'
import type { UseMutationResult } from '@tanstack/react-query'
import { ApiError } from '../../lib/api'

interface BuildTabProps {
  component: ComponentDetail
  updateMutation: UseMutationResult<ComponentDetail, Error, ComponentUpdateRequest>
  toast: (opts: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void
}

export function BuildTab({ component, updateMutation, toast }: BuildTabProps) {
  const baseRow = selectBaseRow(component)
  const build = baseRow?.build

  const [buildSystem, setBuildSystem] = useState(build?.buildSystem ?? '')
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
      if (err instanceof ApiError && err.status === 409) {
        toast({ title: 'Conflict', description: 'Please refresh and try again.', variant: 'destructive' })
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
          <Label>Build System</Label>
          <EnumSelect
            fieldPath="buildSystem"
            value={buildSystem}
            onValueChange={setBuildSystem}
            placeholder="Select build system"
          />
          <FieldOverrideInline componentId={component.id} overriddenAttribute="build.buildSystem" />
        </div>

        <div className="space-y-1.5">
          <Label>Build System Version</Label>
          <Input
            value={buildSystemVersion}
            onChange={(e) => setBuildSystemVersion(e.target.value)}
            placeholder="e.g. 3.9.6"
          />
          <FieldOverrideInline componentId={component.id} overriddenAttribute="build.buildSystemVersion" />
        </div>

        <div className="space-y-1.5">
          <Label>Build File Path</Label>
          <Input
            value={buildFilePath}
            onChange={(e) => setBuildFilePath(e.target.value)}
            placeholder="pom.xml / build.gradle"
          />
          <FieldOverrideInline componentId={component.id} overriddenAttribute="build.buildFilePath" />
        </div>

        <div className="space-y-1.5">
          <Label>Java Version</Label>
          <Input
            value={javaVersion}
            onChange={(e) => setJavaVersion(e.target.value)}
            placeholder="1.8 / 11 / 17 / 21"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Maven Version</Label>
          <Input
            value={mavenVersion}
            onChange={(e) => setMavenVersion(e.target.value)}
            placeholder="3.9.6"
          />
          <FieldOverrideInline componentId={component.id} overriddenAttribute="build.mavenVersion" />
        </div>

        <div className="space-y-1.5">
          <Label>Gradle Version</Label>
          <Input
            value={gradleVersion}
            onChange={(e) => setGradleVersion(e.target.value)}
            placeholder="8.6"
          />
          <FieldOverrideInline componentId={component.id} overriddenAttribute="build.gradleVersion" />
        </div>

        <div className="space-y-1.5">
          <Label>Project Version</Label>
          <Input
            value={projectVersion}
            onChange={(e) => setProjectVersion(e.target.value)}
            placeholder="1.0.0"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Build Tasks</Label>
        <Input
          value={buildTasks}
          onChange={(e) => setBuildTasks(e.target.value)}
          placeholder="clean install / assemble"
        />
        <FieldOverrideInline componentId={component.id} overriddenAttribute="build.buildTasks" />
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
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="build-deprecated"
          checked={deprecated}
          onCheckedChange={setDeprecated}
        />
        <Label htmlFor="build-deprecated" className="cursor-pointer">Deprecated</Label>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="build-required-project"
          checked={requiredProject}
          onCheckedChange={setRequiredProject}
        />
        <Label htmlFor="build-required-project" className="cursor-pointer">Required Project</Label>
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
        <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
          <Save className="h-4 w-4" />
          {updateMutation.isPending ? 'Saving...' : 'Save Build'}
        </Button>
      </div>
    </div>
  )
}
