import type { ComponentUpdateRequest } from '../../lib/types'
import type { FieldOverride } from '../../lib/types'
import type { SectionSlice } from '../../lib/editor/combineRequest'
import { useFieldConfig } from '../../hooks/useAdminConfig'
import { labelFor } from '../../hooks/useFieldConfig'
import { useOverridesDraft } from './overridesDraft'
import { toUpsert, diffOverrides, type FieldOverrideUpsert } from './overrideDraftUtil'

/**
 * Field-overrides as a combined-save section (Portal item D). Mirrors the other
 * `use<Tab>Section` hooks: reports `isDirty`, contributes its fragment of the
 * ONE combined request, and lists its changed rows for the Review dialog — but
 * its draft lives in the page-level `OverridesDraftProvider` (consumed by ~30
 * inline editors + the Overrides tab), so this hook just projects that draft
 * into a `SectionSlice`.
 *
 * The request carries the DESIRED FULL SET in `fieldOverrides` (server upserts
 * by id, deletes anything omitted, all in the component PATCH's transaction).
 */

// Thin local extension until the regenerated OpenAPI schema adds `fieldOverrides`
// to ComponentUpdateRequest (step 5 / CRS override-contract PR). Remove then.
type RequestWithOverrides = Partial<ComponentUpdateRequest> & {
  fieldOverrides?: FieldOverrideUpsert[]
}

export interface OverridesSection {
  slice: SectionSlice
  reset: () => void
}

export function useOverridesSection(): OverridesSection {
  const { serverOverrides, effectiveOverrides, isDirty, reset } = useOverridesDraft()
  const { data: fcData } = useFieldConfig()

  const label = (o: FieldOverride) =>
    `Override · ${labelFor(fcData, o.overriddenAttribute, o.overriddenAttribute)}`

  const diff = isDirty ? diffOverrides(serverOverrides, effectiveOverrides, label) : []
  const request: RequestWithOverrides = isDirty
    ? { fieldOverrides: effectiveOverrides.map(toUpsert) }
    : {}

  return { slice: { isDirty, diff, request }, reset }
}
