import { Plus, Trash2 } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Button } from '../ui/button'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import { Separator } from '../ui/separator'
import type { DistributionSection } from './useDistributionSection'

interface DistributionTabProps {
  section: DistributionSection
  canEdit: boolean
}

/** Distribution tab — presentational. State + slice live in `useDistributionSection`. */
export function DistributionTab({ section, canEdit }: DistributionTabProps) {
  const {
    state,
    setExplicit,
    setExternal,
    addMaven, updateMaven, removeMaven,
    addFileUrl, updateFileUrl, removeFileUrl,
    addDocker, updateDocker, removeDocker,
    addPackage, updatePackage, removePackage,
    addSecurityGroup, updateSecurityGroup, removeSecurityGroup,
  } = section
  const { maven, fileUrl, docker, packages, securityGroups, explicit, external } = state

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
    </div>
  )
}
