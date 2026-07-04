import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'

interface ClassificationSectionProps {
  explicit: boolean
  external: boolean
  onExplicitChange: (v: boolean) => void
  onExternalChange: (v: boolean) => void
}

/**
 * "Classification" — the Explicit / External distribution-classification toggles.
 * Relocated from the Distribution tab to the General tab (editor UI-reorg) while
 * the toggle STATE still lives in the page-level `useDistributionSection`. This is
 * a render-location + error-routing move only — no serialization or data-model
 * change (mirrors ProducedArtifactsSection's relocation to the Build tab).
 */
export function ClassificationSection({ explicit, external, onExplicitChange, onExternalChange }: ClassificationSectionProps) {
  return (
    <section data-testid="section-classification">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Classification</h3>
      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-3">
          <Switch id="dist-explicit" checked={explicit} onCheckedChange={onExplicitChange} />
          <Label htmlFor="dist-explicit" className="cursor-pointer"><FieldLabelText path="component.distributionExplicit" fallback="Explicit" /></Label>
          <FieldInfo path="component.distributionExplicit" label="Explicit" />
        </div>
        <div className="flex items-center gap-3">
          <Switch id="dist-external" checked={external} onCheckedChange={onExternalChange} />
          <Label htmlFor="dist-external" className="cursor-pointer"><FieldLabelText path="component.distributionExternal" fallback="External" /></Label>
          <FieldInfo path="component.distributionExternal" label="External" />
        </div>
      </div>
    </section>
  )
}
