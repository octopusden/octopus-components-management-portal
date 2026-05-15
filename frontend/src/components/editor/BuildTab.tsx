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
  const [buildFilePath, setBuildFilePath] = useState(build?.buildFilePath ?? '')
  const [javaVersion, setJavaVersion] = useState(build?.javaVersion ?? '')
  const [deprecated, setDeprecated] = useState(build?.deprecated ?? false)
  const [gradleVersion, setGradleVersion] = useState(build?.gradleVersion ?? '')

  useEffect(() => {
    const br = selectBaseRow(component)
    const b = br?.build
    setBuildSystem(b?.buildSystem ?? '')
    setBuildFilePath(b?.buildFilePath ?? '')
    setJavaVersion(b?.javaVersion ?? '')
    setDeprecated(b?.deprecated ?? false)
    setGradleVersion(b?.gradleVersion ?? '')
  }, [component])

  async function handleSave() {
    try {
      // Wave A scope: surface only the four fields the legacy UI exposed plus
      // gradleVersion. mavenVersion and buildTasks (typed BuildAspect scalars)
      // are deferred to Wave B; absent-from-payload = "don't touch" per JSON
      // Merge Patch, so they stay untouched on the server side.
      await updateMutation.mutateAsync({
        version: component.version,
        baseConfiguration: {
          build: {
            buildSystem: buildSystem || null,
            buildFilePath: buildFilePath || null,
            javaVersion: javaVersion || null,
            gradleVersion: gradleVersion || null,
            deprecated,
          },
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

  const requiredTools = baseRow?.requiredTools ?? []

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
          <FieldOverrideInline componentId={component.id} overriddenAttribute="buildSystem" />
        </div>

        <div className="space-y-1.5">
          <Label>Build File Path</Label>
          <Input
            value={buildFilePath}
            onChange={(e) => setBuildFilePath(e.target.value)}
            placeholder="pom.xml / build.gradle"
          />
          <FieldOverrideInline componentId={component.id} overriddenAttribute="buildFilePath" />
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
          <Label>Gradle Version</Label>
          <Input
            value={gradleVersion}
            onChange={(e) => setGradleVersion(e.target.value)}
            placeholder="8.6"
          />
          <FieldOverrideInline componentId={component.id} overriddenAttribute="build.gradleVersion" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="build-deprecated"
          checked={deprecated}
          onCheckedChange={setDeprecated}
        />
        <Label htmlFor="build-deprecated" className="cursor-pointer">Deprecated</Label>
      </div>

      {requiredTools.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Required Tools (read-only)
          </span>
          <div className="flex flex-wrap gap-2">
            {requiredTools.map((tool) => (
              <Badge key={tool} variant="outline">{tool}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
          <Save className="h-4 w-4" />
          {updateMutation.isPending ? 'Saving...' : 'Save Build'}
        </Button>
      </div>
    </div>
  )
}
