import type { ComponentConfiguration, ComponentDetail } from '../types'

// Per-component configuration is a flat list of rows on
// `ComponentDetail.configurations`. Exactly one row is the BASE row
// (`rowType === 'BASE'`); the remainder are override rows (SCALAR_OVERRIDE
// or MARKER). Per-tab editors read aspects/child lists from the BASE row;
// the Configurations tab renders the full flat list.

// Server invariant: a component has at most one BASE row. If the server
// ever emits more than one (data-migration bug, race during config seed),
// `.find()` would silently pick the first match and the rest would be
// invisible to every editor tab. Log a console.warn so the bug surfaces
// in the browser devtools without breaking the UI — `selectBaseRow` is
// called on every render of every editor surface, so we cap to one warn
// per component snapshot to avoid log flooding.
const multiBaseWarned = new WeakSet<ComponentDetail>()

export function selectBaseRow(detail: ComponentDetail): ComponentConfiguration | undefined {
  const baseRows = (detail.configurations ?? []).filter((row) => row.rowType === 'BASE')
  if (baseRows.length > 1 && !multiBaseWarned.has(detail)) {
    multiBaseWarned.add(detail)
    console.warn(
      `[baseRow] Component ${detail.id} has ${baseRows.length} BASE rows on the wire; ` +
        `expected exactly one. Falling back to the first match — the rest are invisible to editors.`,
    )
  }
  return baseRows[0]
}

export function selectOverrideRows(detail: ComponentDetail): ComponentConfiguration[] {
  return (detail.configurations ?? []).filter((row) => row.rowType !== 'BASE')
}
