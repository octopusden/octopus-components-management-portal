/**
 * Per-field help text shown by the editor-tab info tooltips (FieldInfo).
 * Keys use the section-prefixed dotted convention from useFieldConfig
 * (component.*, build.*, jira.*, vcs.*, distribution.*, escrow.*) so the same
 * registry can later cover the override editor, filters, and the create
 * dialog. Plain English, generic wording only — no customer/org or
 * product-classification names (CI content validation rejects those).
 * A path with no entry renders no icon.
 */
export const fieldDescriptions: Record<string, string> = {
  'component.name':
    'Unique technical key of the component. Used as the identifier in the Components Registry and across all integrations. Immutable after creation.',
}
