/** Registry placement error under a VCS entry field (VCS tab and override editor). */
export function EntryError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="text-xs text-destructive">{message}</p> : null
}
