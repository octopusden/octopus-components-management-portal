import type { ComponentDetail } from '../types'
import { selectBaseRow } from '../api/baseRow'

/**
 * Profile completeness % (spec §2.3 / §2.5) — a pure, client-side score over a
 * fixed set of "required" fields: component key, display name, owner, client
 * code, jira project key, and build system. NOT a server contract — purely a
 * filled-in-ness hint shown in the header subline. Each present (non-blank)
 * field counts equally; the score is `round(present / total * 100)`.
 */
const COMPLETENESS_TOTAL = 6

export function completenessPercent(component: ComponentDetail): number {
  const baseRow = selectBaseRow(component)
  const filled = [
    component.name,
    component.displayName,
    component.componentOwner,
    component.clientCode,
    baseRow?.jira?.projectKey,
    baseRow?.build?.buildSystem,
  ].filter((v) => typeof v === 'string' && v.trim() !== '').length
  return Math.round((filled / COMPLETENESS_TOTAL) * 100)
}
