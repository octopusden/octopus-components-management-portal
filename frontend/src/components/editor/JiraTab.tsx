import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Button } from '../ui/button'
import { FieldOverrideInline } from './FieldOverrideInline'
import type { ComponentDetail } from '../../lib/types'
import type { ComponentUpdateRequest } from '../../hooks/useComponent'
import type { UseMutationResult } from '@tanstack/react-query'
import { ApiError } from '../../lib/api'
import { selectBaseRow } from '../../lib/api/baseRow'

interface JiraTabProps {
  component: ComponentDetail
  updateMutation: UseMutationResult<ComponentDetail, Error, ComponentUpdateRequest>
  toast: (opts: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void
}

export function JiraTab({ component, updateMutation, toast }: JiraTabProps) {
  const baseRow = selectBaseRow(component)
  const jira = baseRow?.jira

  const [projectKey, setProjectKey] = useState(jira?.projectKey ?? '')
  const [displayName, setDisplayName] = useState(component.jiraDisplayName ?? '')
  const [technical, setTechnical] = useState(jira?.technical ?? false)
  const [hotfixVersionFormat, setHotfixVersionFormat] = useState(component.jiraHotfixVersionFormat ?? '')
  const [majorVersionFormat, setMajorVersionFormat] = useState(jira?.majorVersionFormat ?? '')
  const [releaseVersionFormat, setReleaseVersionFormat] = useState(jira?.releaseVersionFormat ?? '')
  const [buildVersionFormat, setBuildVersionFormat] = useState(jira?.buildVersionFormat ?? '')
  const [lineVersionFormat, setLineVersionFormat] = useState(jira?.lineVersionFormat ?? '')
  const [versionPrefix, setVersionPrefix] = useState(jira?.versionPrefix ?? '')
  const [versionFormat, setVersionFormat] = useState(jira?.versionFormat ?? '')

  useEffect(() => {
    const base = selectBaseRow(component)
    const j = base?.jira
    setProjectKey(j?.projectKey ?? '')
    setDisplayName(component.jiraDisplayName ?? '')
    setTechnical(j?.technical ?? false)
    setHotfixVersionFormat(component.jiraHotfixVersionFormat ?? '')
    setMajorVersionFormat(j?.majorVersionFormat ?? '')
    setReleaseVersionFormat(j?.releaseVersionFormat ?? '')
    setBuildVersionFormat(j?.buildVersionFormat ?? '')
    setLineVersionFormat(j?.lineVersionFormat ?? '')
    setVersionPrefix(j?.versionPrefix ?? '')
    setVersionFormat(j?.versionFormat ?? '')
  }, [component])

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        version: component.version,
        jiraDisplayName: displayName || null,
        jiraHotfixVersionFormat: hotfixVersionFormat || null,
        baseConfiguration: {
          jira: {
            projectKey: projectKey || null,
            technical,
            majorVersionFormat: majorVersionFormat || null,
            releaseVersionFormat: releaseVersionFormat || null,
            buildVersionFormat: buildVersionFormat || null,
            lineVersionFormat: lineVersionFormat || null,
            versionPrefix: versionPrefix || null,
            versionFormat: versionFormat || null,
          },
        },
      })
      toast({ title: 'Jira configuration saved' })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast({ title: 'Conflict', description: 'Please refresh and try again.', variant: 'destructive' })
        return
      }
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Project Key</Label>
          <Input
            value={projectKey}
            onChange={(e) => setProjectKey(e.target.value)}
            placeholder="JIRA project key"
          />
          <FieldOverrideInline componentId={component.id} overriddenAttribute="jira.projectKey" />
        </div>

        <div className="space-y-1.5">
          <Label>Display Name</Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Component display name in Jira"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="jira-technical"
          checked={technical}
          onCheckedChange={setTechnical}
        />
        <Label htmlFor="jira-technical" className="cursor-pointer">Technical</Label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Hotfix Version Format</Label>
          <Input
            value={hotfixVersionFormat}
            onChange={(e) => setHotfixVersionFormat(e.target.value)}
            placeholder="e.g. {major}.{minor}.{patch}.{hotfix}"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Version Prefix</Label>
          <Input
            value={versionPrefix}
            onChange={(e) => setVersionPrefix(e.target.value)}
            placeholder="e.g. v"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Major Version Format</Label>
          <Input
            value={majorVersionFormat}
            onChange={(e) => setMajorVersionFormat(e.target.value)}
            placeholder="e.g. {major}.0.0"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Release Version Format</Label>
          <Input
            value={releaseVersionFormat}
            onChange={(e) => setReleaseVersionFormat(e.target.value)}
            placeholder="e.g. {major}.{minor}.0"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Build Version Format</Label>
          <Input
            value={buildVersionFormat}
            onChange={(e) => setBuildVersionFormat(e.target.value)}
            placeholder="e.g. {major}.{minor}.{patch}"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Line Version Format</Label>
          <Input
            value={lineVersionFormat}
            onChange={(e) => setLineVersionFormat(e.target.value)}
            placeholder="e.g. {major}.{minor}.x"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Version Format</Label>
          <Input
            value={versionFormat}
            onChange={(e) => setVersionFormat(e.target.value)}
            placeholder="Generic version format"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
          <Save className="h-4 w-4" />
          {updateMutation.isPending ? 'Saving...' : 'Save Jira'}
        </Button>
      </div>
    </div>
  )
}
