import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { ChipsInput } from '../ui/ChipsInput'
import { EnumSelect } from '../ui/EnumSelect'
import { Input } from '../ui/input'
import { PeopleInput } from '../ui/PeopleInput'
import { PeopleListInput } from '../ui/PeopleListInput'
import { StatusBanner } from '../ui/status-banner'
import { useLabels } from '../../hooks/useLabels'
import type { TemplateRun } from '../../hooks/useTemplateRun'
import { reviewFieldGroups, type ReviewField, type ReviewProblem } from '../../lib/component/templateReview'

export interface TemplateReviewProps {
  template: { id: string; title: string; version: number; overridable: readonly string[] }
  run: TemplateRun
  problems: readonly ReviewProblem[]
  /** Parameter labels by name, for the links back to Parameters. */
  parameterLabels: Readonly<Record<string, string>>
  /** Edits of overridable fields, by create-request path. */
  overrides: Readonly<Record<string, readonly string[]>>
  /** Messages the Portal's own checks give an edited field while it is typed. */
  overrideErrors: Readonly<Record<string, string>>
  onParameter: (name: string) => void
  /** An edit as it is typed; `null` drops it and the template's value applies again. */
  onOverride: (path: string, values: string[] | null) => void
  /** The user left an edited field: time for a new dry run. */
  onOverrideCommit: (path: string) => void
  /** Try it: nothing can be edited. */
  readOnly?: boolean
  /** Name the parameters every field came from, not only those with a problem. */
  showSources?: boolean
}

type OverrideKind = 'person' | 'people' | 'labels' | 'buildSystem' | 'generation' | 'text'

function kindOf(path: string): OverrideKind {
  if (path === 'componentOwner') return 'person'
  if (path === 'releaseManager' || path === 'securityChampion') return 'people'
  if (path === 'labels') return 'labels'
  if (path === 'baseConfiguration.build.buildSystem') return 'buildSystem'
  if (path === 'baseConfiguration.escrow.generation') return 'generation'
  return 'text'
}

function LabelsOverride({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data: options = [], isLoading } = useLabels()
  return <ChipsInput noun="label" value={value} onChange={onChange} options={options} isLoading={isLoading} />
}

function OverrideInput({
  field,
  value,
  invalid,
  onChange,
  onCommit,
}: {
  field: ReviewField
  value: string[]
  invalid: boolean
  onChange: (values: string[]) => void
  onCommit: () => void
}) {
  const id = `review-override-${field.path}`
  const first = value[0] ?? ''
  const single = (v: string) => onChange(v ? [v] : [])
  // A picker commits on each change; there is no typing to wait out.
  const pick = (next: string[]) => {
    onChange(next)
    onCommit()
  }
  switch (kindOf(field.path)) {
    case 'person':
      return (
        <div onBlur={onCommit}>
          <PeopleInput id={id} value={first} onChange={single} />
        </div>
      )
    case 'people':
      return <PeopleListInput value={value} onChange={pick} />
    case 'labels':
      return <LabelsOverride value={value} onChange={pick} />
    case 'buildSystem':
    case 'generation':
      return (
        <EnumSelect
          id={id}
          fieldPath={kindOf(field.path)}
          value={first}
          onValueChange={(v) => pick(v ? [v] : [])}
          aria-invalid={invalid}
        />
      )
    case 'text':
      return (
        <Input
          id={id}
          aria-label={field.label}
          aria-invalid={invalid}
          value={first}
          onChange={(e) => onChange([e.target.value])}
          onBlur={onCommit}
        />
      )
  }
}

function ProblemLine({
  problem,
  template,
  parameterLabels,
  onParameter,
}: {
  problem: ReviewProblem
  template: TemplateReviewProps['template']
  parameterLabels: TemplateReviewProps['parameterLabels']
  onParameter: (name: string) => void
}) {
  return (
    <div className="space-y-1 text-sm text-destructive">
      <p>{problem.message}</p>
      {problem.templateProblem ? (
        <p className="text-xs text-muted-foreground">
          Template problem: report {template.title} ({template.id}, version {template.version}) to an administrator.
        </p>
      ) : (
        problem.parameters.length > 0 && (
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            Change
            {problem.parameters.map((name) => (
              <Button key={name} type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onParameter(name)}>
                {parameterLabels[name] ?? name}
              </Button>
            ))}
          </p>
        )
      )}
    </div>
  )
}

/**
 * The rendered component and every problem with it, grouped as the regular wizard's Review. Only
 * fields the template marks overridable can be edited; the problems are worked out by the caller.
 */
export function TemplateReview({
  template,
  run,
  problems,
  parameterLabels,
  overrides,
  overrideErrors,
  onParameter,
  onOverride,
  onOverrideCommit,
  readOnly = false,
  showSources = false,
}: TemplateReviewProps) {
  if (!run.component) return null
  const keep = [...problems.flatMap((p) => (p.path ? [p.path] : [])), ...template.overridable]
  const groups = reviewFieldGroups(run.component, keep)
  const unplaced = problems.filter((p) => !p.path || !groups.some((g) => g.rows.some((r) => r.path === p.path)))
  const problemLine = (problem: ReviewProblem, key: number) => (
    <ProblemLine key={key} problem={problem} template={template} parameterLabels={parameterLabels} onParameter={onParameter} />
  )

  return (
    <div className="space-y-4">
      {unplaced.length > 0 && (
        <div role="alert">
          <StatusBanner variant="destructive">{unplaced.map((problem, i) => problemLine(problem, i))}</StatusBanner>
        </div>
      )}
      {problems.some((p) => !p.templateProblem) && (
        <p className="text-xs text-muted-foreground">
          The registry reports its create rules one problem at a time, so after a fix another may follow.
        </p>
      )}
      <div className="divide-y rounded-md border text-sm">
        {groups.map((group) => (
          <section key={group.heading} className="space-y-2 p-3">
            <h3 className="font-medium text-foreground">{group.heading}</h3>
            {group.rows.map((field) => {
              const editable = !readOnly && template.overridable.includes(field.path)
              const edited = overrides[field.path]
              const sources = run.sources?.[field.path] ?? []
              return (
                <div key={field.path} data-testid={`review-field-${field.path}`} className="grid grid-cols-[10rem_1fr] gap-2">
                  <span className="text-xs text-muted-foreground">{field.label}</span>
                  <div className="space-y-1">
                    {editable ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <OverrideInput
                            field={field}
                            value={edited ? [...edited] : field.value}
                            invalid={!!overrideErrors[field.path]}
                            onChange={(values) => onOverride(field.path, values)}
                            onCommit={() => onOverrideCommit(field.path)}
                          />
                        </div>
                        {edited && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => onOverride(field.path, null)}>
                            Use the template value
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap font-mono text-xs">{field.value.join(', ')}</span>
                    )}
                    {edited && <Badge variant="secondary">changed from template</Badge>}
                    {showSources && (
                      <p className="text-xs text-muted-foreground">
                        {sources.length > 0 ? `from ${sources.map((s) => parameterLabels[s] ?? s).join(', ')}` : 'set by the template'}
                      </p>
                    )}
                    {overrideErrors[field.path] && <p className="text-sm text-destructive">{overrideErrors[field.path]}</p>}
                    {problems.filter((p) => p.path === field.path).map((problem, i) => problemLine(problem, i))}
                  </div>
                </div>
              )
            })}
          </section>
        ))}
      </div>
    </div>
  )
}
