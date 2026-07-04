import { UseFormReturn } from 'react-hook-form'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import { ArtifactOwnershipEditor } from './ArtifactOwnershipEditor'
import { useSupportedGroups } from '../../hooks/useSupportedGroups'
import { OWNERSHIP_ALL_VERSIONS } from '../../lib/artifactOwnership'
import type { ComponentDetail } from '../../lib/types'
import type { GeneralFormValues } from './GeneralTab'

interface ProducedArtifactsSectionProps {
  form: UseFormReturn<GeneralFormValues>
  component: ComponentDetail
  /** Per-component edit gate — disables the editor for read-only viewers. */
  canEdit?: boolean
}

/**
 * "Produced Artifacts" ownership editor. Relocated from the General tab to the
 * Build tab (editor UI-reorg) while the form STATE stays in the page-level
 * General RHF form (`artifactIds`). Mirrors DocumentationTab: a separate tab
 * surface that reads/writes the same page-owned form. No serialization or
 * data-model change — this is a render-location move only.
 */
export function ProducedArtifactsSection({ form, component, canEdit = true }: ProducedArtifactsSectionProps) {
  // Supported groupId prefixes drive the ownership group-prefix check (CRS rule
  // #10). Shared (cached) query — also read by the page for the Save gate.
  const { groups: supportedGroups } = useSupportedGroups()

  // Ownership is edited as a whole list by ArtifactOwnershipEditor (not a simple
  // field-array of inputs), so it is watched + replaced wholesale via setValue.
  const watchedArtifactIds = form.watch('artifactIds')
  // Override mappings must reference an existing configuration range (CRS invariant); offer the
  // component's distinct non-base ranges.
  const ownershipConfigRanges = Array.from(
    new Set((component.configurations ?? []).map((c) => c.versionRange).filter((r) => r && r !== OWNERSHIP_ALL_VERSIONS)),
  )

  return (
    <section data-testid="section-artifact-ids">
      <div className="flex items-center gap-1 mb-3">
        <h3 className="text-sm font-medium text-muted-foreground"><FieldLabelText path="component.artifactIds" fallback="Produced Artifacts" /></h3>
        <FieldInfo path="component.artifactIds" label="Produced Artifacts" />
      </div>
      <p className="mb-3 text-[13px] text-muted-foreground">
        The artifacts this component produces — one Group ID per row, each with its own matching rule. A component may
        produce several.
      </p>
      <ArtifactOwnershipEditor
        value={watchedArtifactIds ?? []}
        configRanges={ownershipConfigRanges}
        supportedGroups={supportedGroups}
        disabled={!canEdit}
        onChange={(next) => form.setValue('artifactIds', next, { shouldDirty: true, shouldTouch: true })}
      />
    </section>
  )
}
