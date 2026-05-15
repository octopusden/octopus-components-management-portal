import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Button } from '../ui/button'
import { EnumSelect } from '../ui/EnumSelect'
import { FieldOverrideInline } from './FieldOverrideInline'
import type { ComponentDetail } from '../../lib/types'
import type { ComponentUpdateRequest } from '../../hooks/useComponent'
import type { UseMutationResult } from '@tanstack/react-query'
import { ApiError } from '../../lib/api'
import { useFieldConfigEntry } from '../../hooks/useFieldConfig'
import { selectBaseRow } from '../../lib/api/baseRow'

interface EscrowTabProps {
  component: ComponentDetail
  updateMutation: UseMutationResult<ComponentDetail, Error, ComponentUpdateRequest>
  toast: (opts: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void
}

export function EscrowTab({ component, updateMutation, toast }: EscrowTabProps) {
  const baseRow = selectBaseRow(component)
  const escrow = baseRow?.escrow

  // productType migrated here from GeneralTab (§7.0/2c).
  // Semantic: product-line classifier (values configured via FieldConfig options) used for
  // escrow-specific classification; lives on the top-level ComponentDetail but
  // is conceptually escrow metadata.
  const { entry: productTypeEntry } = useFieldConfigEntry('component.productType')
  const [productType, setProductType] = useState(component.productType ?? '')

  const [generation, setGeneration] = useState(escrow?.generation ?? '')
  const [diskSpace, setDiskSpace] = useState(escrow?.diskSpace ?? '')
  const [reusable, setReusable] = useState(escrow?.reusable ?? false)
  const [providedDependencies, setProvidedDependencies] = useState(escrow?.providedDependencies ?? '')
  const [additionalSources, setAdditionalSources] = useState(escrow?.additionalSources ?? '')
  const [gradleIncludeConfigurations, setGradleIncludeConfigurations] = useState(escrow?.gradleIncludeConfigurations ?? '')
  const [gradleExcludeConfigurations, setGradleExcludeConfigurations] = useState(escrow?.gradleExcludeConfigurations ?? '')
  const [gradleIncludeTestConfigurations, setGradleIncludeTestConfigurations] = useState(escrow?.gradleIncludeTestConfigurations ?? false)

  useEffect(() => {
    const e = selectBaseRow(component)?.escrow
    setProductType(component.productType ?? '')
    setGeneration(e?.generation ?? '')
    setDiskSpace(e?.diskSpace ?? '')
    setReusable(e?.reusable ?? false)
    setProvidedDependencies(e?.providedDependencies ?? '')
    setAdditionalSources(e?.additionalSources ?? '')
    setGradleIncludeConfigurations(e?.gradleIncludeConfigurations ?? '')
    setGradleExcludeConfigurations(e?.gradleExcludeConfigurations ?? '')
    setGradleIncludeTestConfigurations(e?.gradleIncludeTestConfigurations ?? false)
  }, [component])

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        version: component.version,
        // productType: hidden → don't include (undefined = no change);
        // editable/readonly → send only when a value is present.
        ...(productTypeEntry.visibility !== 'hidden' && productType
          ? { productType }
          : {}),
        baseConfiguration: {
          escrow: {
            providedDependencies: providedDependencies || null,
            reusable,
            generation: generation || null,
            diskSpace: diskSpace || null,
            additionalSources: additionalSources || null,
            gradleIncludeConfigurations: gradleIncludeConfigurations || null,
            gradleExcludeConfigurations: gradleExcludeConfigurations || null,
            gradleIncludeTestConfigurations,
          },
        },
      })
      toast({ title: 'Escrow configuration saved' })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast({ title: 'Conflict', description: 'Please refresh and try again.', variant: 'destructive' })
        return
      }
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Product Type — migrated from GeneralTab (§7.0/2c); visibility-gated */}
        {productTypeEntry.visibility !== 'hidden' && (
          <div className="space-y-1.5">
            <Label>Product Type</Label>
            <EnumSelect
              fieldPath="component.productType"
              value={productType}
              onValueChange={setProductType}
              placeholder="Select product type"
              disabled={productTypeEntry.visibility === 'readonly'}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Generation</Label>
          <EnumSelect
            fieldPath="generation"
            value={generation}
            onValueChange={setGeneration}
            placeholder="Select generation"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Disk Space</Label>
          <Input
            value={diskSpace}
            onChange={(e) => setDiskSpace(e.target.value)}
            placeholder="e.g. 10GB"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="escrow-reusable"
          checked={reusable}
          onCheckedChange={setReusable}
        />
        <Label htmlFor="escrow-reusable" className="cursor-pointer">Reusable</Label>
      </div>

      <div className="space-y-1.5">
        <Label>Provided Dependencies</Label>
        <textarea
          className="w-full h-24 rounded-md border bg-background px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          value={providedDependencies}
          onChange={(e) => setProvidedDependencies(e.target.value)}
          spellCheck={false}
          placeholder="Comma-separated list of provided dependencies"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Additional Sources</Label>
        <Input
          value={additionalSources}
          onChange={(e) => setAdditionalSources(e.target.value)}
          placeholder="Additional source paths"
        />
        <FieldOverrideInline componentId={component.id} overriddenAttribute="escrow.additionalSources" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Gradle Include Configurations</Label>
          <Input
            value={gradleIncludeConfigurations}
            onChange={(e) => setGradleIncludeConfigurations(e.target.value)}
            placeholder="e.g. compile,runtimeClasspath"
          />
          <FieldOverrideInline componentId={component.id} overriddenAttribute="escrow.gradleIncludeConfigurations" />
        </div>

        <div className="space-y-1.5">
          <Label>Gradle Exclude Configurations</Label>
          <Input
            value={gradleExcludeConfigurations}
            onChange={(e) => setGradleExcludeConfigurations(e.target.value)}
            placeholder="e.g. testCompile,testRuntime"
          />
          <FieldOverrideInline componentId={component.id} overriddenAttribute="escrow.gradleExcludeConfigurations" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="escrow-gradle-include-test"
          checked={gradleIncludeTestConfigurations}
          onCheckedChange={setGradleIncludeTestConfigurations}
        />
        <Label htmlFor="escrow-gradle-include-test" className="cursor-pointer">Gradle Include Test Configurations</Label>
        <FieldOverrideInline componentId={component.id} overriddenAttribute="escrow.gradleIncludeTestConfigurations" />
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
          <Save className="h-4 w-4" />
          {updateMutation.isPending ? 'Saving...' : 'Save Escrow'}
        </Button>
      </div>
    </div>
  )
}
