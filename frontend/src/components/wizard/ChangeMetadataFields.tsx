import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { createJiraKeyError } from '../../lib/editor/jiraKey'

/** The Jira task key and comment a create records on its audit row. */
export function ChangeMetadataFields({
  jiraTaskKey,
  onJiraTaskKey,
  changeComment,
  onChangeComment,
}: {
  jiraTaskKey: string
  onJiraTaskKey: (value: string) => void
  changeComment: string
  onChangeComment: (value: string) => void
}) {
  const error = createJiraKeyError(jiraTaskKey)
  return (
    <fieldset className="space-y-4 rounded-md border border-border p-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">Change metadata</legend>
      <div className="space-y-1.5">
        <Label htmlFor="create-jira-key">
          Jira task key <span className="text-destructive">*</span>
        </Label>
        <Input
          id="create-jira-key"
          placeholder="ABC-123"
          value={jiraTaskKey}
          onChange={(e) => onJiraTaskKey(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? 'create-jira-key-error' : undefined}
        />
        {error && (
          <p id="create-jira-key-error" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="create-change-comment">Comment (optional)</Label>
        <textarea
          id="create-change-comment"
          placeholder="What changed and why"
          value={changeComment}
          onChange={(e) => onChangeComment(e.target.value)}
          rows={3}
          className="flex min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
    </fieldset>
  )
}
