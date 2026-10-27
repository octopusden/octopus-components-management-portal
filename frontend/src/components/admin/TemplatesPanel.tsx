import { useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { CodeBlock } from '../ui/CodeBlock'
import { InlineError } from '../ui/inline-error'
import { SkeletonBlock } from '../ui/skeleton-block'
import { StatusBanner } from '../ui/status-banner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import { TemplateParameterForm } from '../template/TemplateParameterForm'
import { TemplateReview } from '../template/TemplateReview'
import { useAdminComponentProfiles, type AdminProfileEntry } from '../../hooks/useAdminComponentProfiles'
import type { ComponentTemplate } from '../../hooks/useComponentTemplate'
import { useTemplateRun } from '../../hooks/useTemplateRun'
import { useSupportedGroups } from '../../hooks/useSupportedGroups'
import { usePortalLinks } from '../../hooks/useInfo'
import { useToast } from '../../hooks/use-toast'
import { copyToClipboard } from '../../lib/clipboard'
import type { ComponentCreateRequest } from '../../lib/types'
import { portalCreateRules } from '../../lib/component/portalCreateRules'
import { reviewProblems } from '../../lib/component/templateReview'
import {
  initialParameterValues,
  templateParameterErrors,
  templateRunBody,
  type TemplateParameter,
} from '../../lib/component/templateParameters'

function classificationText(c: ComponentTemplate['classification']): string {
  const parts = [c.external ? 'External' : 'Internal', c.explicit === 'true' ? 'explicit' : 'not explicit']
  if (c.solution) parts.push('solution')
  return parts.join(' · ')
}

function settingsOf(p: TemplateParameter): string {
  const settings: string[] = []
  if (p.options?.length) settings.push(`options: ${p.options.join(', ')}`)
  if (p.list) settings.push(`list: ${p.list}`)
  if (p.pattern) settings.push(`pattern: ${p.pattern}`)
  if (p.message) settings.push(`message: ${p.message}`)
  if (p.maxLength != null) settings.push(`max length: ${p.maxLength}`)
  if (p.maxSelection != null) settings.push(`max selection: ${p.maxSelection}`)
  if (p.multiple) settings.push('several values')
  return settings.join('; ')
}

function TryIt({ template }: { template: ComponentTemplate }) {
  const { groups: supportedGroups } = useSupportedGroups()
  const { data: portalLinks } = usePortalLinks()
  const templateRun = useTemplateRun(template.id)
  const [values, setValues] = useState(() => initialParameterValues(template.parameters))
  const [registryErrors, setRegistryErrors] = useState<Record<string, string>>({})
  const localErrors = templateParameterErrors(template.parameters, values)
  const run = templateRun.run
  const rendered = run?.component as ComponentCreateRequest | undefined
  const problems = useMemo(
    () =>
      run && rendered
        ? reviewProblems(run, portalCreateRules(rendered, { supportedGroups, gitBaseUrl: portalLinks?.gitBaseUrl }))
        : [],
    [run, rendered, supportedGroups, portalLinks?.gitBaseUrl],
  )

  const tryRun = async () => {
    const result = await templateRun.dryRun(templateRunBody(values, {}))
    setRegistryErrors(Object.fromEntries((result?.parameterProblems ?? []).map((p) => [p.parameter, p.message])))
  }

  return (
    <div className="space-y-4">
      <h4 className="font-medium">Try it</h4>
      <p className="text-sm text-muted-foreground">
        Enter sample values to see the checks and the component they would produce. Nothing is created.
      </p>
      <TemplateParameterForm
        parameters={template.parameters}
        values={values}
        errors={{ ...registryErrors, ...localErrors }}
        onChange={(name, next) => {
          setValues((prev) => ({ ...prev, [name]: next }))
          setRegistryErrors({})
          templateRun.discard()
        }}
      />
      <Button
        type="button"
        onClick={() => void tryRun()}
        disabled={Object.keys(localErrors).length > 0 || templateRun.running}
      >
        Run
      </Button>
      {templateRun.error && <StatusBanner variant="destructive">{templateRun.error.message}</StatusBanner>}
      {run?.component && (
        <TemplateReview
          template={template}
          run={run}
          problems={problems}
          parameterLabels={Object.fromEntries(template.parameters.map((p) => [p.name, p.label]))}
          overrides={{}}
          overrideErrors={{}}
          onParameter={(name) => document.getElementById(`template-parameter-input-${name}`)?.focus()}
          onOverride={() => undefined}
          onOverrideCommit={() => undefined}
          readOnly
          showSources
        />
      )}
    </div>
  )
}

function TemplateDetails({ entry, template }: { entry: AdminProfileEntry; template: ComponentTemplate }) {
  const { toast } = useToast()
  const copy = async () => {
    try {
      await copyToClipboard(entry.configuration)
      toast({ title: 'Configuration copied' })
    } catch {
      toast({ title: 'Could not copy the configuration', variant: 'destructive' })
    }
  }
  return (
    <div data-testid={`template-details-${template.id}`} className="space-y-6 border-t pt-4">
      <div className="space-y-2">
        <h4 className="font-medium">Parameters</h4>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Parameter</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Required</TableHead>
              <TableHead>Default</TableHead>
              <TableHead>Settings</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {template.parameters.map((p) => (
              <TableRow key={p.name}>
                <TableCell>{p.label}</TableCell>
                <TableCell className="font-mono text-xs">{p.name}</TableCell>
                <TableCell>{p.type}</TableCell>
                <TableCell>{p.required ? 'required' : 'optional'}</TableCell>
                <TableCell className="font-mono text-xs">{p.default.join(', ')}</TableCell>
                <TableCell className="text-xs">{settingsOf(p)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <dl className="grid grid-cols-[10rem_1fr] gap-2 text-sm">
        <dt className="text-muted-foreground">Classification</dt>
        <dd>{classificationText(template.classification)}</dd>
        <dt className="text-muted-foreground">Overridable fields</dt>
        <dd className="space-y-0.5 font-mono text-xs">
          {template.overridable.length === 0 ? 'none' : template.overridable.map((path) => <div key={path}>{path}</div>)}
        </dd>
      </dl>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Configuration</h4>
          <Button type="button" variant="outline" size="sm" onClick={() => void copy()} aria-label="Copy configuration">
            <Copy className="h-4 w-4" />
            Copy
          </Button>
        </div>
        <CodeBlock code={entry.configuration} />
      </div>
      <TryIt template={template} />
    </div>
  )
}

function EntryRow({ entry }: { entry: AdminProfileEntry }) {
  const [open, setOpen] = useState(false)
  const live = entry.template ?? entry.profile
  const title = live?.title ?? entry.id
  return (
    <li data-testid={`profile-entry-${entry.id}`} className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{title}</span>
        <span className="font-mono text-xs text-muted-foreground">{entry.id}</span>
        <Badge variant="outline">{entry.kind ?? 'unknown'}</Badge>
        {entry.template && <span className="text-xs text-muted-foreground">Version {entry.template.version}</span>}
        <Badge variant={entry.status === 'live' ? 'secondary' : 'destructive'}>{entry.status}</Badge>
        {entry.template && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            aria-expanded={open}
            aria-label={`Details of ${title}`}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Hide details' : 'Details'}
          </Button>
        )}
      </div>
      {entry.status === 'failed' && (
        <>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-destructive">
            {entry.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          <CodeBlock code={entry.configuration} />
        </>
      )}
      {open && entry.template && <TemplateDetails entry={entry} template={entry.template} />}
    </li>
  )
}

/**
 * The administrators' read-only view of the registry's profiles and templates: what is live, what
 * failed and why, and a way to try a template without creating anything.
 */
export function TemplatesPanel() {
  const admin = useAdminComponentProfiles()
  if (admin.isError) {
    return (
      <div className="space-y-3">
        <InlineError message="Could not load the profiles and templates from the registry." />
        <Button type="button" variant="outline" onClick={() => void admin.refetch()}>
          Retry
        </Button>
      </div>
    )
  }
  if (!admin.data) return <SkeletonBlock className="h-40 w-full" />
  const { lastLoad, configVersion, entries } = admin.data
  return (
    <div className="space-y-4">
      <StatusBanner variant="info">
        Profiles and templates live in service-config under <code>components-registry.component-profiles</code>.
        They change by a reviewed change to service-config, then a configuration reload.
      </StatusBanner>
      <div className="space-y-1 text-sm">
        <p>
          Last load: {lastLoad.status}
          {configVersion && (
            <>
              {' · configuration version '}
              <span className="font-mono">{configVersion}</span>
            </>
          )}
        </p>
        {lastLoad.status !== 'applied' && (
          <StatusBanner variant="destructive">
            <p>The last reload was not applied; the configuration below is still in use.</p>
            <ul className="mt-1 list-disc pl-5">
              {lastLoad.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </StatusBanner>
        )}
      </div>
      <ul className="divide-y rounded-md border">
        {entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} />
        ))}
      </ul>
    </div>
  )
}
