import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react'
import { Button } from '../ui/button'
import { DialogTitle } from '../ui/dialog'
import { InlineError } from '../ui/inline-error'
import { SkeletonBlock } from '../ui/skeleton-block'
import { StatusBanner } from '../ui/status-banner'
import { UnsavedChangesGuard } from '../editor/UnsavedChangesGuard'
import { WizardStepRail, type RailStep } from '../wizard/WizardStepRail'
import { CreatedPanel } from '../wizard/CreatedPanel'
import { ChangeMetadataFields } from '../wizard/ChangeMetadataFields'
import { TemplateParameterForm } from './TemplateParameterForm'
import { TemplateReview } from './TemplateReview'
import { useComponentTemplate } from '../../hooks/useComponentTemplate'
import { useTemplateRun } from '../../hooks/useTemplateRun'
import { useSupportedGroups } from '../../hooks/useSupportedGroups'
import { usePortalLinks } from '../../hooks/useInfo'
import { useToast } from '../../hooks/use-toast'
import type { ComponentProfile } from '../../hooks/useComponentProfiles'
import type { ComponentCreateRequest } from '../../lib/types'
import { createJiraKeyError, normalizeChangeComment, normalizeJiraKey } from '../../lib/editor/jiraKey'
import { portalCreateRules } from '../../lib/component/portalCreateRules'
import { profileRuleErrors } from '../../lib/component/profileRules'
import { applyOverrides, reviewProblems } from '../../lib/component/templateReview'
import { initialParameterValues, templateParameterErrors, templateRunBody } from '../../lib/component/templateParameters'

type Step = 'profile' | 'parameters' | 'review'
const STEPS: readonly Step[] = ['profile', 'parameters', 'review']
const LABELS: Record<Step, string> = { profile: 'Profile', parameters: 'Parameters', review: 'Review & create' }
const SUBTITLES: Record<Step, string> = {
  profile: 'What are you creating?',
  parameters: 'The values this template asks for',
  review: 'Summary & save',
}

interface TemplateWizardProps {
  /** The template's entry in the profile listing; its field rules come from here. */
  entry: ComponentProfile
  headerTitle: string
  /** The wizard's Profile step, shown as this path's first step. */
  profileStep: ReactNode
  onCreateAnother: () => void
  /** The registry no longer has the template; the wizard goes back to the Profile step. */
  onTemplateGone: (message: string) => void
}

/**
 * Creating a component from one template: Profile → Parameters → Review & create. Typing sends
 * nothing to the registry; a dry run runs on Next and when an edited overridable field is left.
 * Review is reached only through a dry run of the values on screen.
 */
export function TemplateWizard({ entry, headerTitle, profileStep, onCreateAnother, onTemplateGone }: TemplateWizardProps) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const template = useComponentTemplate(entry.id)
  const templateRun = useTemplateRun(entry.id)
  const { groups: supportedGroups } = useSupportedGroups()
  const { data: portalLinks } = usePortalLinks()
  const gitBaseUrl = portalLinks?.gitBaseUrl

  const [step, setStep] = useState<Step>('parameters')
  const [visited, setVisited] = useState<ReadonlySet<Step>>(new Set(['profile', 'parameters']))
  const [edited, setEdited] = useState<Record<string, string[]>>({})
  const [registryParameterErrors, setRegistryParameterErrors] = useState<Record<string, string>>({})
  const [overrides, setOverrides] = useState<Record<string, string[]>>({})
  const [jiraTaskKey, setJiraTaskKey] = useState('')
  const [changeComment, setChangeComment] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null)
  const [focusParameter, setFocusParameter] = useState<string | null>(null)

  useEffect(() => {
    if (step !== 'parameters' || !focusParameter) return
    document.getElementById(`template-parameter-input-${focusParameter}`)?.focus()
    setFocusParameter(null)
  }, [step, focusParameter])

  const parameters = useMemo(() => template.data?.parameters ?? [], [template.data])
  const values = useMemo(() => ({ ...initialParameterValues(parameters), ...edited }), [parameters, edited])
  const localErrors = templateParameterErrors(parameters, values)
  const run = templateRun.run
  // The generated contract types an artifact mode as a plain string; the rendered component is the
  // create request the registry would accept.
  const rendered = run?.component as ComponentCreateRequest | undefined
  const canReview = !!run?.component

  const problems = useMemo(
    () => (run && rendered ? reviewProblems(run, portalCreateRules(rendered, { supportedGroups, gitBaseUrl })) : []),
    [run, rendered, supportedGroups, gitBaseUrl],
  )
  const overrideErrors = useMemo(() => {
    if (!rendered) return {}
    const request = applyOverrides(rendered, overrides)
    const errors: Record<string, string> = {}
    for (const [path, message] of profileRuleErrors(entry.rules, request)) if (path in overrides) errors[path] = message
    for (const issue of portalCreateRules(request, { supportedGroups, gitBaseUrl })) {
      if (issue.path in overrides && !errors[issue.path]) errors[issue.path] = issue.message
    }
    return errors
  }, [rendered, overrides, entry.rules, supportedGroups, gitBaseUrl])

  const enter = (next: Step) => {
    setStep(next)
    setVisited((prev) => new Set(prev).add(next))
  }
  const goTo = (next: Step) => {
    if (next === 'review' && !canReview) return
    enter(next)
  }

  const changeParameter = (name: string, next: string[]) => {
    setEdited((prev) => ({ ...prev, [name]: next }))
    setRegistryParameterErrors({})
    templateRun.discard()
  }

  const runDry = async (withOverrides: Record<string, string[]>) => {
    setCreateError(null)
    const result = await templateRun.dryRun(templateRunBody(values, withOverrides))
    if (!result) return
    if (result.parameterProblems.length > 0) {
      setRegistryParameterErrors(Object.fromEntries(result.parameterProblems.map((p) => [p.parameter, p.message])))
      setStep('parameters')
      return
    }
    // The run just arrived; this render's `canReview` predates it.
    if (result.component) enter('review')
  }

  const changeOverride = (path: string, next: string[] | null) => {
    const updated = { ...overrides }
    if (next === null) delete updated[path]
    else updated[path] = next
    setOverrides(updated)
    if (next === null) void runDry(updated)
  }

  const create = async () => {
    setCreating(true)
    setCreateError(null)
    const outcome = await templateRun.create({
      ...templateRunBody(values, overrides),
      jiraTaskKey: normalizeJiraKey(jiraTaskKey),
      changeComment: normalizeChangeComment(changeComment),
    })
    setCreating(false)
    if (outcome.kind === 'created') {
      toast({ title: 'Component created', description: `"${outcome.component.name}" was created.` })
      setCreated({ id: outcome.component.id, name: outcome.component.name })
    } else if (outcome.kind === 'failed') {
      if (outcome.status === 404) onTemplateGone(outcome.message)
      else setCreateError(outcome.message)
    }
  }

  if (created) {
    return (
      <CreatedPanel name={created.name} onCreateAnother={onCreateAnother} onOpen={() => navigate(`/components/${created.id}`)} />
    )
  }

  const nextDisabled =
    step === 'parameters' && (!template.isSuccess || Object.keys(localErrors).length > 0 || templateRun.running)
  const createDisabled =
    !canReview ||
    templateRun.running ||
    creating ||
    problems.length > 0 ||
    Object.keys(overrideErrors).length > 0 ||
    createJiraKeyError(jiraTaskKey) !== null
  const parameterLabels = Object.fromEntries(parameters.map((p) => [p.name, p.label]))
  const railSteps: RailStep<Step>[] = STEPS.map((s) => ({
    id: s,
    label: LABELS[s],
    subtitle: SUBTITLES[s],
    current: s === step,
    status: s === step ? 'active' : visited.has(s) && (s !== 'review' || canReview) ? 'done' : 'todo',
  }))
  const index = STEPS.indexOf(step)
  const failure = createError ?? templateRun.error?.message

  const body = () => {
    if (step === 'profile') return profileStep
    if (template.isError) {
      return (
        <div className="space-y-3">
          <InlineError message={`Could not load the template "${entry.title}" from the registry.`} />
          <Button type="button" variant="outline" onClick={() => void template.refetch()}>
            Retry
          </Button>
        </div>
      )
    }
    if (!template.data) return <SkeletonBlock className="h-40 w-full" />
    if (step === 'parameters') {
      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">{template.data.title}</h2>
            <p className="text-sm text-muted-foreground">{template.data.description}</p>
          </div>
          <TemplateParameterForm
            parameters={parameters}
            values={values}
            errors={{ ...registryParameterErrors, ...localErrors }}
            onChange={changeParameter}
          />
        </div>
      )
    }
    return (
      run && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Review & create</h2>
            <p className="text-sm text-muted-foreground">Everything below will be created.</p>
          </div>
          {templateRun.running && <p className="text-sm text-muted-foreground">Checking with the registry…</p>}
          <TemplateReview
            template={template.data}
            run={run}
            problems={problems}
            parameterLabels={parameterLabels}
            overrides={overrides}
            overrideErrors={overrideErrors}
            onParameter={(name) => {
              setFocusParameter(name)
              goTo('parameters')
            }}
            onOverride={changeOverride}
            onOverrideCommit={() => void runDry(overrides)}
          />
          <ChangeMetadataFields
            jiraTaskKey={jiraTaskKey}
            onJiraTaskKey={setJiraTaskKey}
            changeComment={changeComment}
            onChangeComment={setChangeComment}
          />
        </div>
      )
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <UnsavedChangesGuard when={Object.keys(edited).length > 0 || Object.keys(overrides).length > 0} />
      <div className="flex items-center gap-3 border-b px-6 py-4 pr-12">
        <DialogTitle className="text-lg font-semibold tracking-tight">{headerTitle}</DialogTitle>
      </div>
      <div className="flex min-h-0 flex-1">
        <WizardStepRail steps={railSteps} onSelect={goTo} />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-2xl space-y-6">
            {failure && step !== 'profile' && <StatusBanner variant="destructive">{failure}</StatusBanner>}
            {body()}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t bg-background px-6 py-3">
        <Button type="button" variant="outline" onClick={() => goTo(STEPS[index - 1]!)} disabled={index === 0}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <span className="text-sm text-muted-foreground">
          Step {index + 1} of {STEPS.length}
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate('/components')}>
            Cancel
          </Button>
          {step === 'review' ? (
            <Button type="button" onClick={() => void create()} disabled={createDisabled}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create component
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => (step === 'profile' ? goTo('parameters') : void runDry(overrides))}
              disabled={nextDisabled}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
