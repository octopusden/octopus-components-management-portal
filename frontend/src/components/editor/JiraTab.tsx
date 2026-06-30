import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import { FieldOverrideInline } from './FieldOverrideInline'
import type { ComponentDetail } from '../../lib/types'
import { useFieldConfigEntry } from '../../hooks/useFieldConfig'
import type { JiraSection } from './useJiraSection'

interface JiraTabProps {
  component: ComponentDetail
  section: JiraSection
  canEdit: boolean
}

/** Jira tab — presentational. State + slice live in `useJiraSection` (page-owned). */
export function JiraTab({ component, section, canEdit }: JiraTabProps) {
  const { state, set } = section
  const { entry: releasesInDefaultBranchEntry } = useFieldConfigEntry('component.releasesInDefaultBranch')
  const { entry: jiraDisplayNameEntry } = useFieldConfigEntry('jira.displayName')
  // Show the Jira display name only when it is set AND differs from the component
  // display name (and not FC-hidden). Decision based on loaded component values
  // so it doesn't vanish mid-edit.
  const showJiraDisplayName =
    jiraDisplayNameEntry.visibility !== 'hidden' &&
    (component.jiraDisplayName ?? '') !== '' &&
    component.jiraDisplayName !== component.displayName

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="jira.projectKey" fallback="Project Key" /></Label>
            <FieldInfo path="jira.projectKey" label="Project Key" />
          </div>
          <Input value={state.projectKey} onChange={(e) => set('projectKey', e.target.value)} placeholder="JIRA project key" />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.projectKey" />
        </div>

        {showJiraDisplayName && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label><FieldLabelText path="jira.displayName" fallback="Display Name" /></Label>
              <FieldInfo path="jira.displayName" label="Display Name" />
            </div>
            <Input
              value={state.displayName}
              onChange={(e) => set('displayName', e.target.value)}
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
          <Switch id="jira-technical" checked={state.technical} onCheckedChange={(v) => set('technical', v)} />
          <Label htmlFor="jira-technical" className="cursor-pointer"><FieldLabelText path="jira.technical" fallback="Technical" /></Label>
          <FieldInfo path="jira.technical" label="Technical" />
        </div>
        <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.technical" />
      </div>

      {releasesInDefaultBranchEntry.visibility !== 'hidden' && (
        <div className="flex items-center gap-3">
          <Switch
            id="releasesInDefaultBranch"
            checked={state.releasesInDefaultBranch}
            disabled={releasesInDefaultBranchEntry.visibility === 'readonly'}
            onCheckedChange={(v) => set('releasesInDefaultBranch', v)}
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
          <Input value={state.hotfixVersionFormat} onChange={(e) => set('hotfixVersionFormat', e.target.value)} placeholder="e.g. {major}.{minor}.{patch}.{hotfix}" />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.hotfixVersionFormat" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="jira.versionPrefix" fallback="Version Prefix" /></Label>
            <FieldInfo path="jira.versionPrefix" label="Version Prefix" />
          </div>
          <Input value={state.versionPrefix} onChange={(e) => set('versionPrefix', e.target.value)} placeholder="e.g. v" />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.versionPrefix" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="jira.minorVersionFormat" fallback="Minor Version Format" /></Label>
            <FieldInfo path="jira.minorVersionFormat" label="Minor Version Format" />
          </div>
          <Input value={state.minorVersionFormat} onChange={(e) => set('minorVersionFormat', e.target.value)} placeholder="e.g. {major}.0.0" />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.minorVersionFormat" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="jira.releaseVersionFormat" fallback="Release Version Format" /></Label>
            <FieldInfo path="jira.releaseVersionFormat" label="Release Version Format" />
          </div>
          <Input value={state.releaseVersionFormat} onChange={(e) => set('releaseVersionFormat', e.target.value)} placeholder="e.g. {major}.{minor}.0" />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.releaseVersionFormat" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="jira.buildVersionFormat" fallback="Build Version Format" /></Label>
            <FieldInfo path="jira.buildVersionFormat" label="Build Version Format" />
          </div>
          <Input value={state.buildVersionFormat} onChange={(e) => set('buildVersionFormat', e.target.value)} placeholder="e.g. {major}.{minor}.{patch}" />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.buildVersionFormat" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="jira.lineVersionFormat" fallback="Line Version Format / Major Version Format" /></Label>
            <FieldInfo path="jira.lineVersionFormat" label="Line Version Format / Major Version Format" />
          </div>
          <Input value={state.lineVersionFormat} onChange={(e) => set('lineVersionFormat', e.target.value)} placeholder="e.g. {major}.{minor}.x" />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.lineVersionFormat" />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="jira.versionFormat" fallback="Version Format" /></Label>
            <FieldInfo path="jira.versionFormat" label="Version Format" />
          </div>
          <Input value={state.versionFormat} onChange={(e) => set('versionFormat', e.target.value)} placeholder="Generic version format" />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="jira.versionFormat" />
        </div>
      </div>
    </div>
  )
}
