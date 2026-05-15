import type { ComponentConfiguration, ComponentDetail } from '../types'

// schema-v2 stores per-component configuration as a flat list of rows on
// `ComponentDetail.configurations`. Exactly one row is the BASE row
// (`rowType === 'BASE'`); the remainder are override rows (SCALAR_OVERRIDE
// or MARKER). The editor surfaces in Waves A/B read from the BASE row's
// aspects/child lists; the configurations table in Wave C-read shows them
// all side-by-side.

export function selectBaseRow(detail: ComponentDetail): ComponentConfiguration | undefined {
  return detail.configurations?.find((row) => row.rowType === 'BASE')
}

export function selectOverrideRows(detail: ComponentDetail): ComponentConfiguration[] {
  return detail.configurations?.filter((row) => row.rowType !== 'BASE') ?? []
}
