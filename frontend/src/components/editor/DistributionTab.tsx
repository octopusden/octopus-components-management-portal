import { useState, useEffect } from 'react'
import { Save, Plus, Trash2 } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Button } from '../ui/button'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import { Separator } from '../ui/separator'
import type { ComponentDetail, MavenArtifact, FileUrlArtifact, DockerImage, PackageEntry, SecurityGroup } from '../../lib/types'
import type { ComponentUpdateRequest } from '../../hooks/useComponent'
import type { UseMutationResult } from '@tanstack/react-query'
import { useOptimisticConflict } from '../../hooks/useOptimisticConflict'
import { selectBaseRow } from '../../lib/api/baseRow'
import { CANNOT_EDIT_TITLE } from './editPermission'

interface DistributionTabProps {
  component: ComponentDetail
  updateMutation: UseMutationResult<ComponentDetail, Error, ComponentUpdateRequest>
  toast: (opts: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void
  canEdit: boolean
}

// Local edit state mirrors the server shapes minus id/sortOrder
interface MavenState { groupPattern: string; artifactPattern: string; extension: string; classifier: string }
interface FileUrlState { url: string; artifactId: string; classifier: string }
interface DockerState { imageName: string; flavor: string }
interface PackageState { packageType: string; packageName: string }
interface SecurityGroupState { groupType: string; groupName: string }

function toMavenState(a: MavenArtifact): MavenState {
  return { groupPattern: a.groupPattern, artifactPattern: a.artifactPattern, extension: a.extension ?? '', classifier: a.classifier ?? '' }
}

function toFileUrlState(a: FileUrlArtifact): FileUrlState {
  return { url: a.url, artifactId: a.artifactId ?? '', classifier: a.classifier ?? '' }
}

function toDockerState(d: DockerImage): DockerState {
  return { imageName: d.imageName, flavor: d.flavor ?? '' }
}

function toPackageState(p: PackageEntry): PackageState {
  return { packageType: p.packageType, packageName: p.packageName }
}

function toSecurityGroupState(g: SecurityGroup): SecurityGroupState {
  return { groupType: g.groupType, groupName: g.groupName }
}

function sortBy<T extends { sortOrder: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function DistributionTab({ component, updateMutation, toast, canEdit }: DistributionTabProps) {
  const handleConflict = useOptimisticConflict(component.id)
  const [explicit, setExplicit] = useState(component.distributionExplicit ?? false)
  const [external, setExternal] = useState(component.distributionExternal ?? false)

  const baseRow = selectBaseRow(component)

  const [maven, setMaven] = useState<MavenState[]>(
    sortBy(baseRow?.mavenArtifacts ?? []).map(toMavenState),
  )
  const [fileUrl, setFileUrl] = useState<FileUrlState[]>(
    sortBy(baseRow?.fileUrlArtifacts ?? []).map(toFileUrlState),
  )
  const [docker, setDocker] = useState<DockerState[]>(
    sortBy(baseRow?.dockerImages ?? []).map(toDockerState),
  )
  const [packages, setPackages] = useState<PackageState[]>(
    sortBy(baseRow?.packages ?? []).map(toPackageState),
  )
  // securityGroups live on the component, not the BASE row — saved top-level in the update request
  const [securityGroups, setSecurityGroups] = useState<SecurityGroupState[]>(
    (component.securityGroups ?? []).map(toSecurityGroupState),
  )

  useEffect(() => {
    setExplicit(component.distributionExplicit ?? false)
    setExternal(component.distributionExternal ?? false)
    const br = selectBaseRow(component)
    setMaven(sortBy(br?.mavenArtifacts ?? []).map(toMavenState))
    setFileUrl(sortBy(br?.fileUrlArtifacts ?? []).map(toFileUrlState))
    setDocker(sortBy(br?.dockerImages ?? []).map(toDockerState))
    setPackages(sortBy(br?.packages ?? []).map(toPackageState))
    setSecurityGroups((component.securityGroups ?? []).map(toSecurityGroupState))
  }, [component])

  // ── Maven helpers ──────────────────────────────────────────────────────────
  function addMaven() { setMaven((p) => [...p, { groupPattern: '', artifactPattern: '', extension: '', classifier: '' }]) }
  function updateMaven(i: number, field: keyof MavenState, value: string) { setMaven((p) => p.map((r, idx) => idx === i ? { ...r, [field]: value } : r)) }
  function removeMaven(i: number) { setMaven((p) => p.filter((_, idx) => idx !== i)) }

  // ── File URL helpers ───────────────────────────────────────────────────────
  function addFileUrl() { setFileUrl((p) => [...p, { url: '', artifactId: '', classifier: '' }]) }
  function updateFileUrl(i: number, field: keyof FileUrlState, value: string) { setFileUrl((p) => p.map((r, idx) => idx === i ? { ...r, [field]: value } : r)) }
  function removeFileUrl(i: number) { setFileUrl((p) => p.filter((_, idx) => idx !== i)) }

  // ── Docker helpers ─────────────────────────────────────────────────────────
  function addDocker() { setDocker((p) => [...p, { imageName: '', flavor: '' }]) }
  function updateDocker(i: number, field: keyof DockerState, value: string) { setDocker((p) => p.map((r, idx) => idx === i ? { ...r, [field]: value } : r)) }
  function removeDocker(i: number) { setDocker((p) => p.filter((_, idx) => idx !== i)) }

  // ── Packages helpers ───────────────────────────────────────────────────────
  function addPackage() { setPackages((p) => [...p, { packageType: '', packageName: '' }]) }
  function updatePackage(i: number, field: keyof PackageState, value: string) { setPackages((p) => p.map((r, idx) => idx === i ? { ...r, [field]: value } : r)) }
  function removePackage(i: number) { setPackages((p) => p.filter((_, idx) => idx !== i)) }

  // ── Security Group helpers ─────────────────────────────────────────────────
  function addSecurityGroup() { setSecurityGroups((p) => [...p, { groupType: 'read', groupName: '' }]) }
  function updateSecurityGroup(i: number, field: keyof SecurityGroupState, value: string) { setSecurityGroups((p) => p.map((r, idx) => idx === i ? { ...r, [field]: value } : r)) }
  function removeSecurityGroup(i: number) { setSecurityGroups((p) => p.filter((_, idx) => idx !== i)) }

  async function handleSave() {
    if (!canEdit) return // Save is disabled when !canEdit; guard the handler too (backend also 403s).
    // Drop rows whose required fields are still blank — the wire shape's
    // required strings would otherwise hit the server as empty values
    // and 400. Save is a button click (not a form submit), so HTML
    // `required` doesn't gate; this is the equivalent guard server-side
    // contracts assume. Trim before checking so whitespace-only doesn't
    // sneak through.
    const cleanedMaven = maven
      .map((a) => ({
        groupPattern: a.groupPattern.trim(),
        artifactPattern: a.artifactPattern.trim(),
        extension: (a.extension || '').trim(),
        classifier: (a.classifier || '').trim(),
      }))
      .filter((a) => a.groupPattern !== '' && a.artifactPattern !== '')
    const cleanedFileUrl = fileUrl
      .map((a) => ({
        url: a.url.trim(),
        artifactId: (a.artifactId || '').trim(),
        classifier: (a.classifier || '').trim(),
      }))
      .filter((a) => a.url !== '')
    const cleanedDocker = docker
      .map((d) => ({
        imageName: d.imageName.trim(),
        flavor: (d.flavor || '').trim(),
      }))
      .filter((d) => d.imageName !== '')
    const cleanedPackages = packages
      .map((p) => ({
        packageType: p.packageType.trim(),
        packageName: p.packageName.trim(),
      }))
      .filter((p) => p.packageType !== '' && p.packageName !== '')
    const cleanedSecGroups = securityGroups
      .map((g) => ({
        groupType: g.groupType.trim(),
        groupName: g.groupName.trim(),
      }))
      .filter((g) => g.groupName !== '')

    try {
      await updateMutation.mutateAsync({
        version: component.version,
        clearGroup: false,
        distributionExplicit: explicit,
        distributionExternal: external,
        // securityGroups are a per-component list — sent top-level, NOT inside baseConfiguration
        securityGroups: cleanedSecGroups.map((g) => ({
          groupType: g.groupType,
          groupName: g.groupName,
        })),
        baseConfiguration: {
          mavenArtifacts: cleanedMaven.map((a) => ({
            groupPattern: a.groupPattern,
            artifactPattern: a.artifactPattern,
            extension: a.extension || null,
            classifier: a.classifier || null,
          })),
          fileUrlArtifacts: cleanedFileUrl.map((a) => ({
            url: a.url,
            artifactId: a.artifactId || null,
            classifier: a.classifier || null,
          })),
          dockerImages: cleanedDocker.map((d) => ({
            imageName: d.imageName,
            flavor: d.flavor || null,
          })),
          packages: cleanedPackages.map((p) => ({
            packageType: p.packageType,
            packageName: p.packageName,
          })),
        },
      })
      toast({ title: 'Distribution saved' })
    } catch (err) {
      const conflict = await handleConflict(err)
      if (conflict) {
        toast({ ...conflict, variant: 'destructive' })
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
          <Label htmlFor="dist-explicit" className="cursor-pointer"><FieldLabelText path="component.distributionExplicit" fallback="Explicit" /></Label>
          <FieldInfo path="component.distributionExplicit" label="Explicit" />
        </div>
        <div className="flex items-center gap-3">
          <Switch id="dist-external" checked={external} onCheckedChange={setExternal} />
          <Label htmlFor="dist-external" className="cursor-pointer"><FieldLabelText path="component.distributionExternal" fallback="External" /></Label>
          <FieldInfo path="component.distributionExternal" label="External" />
        </div>
      </div>

      <Separator />

      {/* ── Maven Artifacts ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold"><FieldLabelText path="distribution.mavenArtifacts" fallback="Maven Artifacts" /></h3>
            <FieldInfo path="distribution.mavenArtifacts" label="Maven Artifacts" />
          </div>
          <Button variant="ghost" size="sm" onClick={addMaven} disabled={!canEdit}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {maven.map((row, i) => (
          <div key={i} className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Artifact {i + 1}</span>
              <Button variant="ghost" size="sm" onClick={() => removeMaven(i)} disabled={!canEdit} className="h-7 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.maven.groupPattern" fallback="Group Pattern" /> <span className="text-destructive">*</span></Label>
                  <FieldInfo path="distribution.maven.groupPattern" label="Group Pattern" />
                </div>
                <Input required value={row.groupPattern} onChange={(e) => updateMaven(i, 'groupPattern', e.target.value)} placeholder="org.example.alpha" className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.maven.artifactPattern" fallback="Artifact Pattern" /> <span className="text-destructive">*</span></Label>
                  <FieldInfo path="distribution.maven.artifactPattern" label="Artifact Pattern" />
                </div>
                <Input required value={row.artifactPattern} onChange={(e) => updateMaven(i, 'artifactPattern', e.target.value)} placeholder="my-component-*" className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.maven.extension" fallback="Extension" /></Label>
                  <FieldInfo path="distribution.maven.extension" label="Extension" />
                </div>
                <Input value={row.extension} onChange={(e) => updateMaven(i, 'extension', e.target.value)} placeholder="jar" className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.maven.classifier" fallback="Classifier" /></Label>
                  <FieldInfo path="distribution.maven.classifier" label="Classifier" />
                </div>
                <Input value={row.classifier} onChange={(e) => updateMaven(i, 'classifier', e.target.value)} placeholder="sources" className="font-mono text-xs" />
              </div>
            </div>
          </div>
        ))}

        {maven.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No Maven artifacts.</div>
        )}
      </div>

      <Separator />

      {/* ── File URL Artifacts ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold"><FieldLabelText path="distribution.fileUrlArtifacts" fallback="File URL Artifacts" /></h3>
            <FieldInfo path="distribution.fileUrlArtifacts" label="File URL Artifacts" />
          </div>
          <Button variant="ghost" size="sm" onClick={addFileUrl} disabled={!canEdit}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {fileUrl.map((row, i) => (
          <div key={i} className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Artifact {i + 1}</span>
              <Button variant="ghost" size="sm" onClick={() => removeFileUrl(i)} disabled={!canEdit} className="h-7 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.fileUrl.url" fallback="URL" /> <span className="text-destructive">*</span></Label>
                  <FieldInfo path="distribution.fileUrl.url" label="URL" />
                </div>
                <Input required value={row.url} onChange={(e) => updateFileUrl(i, 'url', e.target.value)} placeholder="https://artifacts.example.com/..." className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.fileUrl.artifactId" fallback="Artifact ID" /></Label>
                  <FieldInfo path="distribution.fileUrl.artifactId" label="Artifact ID" />
                </div>
                <Input value={row.artifactId} onChange={(e) => updateFileUrl(i, 'artifactId', e.target.value)} placeholder="my-artifact" className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.fileUrl.classifier" fallback="Classifier" /></Label>
                  <FieldInfo path="distribution.fileUrl.classifier" label="Classifier" />
                </div>
                <Input value={row.classifier} onChange={(e) => updateFileUrl(i, 'classifier', e.target.value)} placeholder="sources" className="font-mono text-xs" />
              </div>
            </div>
          </div>
        ))}

        {fileUrl.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No file URL artifacts.</div>
        )}
      </div>

      <Separator />

      {/* ── Docker Images ──────────────────────────────────────────────────── */}
      {/* data-testid: e2e anchor — the heading text comes from FieldLabelText
          (field-config can relabel it) and several sibling sections render
          identical 'Add' buttons, so structural/text selectors are brittle. */}
      <div className="space-y-3" data-testid="docker-images-section">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold"><FieldLabelText path="distribution.dockerImages" fallback="Docker Images" /></h3>
            <FieldInfo path="distribution.dockerImages" label="Docker Images" />
          </div>
          <Button variant="ghost" size="sm" onClick={addDocker} disabled={!canEdit}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {docker.map((row, i) => (
          <div key={i} className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Image {i + 1}</span>
              <Button variant="ghost" size="sm" onClick={() => removeDocker(i)} disabled={!canEdit} className="h-7 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.docker.imageName" fallback="Image Name" /> <span className="text-destructive">*</span></Label>
                  <FieldInfo path="distribution.docker.imageName" label="Image Name" />
                </div>
                <Input required value={row.imageName} onChange={(e) => updateDocker(i, 'imageName', e.target.value)} placeholder="my-org/my-image" className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.docker.flavor" fallback="Flavor" /></Label>
                  <FieldInfo path="distribution.docker.flavor" label="Flavor" />
                </div>
                <Input value={row.flavor} onChange={(e) => updateDocker(i, 'flavor', e.target.value)} placeholder="alpine" className="font-mono text-xs" />
              </div>
            </div>
          </div>
        ))}

        {docker.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No Docker images.</div>
        )}
      </div>

      <Separator />

      {/* ── Packages ──────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold"><FieldLabelText path="distribution.packages" fallback="Packages" /></h3>
            <FieldInfo path="distribution.packages" label="Packages" />
          </div>
          <Button variant="ghost" size="sm" onClick={addPackage} disabled={!canEdit}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {packages.map((row, i) => (
          <div key={i} className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Package {i + 1}</span>
              <Button variant="ghost" size="sm" onClick={() => removePackage(i)} disabled={!canEdit} className="h-7 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.package.type" fallback="Package Type" /> <span className="text-destructive">*</span></Label>
                  <FieldInfo path="distribution.package.type" label="Package Type" />
                </div>
                <Input required value={row.packageType} onChange={(e) => updatePackage(i, 'packageType', e.target.value)} placeholder="rpm" className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.package.name" fallback="Package Name" /> <span className="text-destructive">*</span></Label>
                  <FieldInfo path="distribution.package.name" label="Package Name" />
                </div>
                <Input required value={row.packageName} onChange={(e) => updatePackage(i, 'packageName', e.target.value)} placeholder="my-package" className="font-mono text-xs" />
              </div>
            </div>
          </div>
        ))}

        {packages.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No packages.</div>
        )}
      </div>

      <Separator />

      {/* ── Security Groups ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold"><FieldLabelText path="distribution.securityGroups" fallback="Security Groups" /></h3>
            <FieldInfo path="distribution.securityGroups" label="Security Groups" />
          </div>
          <Button variant="ghost" size="sm" onClick={addSecurityGroup} disabled={!canEdit}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {securityGroups.map((row, i) => (
          <div key={i} className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Group {i + 1}</span>
              <Button variant="ghost" size="sm" onClick={() => removeSecurityGroup(i)} disabled={!canEdit} className="h-7 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.securityGroup.type" fallback="Group Type" /></Label>
                  <FieldInfo path="distribution.securityGroup.type" label="Group Type" />
                </div>
                <Input value={row.groupType} onChange={(e) => updateSecurityGroup(i, 'groupType', e.target.value)} placeholder="read" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.securityGroup.name" fallback="Group Name" /> <span className="text-destructive">*</span></Label>
                  <FieldInfo path="distribution.securityGroup.name" label="Group Name" />
                </div>
                <Input required value={row.groupName} onChange={(e) => updateSecurityGroup(i, 'groupName', e.target.value)} placeholder="my-security-group" />
              </div>
            </div>
          </div>
        ))}

        {securityGroups.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No security groups.</div>
        )}
      </div>

      <div className="flex justify-end">
        {/* title on the wrapping span: a disabled Button has pointer-events-none, so a
            title on it would never show on hover. */}
        <span className="inline-flex" title={!canEdit ? CANNOT_EDIT_TITLE : undefined}>
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending || !canEdit}>
            <Save className="h-4 w-4" />
            {updateMutation.isPending ? 'Saving...' : 'Save Distribution'}
          </Button>
        </span>
      </div>
    </div>
  )
}
