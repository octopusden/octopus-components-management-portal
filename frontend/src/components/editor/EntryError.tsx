/** `<prefix>-<key, "." as "-">-error`: the id EntryError renders and its input's aria-describedby names. */
const errorId = (prefix: string, key: string) => `${prefix}-${key.replace('.', '-')}-error`

/**
 * Registry placement error under a VCS field (VCS tab and override editor). `errorKey` is
 * `<entry index>.<field>`, or `buildWorkingDirectory` for the row's own field.
 */
export function EntryError({ prefix, errors, errorKey }: { prefix: string; errors: Record<string, string>; errorKey: string }) {
  const message = errors[errorKey]
  return message ? <p id={errorId(prefix, errorKey)} className="text-xs text-destructive">{message}</p> : null
}

/** Input props for a VCS field with a registry error: flag it and name the message as its description. */
// eslint-disable-next-line react-refresh/only-export-components -- tiny helper co-located with the component it pairs with
export function fieldErrorProps(prefix: string, errors: Record<string, string>, key: string) {
  return errors[key] ? { 'aria-invalid': true, 'aria-describedby': errorId(prefix, key) } : {}
}
