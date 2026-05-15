import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Separator } from '../ui/separator'
import type { ComponentDetail } from '../../lib/types'
import type { ComponentUpdateRequest } from '../../hooks/useComponent'
import type { UseMutationResult } from '@tanstack/react-query'
import { ApiError } from '../../lib/api'
import { selectBaseRow } from '../../lib/api/baseRow'

interface DistributionTabProps {
  component: ComponentDetail
  updateMutation: UseMutationResult<ComponentDetail, Error, ComponentUpdateRequest>
  toast: (opts: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void
}

export function DistributionTab({ component, updateMutation, toast }: DistributionTabProps) {
  const [explicit, setExplicit] = useState(component.distributionExplicit ?? false)
  const [external, setExternal] = useState(component.distributionExternal ?? false)

  useEffect(() => {
    setExplicit(component.distributionExplicit ?? false)
    setExternal(component.distributionExternal ?? false)
  }, [component])

  const baseRow = selectBaseRow(component)
  const maven = baseRow?.mavenArtifacts ?? []
  const fileUrl = baseRow?.fileUrlArtifacts ?? []
  const docker = baseRow?.dockerImages ?? []
  const packages = baseRow?.packages ?? []
  const securityGroups = component.securityGroups ?? []

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        version: component.version,
        distributionExplicit: explicit,
        distributionExternal: external,
      })
      toast({ title: 'Distribution saved' })
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
      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-3">
          <Switch id="dist-explicit" checked={explicit} onCheckedChange={setExplicit} />
          <Label htmlFor="dist-explicit" className="cursor-pointer">Explicit</Label>
        </div>
        <div className="flex items-center gap-3">
          <Switch id="dist-external" checked={external} onCheckedChange={setExternal} />
          <Label htmlFor="dist-external" className="cursor-pointer">External</Label>
        </div>
      </div>

      <Separator />

      {/* Maven Artifacts — read-only (Wave B will add typed inline editing) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Maven Artifacts</h3>
          <span className="text-xs text-muted-foreground">schema-v2: per-family editors coming in Wave B</span>
        </div>
        {maven.length > 0 ? (
          <ul className="space-y-1">
            {maven.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-2 items-center text-sm">
                <Badge variant="outline" className="font-mono">{a.groupPattern}</Badge>
                <span className="text-muted-foreground">:</span>
                <Badge variant="outline" className="font-mono">{a.artifactPattern}</Badge>
                {a.extension && <Badge variant="secondary">{a.extension}</Badge>}
                {a.classifier && <Badge variant="secondary">{a.classifier}</Badge>}
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No Maven artifacts.</div>
        )}
      </div>

      <Separator />

      {/* File URL Artifacts — read-only (Wave B will add typed inline editing) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">File URL Artifacts</h3>
          <span className="text-xs text-muted-foreground">schema-v2: per-family editors coming in Wave B</span>
        </div>
        {fileUrl.length > 0 ? (
          <ul className="space-y-1">
            {fileUrl.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-2 items-center text-sm">
                <Badge variant="outline" className="font-mono break-all">{a.url}</Badge>
                {a.artifactId && <Badge variant="secondary">{a.artifactId}</Badge>}
                {a.classifier && <Badge variant="secondary">{a.classifier}</Badge>}
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No file URL artifacts.</div>
        )}
      </div>

      <Separator />

      {/* Docker Images — read-only (Wave B will add typed inline editing) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Docker Images</h3>
          <span className="text-xs text-muted-foreground">schema-v2: per-family editors coming in Wave B</span>
        </div>
        {docker.length > 0 ? (
          <ul className="space-y-1">
            {docker.map((d) => (
              <li key={d.id} className="flex flex-wrap gap-2 items-center text-sm">
                <Badge variant="outline" className="font-mono">{d.imageName}</Badge>
                {d.flavor && <Badge variant="secondary">{d.flavor}</Badge>}
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No Docker images.</div>
        )}
      </div>

      <Separator />

      {/* Packages — read-only (Wave B will add typed inline editing) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Packages</h3>
          <span className="text-xs text-muted-foreground">schema-v2: per-family editors coming in Wave B</span>
        </div>
        {packages.length > 0 ? (
          <ul className="space-y-1">
            {packages.map((p) => (
              <li key={p.id} className="flex flex-wrap gap-2 items-center text-sm">
                <Badge variant="secondary">{p.packageType}</Badge>
                <Badge variant="outline">{p.packageName}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No packages.</div>
        )}
      </div>

      <Separator />

      {/* Security Groups — read-only (moved to component level in schema-v2) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Security Groups</h3>
          <span className="text-xs text-muted-foreground">schema-v2: per-family editors coming in Wave B</span>
        </div>
        {securityGroups.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {securityGroups.map((g) => (
              <Badge key={g.id} variant="outline">{g.groupType}: {g.groupName}</Badge>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No security groups.</div>
        )}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
          <Save className="h-4 w-4" />
          {updateMutation.isPending ? 'Saving...' : 'Save Distribution'}
        </Button>
      </div>
    </div>
  )
}
