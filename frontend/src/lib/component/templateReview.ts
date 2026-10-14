import type { TemplateRun } from '../../hooks/useTemplateRun'
import type { PortalRuleIssue } from './portalCreateRules'

/** One problem Review shows, from the registry or from the Portal's own rules. */
export interface ReviewProblem {
  /** The create-request path it is shown on; `undefined` shows it at the top of Review. */
  path: string | undefined
  message: string
  /** The parameters the field came from, each a way back to the Parameters step. */
  parameters: string[]
  /** The template, not the creator's values, has to change: report it to an administrator. */
  templateProblem: boolean
}

// The registry words many problems as `<create-request path>: <message>`.
const FIELD_PREFIX = /^([A-Za-z][\w.[\]]*): (.+)$/s

function withoutPrefix(message: string): { field: string | undefined; text: string } {
  const match = FIELD_PREFIX.exec(message)
  return match ? { field: match[1], text: match[2]! } : { field: undefined, text: message }
}

/**
 * Every problem Review shows for a dry run: the registry's, then the Portal-only rules' on the
 * rendered component.
 *
 * A Portal problem takes the parameters the dry run says its field came from. With none, it is the
 * template's problem — unless the creator overrode that field, when it is theirs to fix.
 */
export function reviewProblems(run: TemplateRun, portalIssues: readonly PortalRuleIssue[]): ReviewProblem[] {
  const shown: ReviewProblem[] = run.problems.map((problem) => {
    const { field, text } = withoutPrefix(problem.message)
    return {
      path: problem.fields[0] ?? field,
      message: field ? text : problem.message,
      parameters: [...problem.parameters],
      templateProblem: problem.templateProblem,
    }
  })
  for (const issue of portalIssues) {
    if (shown.some((p) => p.path === issue.path && p.message === issue.message)) continue
    const parameters = [...(run.sources?.[issue.path] ?? [])]
    shown.push({
      path: issue.path,
      message: issue.message,
      parameters,
      templateProblem: parameters.length === 0 && !(run.overridden ?? []).includes(issue.path),
    })
  }
  return shown
}
