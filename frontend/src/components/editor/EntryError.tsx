/** Registry placement error under a VCS entry field (VCS tab and override editor). */
export function EntryError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="text-xs text-destructive">{message}</p> : null
}

/** Input props for a VCS field with a registry error: flag it and name the message
 *  as its description. `key` is `<entry index>.<field>`, or `buildWorkingDirectory`
 *  for the row's own field; EntryError renders it as `<prefix>-<key, "." as "-">-error`. */
// eslint-disable-next-line react-refresh/only-export-components -- tiny helper co-located with the component it pairs with
export function fieldErrorProps(prefix: string, errors: Record<string, string>, key: string) {
  return errors[key]
    ? { 'aria-invalid': true, 'aria-describedby': `${prefix}-${key.replace('.', '-')}-error` }
    : {}
}
