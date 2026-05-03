import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { EnumSelect } from '../ui/EnumSelect'
import { FieldOverrideInline } from './FieldOverrideInline'
import type { ComponentDetail } from '../../lib/types'
import type { ComponentUpdateRequest } from '../../hooks/useComponent'
import type { UseMutationResult } from '@tanstack/react-query'
import { ApiError } from '../../lib/api'

interface BuildTabProps {
  component: ComponentDetail
  updateMutation: UseMutationResult<ComponentDetail, Error, ComponentUpdateRequest>
  toast: (opts: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void
}

/** Defensive parse: metadata.buildTools may be a JSON-encoded String inside the
 *  JSONB bag (EntityMappers.kt:582-584) or a native array on direct-DB writes.
 *  Discriminator is `type` (NOT `@type`) per BuildTool.java:17 @JsonTypeInfo. */
function parseBuildTools(raw: unknown): Array<Record<string, unknown>> {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>
  return []
}

function buildToolSummary(item: Record<string, unknown>): string {
  const type = item['type'] as string | undefined
  switch (type) {
    case 'odbc':
      return item['version'] ? `version ${item['version']}` : ''
    case 'oracleDatabase': {
      const parts: string[] = []
      if (item['version']) parts.push(`version ${item['version']}`)
      if (item['edition']) parts.push(String(item['edition']))
      return parts.join(', ')
    }
    case 'cProduct':
    case 'kProduct':
    case 'dProduct':
    case 'dDbProduct': {
      const parts: string[] = []
      if (item['version']) parts.push(`version ${item['version']}`)
      if (item['settingsProperty']) parts.push(String(item['settingsProperty']))
      return parts.join(', ')
    }
    default: {
      const json = JSON.stringify(item)
      return json.length > 80 ? json.slice(0, 77) + '...' : json
    }
  }
}

export function BuildTab({ component, updateMutation, toast }: BuildTabProps) {
  const bc = component.buildConfigurations[0]

  const [buildSystem, setBuildSystem] = useState(bc?.buildSystem ?? '')
  const [buildFilePath, setBuildFilePath] = useState(bc?.buildFilePath ?? '')
  const [javaVersion, setJavaVersion] = useState(bc?.javaVersion ?? '')
  const [deprecated, setDeprecated] = useState(bc?.deprecated ?? false)
  const [gradleVersion, setGradleVersion] = useState(
    (bc?.metadata?.gradleVersion as string | undefined) ?? ''
  )

  useEffect(() => {
    const c = component.buildConfigurations[0]
    setBuildSystem(c?.buildSystem ?? '')
    setBuildFilePath(c?.buildFilePath ?? '')
    setJavaVersion(c?.javaVersion ?? '')
    setDeprecated(c?.deprecated ?? false)
    setGradleVersion((c?.metadata?.gradleVersion as string | undefined) ?? '')
  }, [component])

  async function handleSave() {
    try {
      // fetch-merge-send pattern: metadata save is wholesale REPLACE on the server
      // (ComponentManagementServiceImpl.kt:179). We must merge our change into the
      // full existing metadata bag to avoid wiping mavenVersion, buildTasks, tools,
      // buildTools, and other keys.
      const currentMetadata: Record<string, unknown> = bc?.metadata ?? {}
      const mergedMetadata: Record<string, unknown> = { ...currentMetadata }
      if (gradleVersion) {
        mergedMetadata.gradleVersion = gradleVersion
      } else {
        delete mergedMetadata.gradleVersion
      }

      await updateMutation.mutateAsync({
        version: component.version,
        buildConfiguration: {
          buildSystem: buildSystem || undefined,
          buildFilePath: buildFilePath || undefined,
          javaVersion: javaVersion || undefined,
          deprecated,
          metadata: mergedMetadata,
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

  const buildTools = parseBuildTools(bc?.metadata?.buildTools)
  const tools = Array.isArray(bc?.metadata?.tools)
    ? (bc.metadata.tools as Array<Record<string, unknown>>)
    : []

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
          <FieldOverrideInline componentId={component.id} fieldPath="buildSystem" />
        </div>

        <div className="space-y-1.5">
          <Label>Build File Path</Label>
          <Input
            value={buildFilePath}
            onChange={(e) => setBuildFilePath(e.target.value)}
            placeholder="pom.xml / build.gradle"
          />
          <FieldOverrideInline componentId={component.id} fieldPath="buildFilePath" />
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
          <FieldOverrideInline componentId={component.id} fieldPath="build.gradleVersion" />
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

      {/* Build Tools — read-only display.
          metadata.buildTools is a JSON-encoded String inside JSONB (EntityMappers.kt:582-584).
          Discriminator is `type` (not @type) per BuildTool.java:17.
          WAVE 1: read-only only. Full CRUD is backlog §7.x.X. */}
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Build Tools (read-only)
        </span>
        {buildTools.length === 0 ? (
          <p className="text-sm text-muted-foreground">No build tools configured.</p>
        ) : (
          <ul className="space-y-1.5">
            {buildTools.map((item, idx) => {
              const type = (item['type'] as string | undefined) ?? 'unknown'
              const summary = buildToolSummary(item)
              return (
                <li key={idx} className="flex items-center gap-2 text-sm">
                  {/* PR-2 (§7.0.5) keeps `secondary` intentionally; swap to `info`
                      pending side-by-side review against component-detail.html. */}
                  <Badge variant="secondary">{type}</Badge>
                  {summary && <span className="text-muted-foreground">{summary}</span>}
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Build tools are managed via Git source. UI editing pending — see backlog §7.x.X.
        </p>
      </div>

      {/* Tools — read-only, only render if non-empty.
          metadata.tools is a separate field with flat schema {name, escrowEnvironmentVariable,
          sourceLocation, targetLocation, installScript}. Native JSON array (EntityMappers.kt:201-209). */}
      {tools.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tools (read-only)
          </span>
          <ul className="space-y-1.5">
            {tools.map((item, idx) => {
              const name = (item['name'] as string | undefined) ?? `tool-${idx}`
              const src = item['sourceLocation'] as string | undefined
              const dst = item['targetLocation'] as string | undefined
              const summary = src || dst ? `${src ?? '?'} → ${dst ?? '?'}` : ''
              return (
                <li key={idx} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">{name}</Badge>
                  {summary && <span className="text-muted-foreground">{summary}</span>}
                </li>
              )
            })}
          </ul>
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
