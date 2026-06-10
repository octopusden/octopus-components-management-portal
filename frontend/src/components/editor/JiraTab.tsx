import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Button } from '../ui/button'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import { FieldOverrideInline } from './FieldOverrideInline'
import { CANNOT_EDIT_TITLE } from './editPermission'
import type { ComponentDetail } from '../../lib/types'
import type { ComponentUpdateRequest } from '../../hooks/useComponent'
import type { UseMutationResult } from '@tanstack/react-query'
import { useOptimisticConflict } from '../../hooks/useOptimisticConflict'
import { selectBaseRow } from '../../lib/api/baseRow'
import { useFieldConfigEntry } from '../../hooks/useFieldConfig'

interface JiraTabProps {
  component: ComponentDetail
  updateMutation: UseMutationResult<ComponentDetail, Error, ComponentUpdateRequest>
  toast: (opts: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void
  canEdit: boolean
}

export function JiraTab({ component, updateMutation, toast, canEdit }: JiraTabProps) {
  const handleConflict = useOptimisticConflict(component.id)
  const baseRow = selectBaseRow(component)
  const jira = baseRow?.jira
  // releasesInDefaultBranch moved here from the General tab — it gates release
  // behaviour, which sits naturally beside the Jira version configuration.
  const { entry: releasesInDefaultBranchEntry } = useFieldConfigEntry(
    'component.releasesInDefaultBranch',
  )
  const { entry: jiraDisplayNameEntry } = useFieldConfigEntry('jira.displayName')
  // The Jira display name is a redundant echo of the component display name unless it diverges.
  // Show the field ONLY when it is set AND differs from component.displayName (and not FC-hidden).
  // Base the decision on the loaded component values so it doesn't vanish mid-edit. A divergent
  // value is created via import/DSL or Field-Overrides, not from this (hidden-by-default) field.
  const showJiraDisplayName =
    jiraDisplayNameEntry.visibility !== 'hidden' &&
    (component.jiraDisplayName ?? '') !== '' &&
    component.jiraDisplayName !== component.displayName

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
  const [releasesInDefaultBranch, setReleasesInDefaultBranch] = useState(
    component.releasesInDefaultBranch ?? false,
  )

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
    setReleasesInDefaultBranch(component.releasesInDefaultBranch ?? false)
  }, [component])

  async function handleSave() {
    if (!canEdit) return // Save is disabled when !canEdit; guard the handler too (backend also 403s).
    try {
      await updateMutation.mutateAsync({
        version: component.version,
        clearGroup: false,
        // Send-gate: include only when FC-visible AND actually changed from the
        // server value. A bare equality-with-default check avoids clobbering a
        // server `null` with `false` on a Jira save that only touched, say, the
        // project key (mirrors the General tab's old dirty-gate intent).
        ...(releasesInDefaultBranchEntry.visibility !== 'hidden' &&
        releasesInDefaultBranch !== (component.releasesInDefaultBranch ?? false)
          ? { releasesInDefaultBranch }
          : {}),
        // Dirty-gate: only send jiraDisplayName when it actually changed from the server value.
        // Emitting it unconditionally would clear/rewrite it on every unrelated Jira save (and,
        // with the divergence rule, wipe a hidden equal value).
        ...((displayName || null) !== (component.jiraDisplayName ?? null)
          ? { jiraDisplayName: displayName || null }
          : {}),
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
      const conflict = await handleConflict(err)
      if (conflict) {
        toast({ ...conflict, variant: 'destructive' })
        return
      }
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="jira.projectKey" fallback="Project Key" /></Label>
            <FieldInfo path="jira.projectKey" label="Project Key" />
          </div>
          <Input
            value={projectKey}
            onChange={(e) => setProjectKey(e.target.value)}
            placeholder="JIRA project key"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.projectKey" />
        </div>

        {showJiraDisplayName && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label><FieldLabelText path="jira.displayName" fallback="Display Name" /></Label>
              <FieldInfo path="jira.displayName" label="Display Name" />
            </div>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={jiraDisplayNameEntry.visibility === 'readonly'}
              className={jiraDisplayNameEntry.visibility === 'readonly' ? 'bg-muted' : undefined}
              placeholder="Component display name in Jira"
            />
            <p className="text-xs text-muted-foreground">
              Shown because it differs from the component display name.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <Switch
            id="jira-technical"
            checked={technical}
            onCheckedChange={setTechnical}
          />
          <Label htmlFor="jira-technical" className="cursor-pointer"><FieldLabelText path="jira.technical" fallback="Technical" /></Label>
          <FieldInfo path="jira.technical" label="Technical" />
        </div>
        <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.technical" />
      </div>

      {releasesInDefaultBranchEntry.visibility !== 'hidden' && (
        <div className="flex items-center gap-3">
          <Switch
            id="releasesInDefaultBranch"
            checked={releasesInDefaultBranch}
            disabled={releasesInDefaultBranchEntry.visibility === 'readonly'}
            onCheckedChange={setReleasesInDefaultBranch}
          />
          <Label htmlFor="releasesInDefaultBranch" className="cursor-pointer">
            <FieldLabelText path="component.releasesInDefaultBranch" fallback="Releases in default branch" />
          </Label>
          <FieldInfo path="component.releasesInDefaultBranch" label="Releases in default branch" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="jira.hotfixVersionFormat" fallback="Hotfix Version Format" /></Label>
            <FieldInfo path="jira.hotfixVersionFormat" label="Hotfix Version Format" />
          </div>
          <Input
            value={hotfixVersionFormat}
            onChange={(e) => setHotfixVersionFormat(e.target.value)}
            placeholder="e.g. {major}.{minor}.{patch}.{hotfix}"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.hotfixVersionFormat" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="jira.versionPrefix" fallback="Version Prefix" /></Label>
            <FieldInfo path="jira.versionPrefix" label="Version Prefix" />
          </div>
          <Input
            value={versionPrefix}
            onChange={(e) => setVersionPrefix(e.target.value)}
            placeholder="e.g. v"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.versionPrefix" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="jira.majorVersionFormat" fallback="Major Version Format" /></Label>
            <FieldInfo path="jira.majorVersionFormat" label="Major Version Format" />
          </div>
          <Input
            value={majorVersionFormat}
            onChange={(e) => setMajorVersionFormat(e.target.value)}
            placeholder="e.g. {major}.0.0"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.majorVersionFormat" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="jira.releaseVersionFormat" fallback="Release Version Format" /></Label>
            <FieldInfo path="jira.releaseVersionFormat" label="Release Version Format" />
          </div>
          <Input
            value={releaseVersionFormat}
            onChange={(e) => setReleaseVersionFormat(e.target.value)}
            placeholder="e.g. {major}.{minor}.0"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.releaseVersionFormat" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="jira.buildVersionFormat" fallback="Build Version Format" /></Label>
            <FieldInfo path="jira.buildVersionFormat" label="Build Version Format" />
          </div>
          <Input
            value={buildVersionFormat}
            onChange={(e) => setBuildVersionFormat(e.target.value)}
            placeholder="e.g. {major}.{minor}.{patch}"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.buildVersionFormat" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="jira.lineVersionFormat" fallback="Line Version Format" /></Label>
            <FieldInfo path="jira.lineVersionFormat" label="Line Version Format" />
          </div>
          <Input
            value={lineVersionFormat}
            onChange={(e) => setLineVersionFormat(e.target.value)}
            placeholder="e.g. {major}.{minor}.x"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.lineVersionFormat" />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="jira.versionFormat" fallback="Version Format" /></Label>
            <FieldInfo path="jira.versionFormat" label="Version Format" />
          </div>
          <Input
            value={versionFormat}
            onChange={(e) => setVersionFormat(e.target.value)}
            placeholder="Generic version format"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.versionFormat" />
        </div>
      </div>

      <div className="flex justify-end">
        {/* title on the wrapping span: a disabled Button has pointer-events-none, so a
            title on it would never show on hover. */}
        <span className="inline-flex" title={!canEdit ? CANNOT_EDIT_TITLE : undefined}>
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending || !canEdit}>
            <Save className="h-4 w-4" />
            {updateMutation.isPending ? 'Saving...' : 'Save Jira'}
          </Button>
        </span>
      </div>
    </div>
  )
}
