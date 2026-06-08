import { useState, useEffect } from 'react'
import { Code } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Button } from '../ui/button'
import { Separator } from '../ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { InlineError } from '../ui/inline-error'
import { SkeletonBlock } from '../ui/skeleton-block'
import { useComponentDefaults } from '../../hooks/useAdminConfig'

// Component defaults are code-as-config (managed in service-config), so this
// view is READ-ONLY. The legacy Save / Import-from-Git / Reset controls were
// removed; changes are made in service-config and applied via the "Reload"
// button on the Admin Settings page (POST /admin/reload-config).

interface DefaultsData {
  buildSystem?: string
  buildFilePath?: string
  artifactIdPattern?: string
  groupIdPattern?: string
  componentDisplayName?: string
  // componentOwner / releaseManager / securityChampion are intentionally NOT part
  // of the global component-defaults surface — stripped on load by sanitizeDefaults().
  system?: string
  clientCode?: string
  parentComponent?: string
  releasesInDefaultBranch?: boolean
  solution?: boolean
  archived?: boolean
  deprecated?: boolean
  copyright?: string
  octopusVersion?: string
  labels?: string[]
  build?: Record<string, unknown>
  jira?: Record<string, unknown>
  distribution?: Record<string, unknown>
  vcs?: Record<string, unknown>
  escrow?: Record<string, unknown>
  doc?: Record<string, unknown>
  [key: string]: unknown
}

function getStr(obj: Record<string, unknown> | undefined, key: string): string {
  return (obj?.[key] as string) ?? ''
}

function getBool(obj: Record<string, unknown> | undefined, key: string): boolean {
  return (obj?.[key] as boolean) ?? false
}

// People fields don't belong in the global component-defaults blob; strip them
// on load so they never render even if a stale stored blob still carries them.
const PEOPLE_DEFAULT_KEYS = ['componentOwner', 'releaseManager', 'securityChampion'] as const

function sanitizeDefaults<T extends Record<string, unknown>>(obj: T): T {
  const next = { ...obj }
  for (const key of PEOPLE_DEFAULT_KEYS) {
    delete next[key]
  }
  return next
}

export function ComponentDefaultsForm() {
  const { data, isLoading, error } = useComponentDefaults()

  const [defaults, setDefaults] = useState<DefaultsData>({})
  const [showRawJson, setShowRawJson] = useState(false)

  useEffect(() => {
    if (data) {
      setDefaults(sanitizeDefaults(data as DefaultsData))
    }
  }, [data])

  if (isLoading) {
    return <SkeletonBlock height="h-64" width="w-full" />
  }

  if (error) {
    return (
      <InlineError
        message={
          <>
            Failed to load: {error instanceof Error ? error.message : String(error)}
          </>
        }
      />
    )
  }

  const build = (defaults.build ?? {}) as Record<string, unknown>
  const jira = (defaults.jira ?? {}) as Record<string, unknown>
  const distribution = (defaults.distribution ?? {}) as Record<string, unknown>
  const vcs = (defaults.vcs ?? {}) as Record<string, unknown>
  const escrow = (defaults.escrow ?? {}) as Record<string, unknown>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={() => setShowRawJson(!showRawJson)}>
          <Code className="h-4 w-4" />
          {showRawJson ? 'Form View' : 'Raw JSON'}
        </Button>
      </div>

      {showRawJson ? (
        <textarea
          className="w-full h-96 rounded-md border bg-muted/40 px-3 py-2 text-xs font-mono text-foreground focus:outline-none resize-y"
          value={JSON.stringify(defaults, null, 2)}
          readOnly
          spellCheck={false}
        />
      ) : (
        <Tabs defaultValue="general">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="build">Build</TabsTrigger>
            <TabsTrigger value="jira">Jira</TabsTrigger>
            <TabsTrigger value="distribution">Distribution</TabsTrigger>
            <TabsTrigger value="vcs">VCS</TabsTrigger>
            <TabsTrigger value="escrow">Escrow</TabsTrigger>
          </TabsList>

          {/* General */}
          <TabsContent value="general" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ReadField label="Build System (default)" value={defaults.buildSystem} />
              <ReadField label="Build File Path" value={defaults.buildFilePath} />
              <ReadField label="Artifact ID Pattern" value={defaults.artifactIdPattern} mono />
              <ReadField label="Group ID Pattern" value={defaults.groupIdPattern} mono />
              <ReadField label="Display Name" value={defaults.componentDisplayName} />
              <ReadField label="System" value={defaults.system} />
              <ReadField label="Client Code" value={defaults.clientCode} />
              <ReadField label="Copyright" value={defaults.copyright} />
              <ReadField label="Octopus Version" value={defaults.octopusVersion} />
            </div>
            <Separator />
            <div className="flex flex-wrap gap-6">
              <SwitchField label="Solution" checked={defaults.solution ?? false} />
              <SwitchField label="Archived" checked={defaults.archived ?? false} />
              <SwitchField label="Deprecated" checked={defaults.deprecated ?? false} />
              <SwitchField label="Releases in Default Branch" checked={defaults.releasesInDefaultBranch ?? false} />
            </div>
          </TabsContent>

          {/* Build */}
          <TabsContent value="build" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ReadField label="Java Version" value={getStr(build, 'javaVersion')} />
              <ReadField label="Maven Version" value={getStr(build, 'mavenVersion')} />
              <ReadField label="Gradle Version" value={getStr(build, 'gradleVersion')} />
              <ReadField label="Project Version" value={getStr(build, 'projectVersion')} />
              <ReadField label="System Properties" value={getStr(build, 'systemProperties')} />
              <ReadField label="Build Tasks" value={getStr(build, 'buildTasks')} />
            </div>
            <SwitchField label="Required Project" checked={getBool(build, 'requiredProject')} />
          </TabsContent>

          {/* Jira */}
          <TabsContent value="jira" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ReadField label="Project Key" value={getStr(jira, 'projectKey')} />
              <ReadField label="Display Name" value={getStr(jira, 'displayName')} />
            </div>
            <SwitchField label="Technical" checked={getBool(jira, 'technical')} />
          </TabsContent>

          {/* Distribution */}
          <TabsContent value="distribution" className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-6">
              <SwitchField label="Explicit" checked={getBool(distribution, 'explicit')} />
              <SwitchField label="External" checked={getBool(distribution, 'external')} />
            </div>
            <Separator />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ReadField label="GAV" value={getStr(distribution, 'GAV')} mono />
              <ReadField label="DEB" value={getStr(distribution, 'DEB')} mono />
              <ReadField label="RPM" value={getStr(distribution, 'RPM')} mono />
              <ReadField label="Docker" value={getStr(distribution, 'docker')} mono />
            </div>
          </TabsContent>

          {/* VCS */}
          <TabsContent value="vcs" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ReadField label="External Registry" value={getStr(vcs, 'externalRegistry')} />
              <ReadField label="VCS Path" value={getStr(vcs, 'vcsPath')} mono />
              <ReadField label="Repository Type" value={getStr(vcs, 'repositoryType')} />
              <ReadField label="Tag" value={getStr(vcs, 'tag')} mono />
              <ReadField label="Branch" value={getStr(vcs, 'branch')} mono />
            </div>
          </TabsContent>

          {/* Escrow */}
          <TabsContent value="escrow" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ReadField label="Build Task" value={getStr(escrow, 'buildTask')} />
              <ReadField label="Generation" value={getStr(escrow, 'generation')} />
              <ReadField label="Disk Space" value={getStr(escrow, 'diskSpace')} />
            </div>
            <SwitchField label="Reusable" checked={getBool(escrow, 'reusable')} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function ReadField({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input value={value ?? ''} readOnly tabIndex={-1} className={mono ? 'font-mono text-xs' : undefined} />
    </div>
  )
}

function SwitchField({ label, checked }: { label: string; checked: boolean }) {
  const id = `default-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="flex items-center gap-3">
      <Switch id={id} checked={checked} disabled />
      <Label htmlFor={id}>{label}</Label>
    </div>
  )
}
