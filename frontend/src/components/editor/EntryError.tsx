/** Registry placement error under a VCS entry field (VCS tab and override editor). */
export function EntryError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="text-xs text-destructive">{message}</p> : null
}

/** Input props for a VCS entry field: flag it and name its registry error (keyed
 *  `<index>.<field>`, rendered by EntryError as `<prefix>-<index>-<field>-error`) as its description. */
// eslint-disable-next-line react-refresh/only-export-components -- tiny helper co-located with the component it pairs with
export function entryErrorProps(prefix: string, errors: Record<string, string>, i: number, field: string) {
  return errors[`${i}.${field}`]
    ? { 'aria-invalid': true, 'aria-describedby': `${prefix}-${i}-${field}-error` }
    : {}
}
