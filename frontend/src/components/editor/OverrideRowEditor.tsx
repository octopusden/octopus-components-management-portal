import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '../ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'
import {
  useCreateFieldOverride,
  useUpdateFieldOverride,
  useFieldOverrides,
} from '../../hooks/useComponent'
import { useToast } from '../../hooks/use-toast'
import { isValidVersionRange, isClosedVersionRange, classifyRangeConflict } from '../../lib/versionRange'
import type { FieldOverride, MarkerChildrenPayload, VcsEntryRequest, MavenArtifactRequest, FileUrlArtifactRequest, DockerImageRequest, PackageRequest } from '../../lib/types'

// ---------------------------------------------------------------------------
// Attribute catalogue
// ---------------------------------------------------------------------------

type AttrType = 'string' | 'boolean'

interface ScalarAttr {
  path: string
  label: string
  type: AttrType
}

const SCALAR_ATTRS: ScalarAttr[] = [
  // Build
  { path: 'build.buildSystem', label: 'Build System', type: 'string' },
  { path: 'build.javaVersion', label: 'Java Version', type: 'string' },
  { path: 'build.mavenVersion', label: 'Maven Version', type: 'string' },
  { path: 'build.gradleVersion', label: 'Gradle Version', type: 'string' },
  { path: 'build.buildFilePath', label: 'Build File Path', type: 'string' },
  { path: 'build.deprecated', label: 'Deprecated', type: 'boolean' },
  { path: 'build.requiredProject', label: 'Required Project', type: 'boolean' },
  { path: 'build.projectVersion', label: 'Project Version', type: 'string' },
  { path: 'build.systemProperties', label: 'System Properties', type: 'string' },
  { path: 'build.buildTasks', label: 'Build Tasks', type: 'string' },
  // Escrow
  { path: 'escrow.providedDependencies', label: 'Provided Dependencies', type: 'string' },
  { path: 'escrow.reusable', label: 'Reusable', type: 'boolean' },
  { path: 'escrow.generation', label: 'Generation', type: 'string' },
  { path: 'escrow.diskSpace', label: 'Disk Space', type: 'string' },
  { path: 'escrow.additionalSources', label: 'Additional Sources', type: 'string' },
  { path: 'escrow.gradleIncludeConfigurations', label: 'Gradle Include Configurations', type: 'string' },
  { path: 'escrow.gradleExcludeConfigurations', label: 'Gradle Exclude Configurations', type: 'string' },
  { path: 'escrow.gradleIncludeTestConfigurations', label: 'Gradle Include Test Configurations', type: 'boolean' },
  { path: 'escrow.buildTask', label: 'Build Task', type: 'string' },
  // Jira
  { path: 'jira.projectKey', label: 'Project Key', type: 'string' },
  { path: 'jira.technical', label: 'Technical', type: 'boolean' },
  { path: 'jira.majorVersionFormat', label: 'Major Version Format', type: 'string' },
  { path: 'jira.releaseVersionFormat', label: 'Release Version Format', type: 'string' },
  { path: 'jira.buildVersionFormat', label: 'Build Version Format', type: 'string' },
  { path: 'jira.lineVersionFormat', label: 'Line Version Format', type: 'string' },
  { path: 'jira.versionPrefix', label: 'Version Prefix', type: 'string' },
  { path: 'jira.versionFormat', label: 'Version Format', type: 'string' },
  { path: 'jira.hotfixVersionFormat', label: 'Hotfix Version Format', type: 'string' },
]

const SCALAR_BY_PATH = new Map(SCALAR_ATTRS.map((a) => [a.path, a]))

type MarkerAttr = {
  path: string
  label: string
  childKey: keyof MarkerChildrenPayload
}

const MARKER_ATTRS: MarkerAttr[] = [
  { path: 'vcs.settings', label: 'VCS Settings', childKey: 'vcsEntries' },
  { path: 'distribution.maven', label: 'Distribution: Maven', childKey: 'mavenArtifacts' },
  { path: 'distribution.fileUrl', label: 'Distribution: File URL', childKey: 'fileUrlArtifacts' },
  { path: 'distribution.docker', label: 'Distribution: Docker', childKey: 'dockerImages' },
  { path: 'distribution.packages', label: 'Distribution: Packages', childKey: 'packages' },
  { path: 'build.requiredTools', label: 'Build: Required Tools', childKey: 'requiredTools' },
]

const MARKER_BY_PATH = new Map(MARKER_ATTRS.map((a) => [a.path, a]))

// Tracks `override` objects that already triggered the drift warning so a
// re-render of an unchanged dialog doesn't re-warn. WeakSet drops entries
// once the override goes out of scope; no memory leak.
const unknownAttrWarned = new WeakSet<object>()

// ---------------------------------------------------------------------------
// Child list state types
// ---------------------------------------------------------------------------

interface VcsState { name: string; vcsPath: string; branch: string; tag: string; hotfixBranch: string; repositoryType: string }
interface MavenState { groupPattern: string; artifactPattern: string; extension: string; classifier: string }
interface FileUrlState { url: string; artifactId: string; classifier: string }
interface DockerState { imageName: string; flavor: string }
interface PackageState { packageType: string; packageName: string }

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OverrideRowEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  componentId: string
  mode: 'create' | 'edit'
  /** Required in edit mode; undefined in create mode */
  override?: FieldOverride
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OverrideRowEditor({ open, onOpenChange, componentId, mode, override }: OverrideRowEditorProps) {
  const createMutation = useCreateFieldOverride(componentId)
  const updateMutation = useUpdateFieldOverride(componentId)
  const { data: allOverrides = [] } = useFieldOverrides(componentId)
  const { toast } = useToast()

  // Determine initial type and attribute from existing override in edit mode
  const initialType: 'scalar' | 'marker' = (() => {
    if (mode === 'edit' && override) {
      if (MARKER_BY_PATH.has(override.overriddenAttribute)) return 'marker'
      return 'scalar'
    }
    return 'scalar'
  })()

  // CRS drift surfaces: when an existing override row's attribute is
  // present in NEITHER catalogue (because CRS added a new scalar path the
  // portal build doesn't know about yet, or because CRS renamed one), the
  // submit guard at handleSubmit toasts "Unknown ... attribute" — but only
  // when the user actually clicks Update. Log a console.warn at edit-open
  // so devs catch the drift in browser devtools without needing a save
  // attempt. WeakSet caps to one warn per override object to avoid spamming
  // on every render.
  useEffect(() => {
    if (mode !== 'edit' || !override) return
    if (SCALAR_BY_PATH.has(override.overriddenAttribute)) return
    if (MARKER_BY_PATH.has(override.overriddenAttribute)) return
    if (unknownAttrWarned.has(override)) return
    unknownAttrWarned.add(override)
    console.warn(
      `[OverrideRowEditor] Stored override "${override.overriddenAttribute}" is not in either ` +
        `SCALAR_ATTRS or MARKER_ATTRS — likely CRS contract drift. Update the catalogue in ` +
        `OverrideRowEditor.tsx or check the CRS-side SCALAR_ATTRIBUTE_PATHS registry.`,
    )
  }, [mode, override])

  const initialAttribute = mode === 'edit' && override ? override.overriddenAttribute : ''
  const initialVersionRange = mode === 'edit' && override ? override.versionRange : ''

  // ---------------------------------------------------------------------------
  // Controlled state — reset when dialog opens
  // ---------------------------------------------------------------------------

  const [overrideType, setOverrideType] = useState<'scalar' | 'marker'>(initialType)
  const [attribute, setAttribute] = useState(initialAttribute)
  const [versionRange, setVersionRange] = useState(initialVersionRange)

  // Scalar value state
  const [scalarStringValue, setScalarStringValue] = useState<string>(() => {
    if (mode === 'edit' && override && override.value !== null && override.value !== undefined) {
      return typeof override.value === 'string' ? override.value : String(override.value)
    }
    return ''
  })
  const [scalarBoolValue, setScalarBoolValue] = useState<boolean>(() => {
    if (mode === 'edit' && override && typeof override.value === 'boolean') return override.value
    return false
  })

  // Marker child list states
  const [vcsEntries, setVcsEntries] = useState<VcsState[]>(() => {
    if (mode === 'edit' && override?.markerChildren?.vcsEntries) {
      return override.markerChildren.vcsEntries.map((e) => ({
        name: e.name ?? '',
        vcsPath: e.vcsPath ?? '',
        branch: e.branch ?? '',
        tag: e.tag ?? '',
        hotfixBranch: e.hotfixBranch ?? '',
        repositoryType: e.repositoryType ?? '',
      }))
    }
    return []
  })
  const [mavenArtifacts, setMavenArtifacts] = useState<MavenState[]>(() => {
    if (mode === 'edit' && override?.markerChildren?.mavenArtifacts) {
      return override.markerChildren.mavenArtifacts.map((a) => ({
        groupPattern: a.groupPattern,
        artifactPattern: a.artifactPattern,
        extension: a.extension ?? '',
        classifier: a.classifier ?? '',
      }))
    }
    return []
  })
  const [fileUrlArtifacts, setFileUrlArtifacts] = useState<FileUrlState[]>(() => {
    if (mode === 'edit' && override?.markerChildren?.fileUrlArtifacts) {
      return override.markerChildren.fileUrlArtifacts.map((a) => ({
        url: a.url,
        artifactId: a.artifactId ?? '',
        classifier: a.classifier ?? '',
      }))
    }
    return []
  })
  const [dockerImages, setDockerImages] = useState<DockerState[]>(() => {
    if (mode === 'edit' && override?.markerChildren?.dockerImages) {
      return override.markerChildren.dockerImages.map((d) => ({
        imageName: d.imageName,
        flavor: d.flavor ?? '',
      }))
    }
    return []
  })
  const [packages, setPackages] = useState<PackageState[]>(() => {
    if (mode === 'edit' && override?.markerChildren?.packages) {
      return override.markerChildren.packages.map((p) => ({
        packageType: p.packageType,
        packageName: p.packageName,
      }))
    }
    return []
  })
  const [requiredToolsInput, setRequiredToolsInput] = useState<string>(() => {
    if (mode === 'edit' && override?.markerChildren?.requiredTools) {
      return (override.markerChildren.requiredTools as string[]).join(', ')
    }
    return ''
  })

  // ---------------------------------------------------------------------------
  // Reset state when dialog opens/closes or override changes
  // ---------------------------------------------------------------------------

  function resetState() {
    const t: 'scalar' | 'marker' = (() => {
      if (mode === 'edit' && override) {
        if (MARKER_BY_PATH.has(override.overriddenAttribute)) return 'marker'
        return 'scalar'
      }
      return 'scalar'
    })()
    setOverrideType(t)
    setAttribute(mode === 'edit' && override ? override.overriddenAttribute : '')
    setVersionRange(mode === 'edit' && override ? override.versionRange : '')

    if (mode === 'edit' && override) {
      setScalarStringValue(override.value !== null && override.value !== undefined
        ? (typeof override.value === 'string' ? override.value : String(override.value))
        : '')
      setScalarBoolValue(typeof override.value === 'boolean' ? override.value : false)

      const mc = override.markerChildren
      setVcsEntries((mc?.vcsEntries ?? []).map((e) => ({ name: e.name ?? '', vcsPath: e.vcsPath ?? '', branch: e.branch ?? '', tag: e.tag ?? '', hotfixBranch: e.hotfixBranch ?? '', repositoryType: e.repositoryType ?? '' })))
      setMavenArtifacts((mc?.mavenArtifacts ?? []).map((a) => ({ groupPattern: a.groupPattern, artifactPattern: a.artifactPattern, extension: a.extension ?? '', classifier: a.classifier ?? '' })))
      setFileUrlArtifacts((mc?.fileUrlArtifacts ?? []).map((a) => ({ url: a.url, artifactId: a.artifactId ?? '', classifier: a.classifier ?? '' })))
      setDockerImages((mc?.dockerImages ?? []).map((d) => ({ imageName: d.imageName, flavor: d.flavor ?? '' })))
      setPackages((mc?.packages ?? []).map((p) => ({ packageType: p.packageType, packageName: p.packageName })))
      setRequiredToolsInput((mc?.requiredTools as string[] | null | undefined)?.join(', ') ?? '')
    } else {
      setScalarStringValue('')
      setScalarBoolValue(false)
      setVcsEntries([])
      setMavenArtifacts([])
      setFileUrlArtifacts([])
      setDockerImages([])
      setPackages([])
      setRequiredToolsInput('')
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) resetState()
    onOpenChange(nextOpen)
  }

  // Re-run resetState whenever the dialog opens OR the controlling props
  // (override / mode) change while it stays open. Without this, a parent
  // that swaps `override` without toggling `open` (e.g. a future refactor
  // that keeps the editor mounted) would render stale form state.
  useEffect(() => {
    if (open) resetState()
    // resetState is recreated each render; exhaustive-deps would force a
    // useCallback that complicates the closure. The dependencies below are
    // the ones that matter for re-running the prefill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, override, mode])

  // ---------------------------------------------------------------------------
  // Attribute type lookup
  // ---------------------------------------------------------------------------

  const selectedScalarAttr = SCALAR_BY_PATH.get(attribute)
  const selectedMarkerAttr = MARKER_BY_PATH.get(attribute)
  const isBoolean = selectedScalarAttr?.type === 'boolean'

  // ---------------------------------------------------------------------------
  // VCS helpers
  // ---------------------------------------------------------------------------
  function addVcs() { setVcsEntries((p) => [...p, { name: '', vcsPath: '', branch: '', tag: '', hotfixBranch: '', repositoryType: '' }]) }
  function updateVcs(i: number, field: keyof VcsState, v: string) { setVcsEntries((p) => p.map((r, idx) => idx === i ? { ...r, [field]: v } : r)) }
  function removeVcs(i: number) { setVcsEntries((p) => p.filter((_, idx) => idx !== i)) }

  // Maven helpers
  function addMaven() { setMavenArtifacts((p) => [...p, { groupPattern: '', artifactPattern: '', extension: '', classifier: '' }]) }
  function updateMaven(i: number, field: keyof MavenState, v: string) { setMavenArtifacts((p) => p.map((r, idx) => idx === i ? { ...r, [field]: v } : r)) }
  function removeMaven(i: number) { setMavenArtifacts((p) => p.filter((_, idx) => idx !== i)) }

  // FileUrl helpers
  function addFileUrl() { setFileUrlArtifacts((p) => [...p, { url: '', artifactId: '', classifier: '' }]) }
  function updateFileUrl(i: number, field: keyof FileUrlState, v: string) { setFileUrlArtifacts((p) => p.map((r, idx) => idx === i ? { ...r, [field]: v } : r)) }
  function removeFileUrl(i: number) { setFileUrlArtifacts((p) => p.filter((_, idx) => idx !== i)) }

  // Docker helpers
  function addDocker() { setDockerImages((p) => [...p, { imageName: '', flavor: '' }]) }
  function updateDocker(i: number, field: keyof DockerState, v: string) { setDockerImages((p) => p.map((r, idx) => idx === i ? { ...r, [field]: v } : r)) }
  function removeDocker(i: number) { setDockerImages((p) => p.filter((_, idx) => idx !== i)) }

  // Packages helpers
  function addPackage() { setPackages((p) => [...p, { packageType: '', packageName: '' }]) }
  function updatePackage(i: number, field: keyof PackageState, v: string) { setPackages((p) => p.map((r, idx) => idx === i ? { ...r, [field]: v } : r)) }
  function removePackage(i: number) { setPackages((p) => p.filter((_, idx) => idx !== i)) }

  // ---------------------------------------------------------------------------
  // Wire body builders
  // ---------------------------------------------------------------------------

  function buildScalarValue(): unknown {
    if (!selectedScalarAttr) return undefined
    if (selectedScalarAttr.type === 'boolean') return scalarBoolValue
    return scalarStringValue
  }

  function buildMarkerChildren(): MarkerChildrenPayload | null {
    if (!selectedMarkerAttr) return null
    const key = selectedMarkerAttr.childKey
    // Each marker branch trims string fields and drops rows whose required
    // fields are still blank — the modal Save is a button click (not a form
    // submit), so HTML `required` doesn't gate the wire body. Without this
    // a newly-added empty row reaches the server as `"   "` and 400s. Same
    // pattern that VcsTab + DistributionTab already use for the BASE-row
    // paths — required-field rules below mirror CRS v4 wire contract.
    if (key === 'vcsEntries') {
      const entries: VcsEntryRequest[] = vcsEntries
        .map((e) => ({
          name: (e.name || '').trim(),
          vcsPath: e.vcsPath.trim(),
          branch: (e.branch || '').trim(),
          tag: (e.tag || '').trim(),
          hotfixBranch: (e.hotfixBranch || '').trim(),
          repositoryType: (e.repositoryType || '').trim(),
        }))
        .filter((e) => e.vcsPath !== '')
        .map((e) => ({
          name: e.name || null,
          vcsPath: e.vcsPath,
          branch: e.branch || null,
          tag: e.tag || null,
          hotfixBranch: e.hotfixBranch || null,
          repositoryType: e.repositoryType || null,
        }))
      return { vcsEntries: entries }
    }
    if (key === 'mavenArtifacts') {
      const arts: MavenArtifactRequest[] = mavenArtifacts
        .map((a) => ({
          groupPattern: a.groupPattern.trim(),
          artifactPattern: a.artifactPattern.trim(),
          extension: (a.extension || '').trim(),
          classifier: (a.classifier || '').trim(),
        }))
        .filter((a) => a.groupPattern !== '' && a.artifactPattern !== '')
        .map((a) => ({
          groupPattern: a.groupPattern,
          artifactPattern: a.artifactPattern,
          extension: a.extension || null,
          classifier: a.classifier || null,
        }))
      return { mavenArtifacts: arts }
    }
    if (key === 'fileUrlArtifacts') {
      const arts: FileUrlArtifactRequest[] = fileUrlArtifacts
        .map((a) => ({
          url: a.url.trim(),
          artifactId: (a.artifactId || '').trim(),
          classifier: (a.classifier || '').trim(),
        }))
        .filter((a) => a.url !== '')
        .map((a) => ({
          url: a.url,
          artifactId: a.artifactId || null,
          classifier: a.classifier || null,
        }))
      return { fileUrlArtifacts: arts }
    }
    if (key === 'dockerImages') {
      const imgs: DockerImageRequest[] = dockerImages
        .map((d) => ({
          imageName: d.imageName.trim(),
          flavor: (d.flavor || '').trim(),
        }))
        .filter((d) => d.imageName !== '')
        .map((d) => ({
          imageName: d.imageName,
          flavor: d.flavor || null,
        }))
      return { dockerImages: imgs }
    }
    if (key === 'packages') {
      const pkgs: PackageRequest[] = packages
        .map((p) => ({
          packageType: p.packageType.trim(),
          packageName: p.packageName.trim(),
        }))
        .filter((p) => p.packageType !== '' && p.packageName !== '')
      return { packages: pkgs }
    }
    if (key === 'requiredTools') {
      const tools = [...new Set(requiredToolsInput.split(',').map((t) => t.trim()).filter(Boolean))]
      return { requiredTools: tools }
    }
    return null
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!attribute) {
      toast({ title: 'Please select an attribute', variant: 'destructive' })
      return
    }
    // Guard against a stored attribute that no longer maps to any catalogue
    // entry (e.g. server adds a new path the portal build doesn't know about).
    // Without this, buildScalarValue / buildMarkerChildren return undefined /
    // null and the wire body would be silently malformed.
    if (overrideType === 'scalar' && !selectedScalarAttr) {
      toast({ title: 'Unknown scalar attribute', description: attribute, variant: 'destructive' })
      return
    }
    if (overrideType === 'marker' && !selectedMarkerAttr) {
      toast({ title: 'Unknown marker attribute', description: attribute, variant: 'destructive' })
      return
    }
    // D5: field-override ranges must be closed (or historical-left-unbounded);
    // universal and open-upward forms belong to BASE. Reject client-side.
    if (!isClosedVersionRange(versionRange)) {
      toast({
        title: isValidVersionRange(versionRange)
          ? 'Open-upward range — edit the BASE field instead'
          : 'Invalid version range',
        variant: 'destructive',
      })
      return
    }
    // R3 client-side preview: prevent submission of a range that overlaps or
    // duplicates a sibling override on the same attribute. CRS-side P-Overlap
    // will catch the unknown-parse cases this skips.
    if (conflictMessage !== null) {
      toast({
        title: conflictMessage,
        variant: 'destructive',
      })
      return
    }
    try {
      if (mode === 'edit' && override) {
        if (overrideType === 'scalar') {
          await updateMutation.mutateAsync({
            overrideId: override.id,
            versionRange,
            value: buildScalarValue(),
            markerChildren: null,
          })
        } else {
          await updateMutation.mutateAsync({
            overrideId: override.id,
            versionRange,
            value: null,
            markerChildren: buildMarkerChildren(),
          })
        }
        toast({ title: 'Override updated' })
      } else {
        if (overrideType === 'scalar') {
          await createMutation.mutateAsync({
            overriddenAttribute: attribute,
            versionRange,
            value: buildScalarValue(),
            markerChildren: null,
          })
        } else {
          await createMutation.mutateAsync({
            overriddenAttribute: attribute,
            versionRange,
            value: null,
            markerChildren: buildMarkerChildren(),
          })
        }
        toast({ title: 'Override created' })
      }
      onOpenChange(false)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      })
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const versionRangeInvalid = !isClosedVersionRange(versionRange)
  // Walk existing overrides on the same attribute for client-side conflict
  // preview. Partial overlap, strict containment, and semantic-equal duplicates
  // all block the write (overrides must be disjoint); equal gets distinct copy.
  // Composites/qualifier bounds short-circuit to "unknown" inside
  // classifyRangeConflict and are skipped here — CRS-side P-Overlap is the
  // backstop. CRS #316 enforces the same disjoint-only rule server-side, so
  // this preview and the server agree.
  const overlapConflict: { range: string; kind: 'partial' | 'contains' | 'equal' } | null = (() => {
    if (versionRangeInvalid) return null
    for (const o of allOverrides) {
      if (o.overriddenAttribute !== attribute) continue
      if (mode === 'edit' && override && o.id === override.id) continue
      const kind = classifyRangeConflict(versionRange, o.versionRange)
      if (kind === 'partial' || kind === 'contains' || kind === 'equal') {
        return { range: o.versionRange, kind }
      }
    }
    return null
  })()
  const conflictMessage = overlapConflict === null
    ? null
    : overlapConflict.kind === 'equal'
      ? `Semantically equal to existing override ${overlapConflict.range}`
      : `Overlaps with existing override ${overlapConflict.range}`
  const versionRangeBlocks = versionRangeInvalid || overlapConflict !== null

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit Override' : 'Add Override'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Type picker (create only). Tabs primitive gives Radix
                 keyboard nav (Left/Right between options) + theme-correct
                 focus ring + dark-mode tokens. Selecting a new mode resets
                 `attribute` because scalar and marker catalogues are
                 disjoint — a stale value from the other catalogue would
                 trip the "Unknown attribute" guard at submit. */}
          {mode === 'create' && (
            <div className="space-y-1.5">
              <Label>Override Type</Label>
              <Tabs
                value={overrideType}
                onValueChange={(v) => { setOverrideType(v as 'scalar' | 'marker'); setAttribute('') }}
              >
                <TabsList>
                  <TabsTrigger value="scalar">Scalar</TabsTrigger>
                  <TabsTrigger value="marker">Marker</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}

          {/* ── Attribute selector ── */}
          <div className="space-y-1.5">
            <Label htmlFor="attribute">Attribute</Label>
            {mode === 'edit' ? (
              <p className="text-sm font-mono text-muted-foreground px-3 py-2 rounded-md border bg-muted">
                {attribute}
              </p>
            ) : overrideType === 'scalar' ? (
              <Select value={attribute} onValueChange={setAttribute}>
                <SelectTrigger id="attribute">
                  <SelectValue placeholder="Select attribute..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Build</SelectLabel>
                    {SCALAR_ATTRS.filter((a) => a.path.startsWith('build.')).map((a) => (
                      <SelectItem key={a.path} value={a.path}>{a.label}</SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Escrow</SelectLabel>
                    {SCALAR_ATTRS.filter((a) => a.path.startsWith('escrow.')).map((a) => (
                      <SelectItem key={a.path} value={a.path}>{a.label}</SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Jira</SelectLabel>
                    {SCALAR_ATTRS.filter((a) => a.path.startsWith('jira.')).map((a) => (
                      <SelectItem key={a.path} value={a.path}>{a.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <Select value={attribute} onValueChange={setAttribute}>
                <SelectTrigger id="attribute">
                  <SelectValue placeholder="Select marker..." />
                </SelectTrigger>
                <SelectContent>
                  {MARKER_ATTRS.map((a) => (
                    <SelectItem key={a.path} value={a.path}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* ── Version Range ── */}
          <div className="space-y-1.5">
            <Label htmlFor="versionRange">Version Range</Label>
            <Input
              id="versionRange"
              placeholder="[1.0,2.0)"
              value={versionRange}
              onChange={(e) => setVersionRange(e.target.value)}
              className="font-mono"
              required
              aria-invalid={
                (versionRange.trim() !== '' && !isClosedVersionRange(versionRange)) ||
                overlapConflict !== null
              }
            />
            {versionRange.trim() !== '' && !isClosedVersionRange(versionRange) && (
              <p className="text-xs text-destructive">
                {isValidVersionRange(versionRange)
                  ? 'Open-upward range — edit the BASE field instead'
                  : 'Invalid version range syntax'}
              </p>
            )}
            {!versionRangeInvalid && conflictMessage !== null && (
              <p className="text-xs text-destructive">
                {conflictMessage}
              </p>
            )}
          </div>

          {/* ── Value / Marker child editor ── */}
          {overrideType === 'scalar' && attribute && (
            <div className="space-y-1.5">
              <Label>Value</Label>
              {isBoolean ? (
                <div className="flex items-center gap-3">
                  <Switch
                    id="scalar-bool"
                    checked={scalarBoolValue}
                    onCheckedChange={setScalarBoolValue}
                  />
                  <Label htmlFor="scalar-bool" className="cursor-pointer text-sm">
                    {scalarBoolValue ? 'true' : 'false'}
                  </Label>
                </div>
              ) : (
                <Input
                  id="scalar-string"
                  value={scalarStringValue}
                  onChange={(e) => setScalarStringValue(e.target.value)}
                  placeholder={`Value for ${selectedScalarAttr?.label ?? attribute}`}
                />
              )}
            </div>
          )}

          {overrideType === 'marker' && attribute && selectedMarkerAttr && (
            <div className="space-y-3">
              <Label>{selectedMarkerAttr.label} — entries</Label>

              {/* VCS Settings */}
              {selectedMarkerAttr.childKey === 'vcsEntries' && (
                <div className="space-y-2">
                  {vcsEntries.map((entry, i) => (
                    <div key={i} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Entry {i + 1}</span>
                        <Button variant="ghost" size="sm" type="button" onClick={() => removeVcs(i)} className="h-7 text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Name</Label>
                          <Input value={entry.name} onChange={(e) => updateVcs(i, 'name', e.target.value)} placeholder="Entry name" className="text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">VCS Path <span className="text-destructive">*</span></Label>
                          <Input required value={entry.vcsPath} onChange={(e) => updateVcs(i, 'vcsPath', e.target.value)} placeholder="ssh://git@..." className="font-mono text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Repository Type</Label>
                          {/* Read-only: repository type is not user-editable (follows the VCS host). */}
                          <Input value={entry.repositoryType} disabled readOnly placeholder="GIT" className="bg-muted text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Production branch</Label>
                          <Input value={entry.branch} onChange={(e) => updateVcs(i, 'branch', e.target.value)} placeholder="Branch pattern" className="font-mono text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Tag</Label>
                          <Input value={entry.tag} onChange={(e) => updateVcs(i, 'tag', e.target.value)} placeholder="Tag pattern" className="font-mono text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Hotfix Branch</Label>
                          <Input value={entry.hotfixBranch} onChange={(e) => updateVcs(i, 'hotfixBranch', e.target.value)} placeholder="Hotfix branch pattern" className="font-mono text-xs" />
                        </div>
                      </div>
                    </div>
                  ))}
                  {vcsEntries.length === 0 && (
                    <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">No VCS entries.</div>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={addVcs}>
                    <Plus className="h-4 w-4" />
                    Add Entry
                  </Button>
                </div>
              )}

              {/* Maven Artifacts */}
              {selectedMarkerAttr.childKey === 'mavenArtifacts' && (
                <div className="space-y-2">
                  {mavenArtifacts.map((row, i) => (
                    <div key={i} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Artifact {i + 1}</span>
                        <Button variant="ghost" size="sm" type="button" onClick={() => removeMaven(i)} className="h-7 text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Group Pattern <span className="text-destructive">*</span></Label>
                          <Input required value={row.groupPattern} onChange={(e) => updateMaven(i, 'groupPattern', e.target.value)} placeholder="org.example.alpha" className="font-mono text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Artifact Pattern <span className="text-destructive">*</span></Label>
                          <Input required value={row.artifactPattern} onChange={(e) => updateMaven(i, 'artifactPattern', e.target.value)} placeholder="my-component-*" className="font-mono text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Extension</Label>
                          <Input value={row.extension} onChange={(e) => updateMaven(i, 'extension', e.target.value)} placeholder="jar" className="font-mono text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Classifier</Label>
                          <Input value={row.classifier} onChange={(e) => updateMaven(i, 'classifier', e.target.value)} placeholder="sources" className="font-mono text-xs" />
                        </div>
                      </div>
                    </div>
                  ))}
                  {mavenArtifacts.length === 0 && (
                    <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">No Maven artifacts.</div>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={addMaven}>
                    <Plus className="h-4 w-4" />
                    Add Artifact
                  </Button>
                </div>
              )}

              {/* File URL Artifacts */}
              {selectedMarkerAttr.childKey === 'fileUrlArtifacts' && (
                <div className="space-y-2">
                  {fileUrlArtifacts.map((row, i) => (
                    <div key={i} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Artifact {i + 1}</span>
                        <Button variant="ghost" size="sm" type="button" onClick={() => removeFileUrl(i)} className="h-7 text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">URL <span className="text-destructive">*</span></Label>
                          <Input required value={row.url} onChange={(e) => updateFileUrl(i, 'url', e.target.value)} placeholder="https://artifacts.example.com/..." className="font-mono text-xs" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Artifact ID</Label>
                            <Input value={row.artifactId} onChange={(e) => updateFileUrl(i, 'artifactId', e.target.value)} placeholder="my-artifact" className="font-mono text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Classifier</Label>
                            <Input value={row.classifier} onChange={(e) => updateFileUrl(i, 'classifier', e.target.value)} placeholder="sources" className="font-mono text-xs" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {fileUrlArtifacts.length === 0 && (
                    <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">No file URL artifacts.</div>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={addFileUrl}>
                    <Plus className="h-4 w-4" />
                    Add Artifact
                  </Button>
                </div>
              )}

              {/* Docker Images */}
              {selectedMarkerAttr.childKey === 'dockerImages' && (
                <div className="space-y-2">
                  {dockerImages.map((row, i) => (
                    <div key={i} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Image {i + 1}</span>
                        <Button variant="ghost" size="sm" type="button" onClick={() => removeDocker(i)} className="h-7 text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Image Name <span className="text-destructive">*</span></Label>
                          <Input required value={row.imageName} onChange={(e) => updateDocker(i, 'imageName', e.target.value)} placeholder="my-org/my-image" className="font-mono text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Flavor</Label>
                          <Input value={row.flavor} onChange={(e) => updateDocker(i, 'flavor', e.target.value)} placeholder="alpine" className="font-mono text-xs" />
                        </div>
                      </div>
                    </div>
                  ))}
                  {dockerImages.length === 0 && (
                    <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">No Docker images.</div>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={addDocker}>
                    <Plus className="h-4 w-4" />
                    Add Image
                  </Button>
                </div>
              )}

              {/* Packages */}
              {selectedMarkerAttr.childKey === 'packages' && (
                <div className="space-y-2">
                  {packages.map((row, i) => (
                    <div key={i} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Package {i + 1}</span>
                        <Button variant="ghost" size="sm" type="button" onClick={() => removePackage(i)} className="h-7 text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Package Type <span className="text-destructive">*</span></Label>
                          <Input required value={row.packageType} onChange={(e) => updatePackage(i, 'packageType', e.target.value)} placeholder="rpm" className="font-mono text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Package Name <span className="text-destructive">*</span></Label>
                          <Input required value={row.packageName} onChange={(e) => updatePackage(i, 'packageName', e.target.value)} placeholder="my-package" className="font-mono text-xs" />
                        </div>
                      </div>
                    </div>
                  ))}
                  {packages.length === 0 && (
                    <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">No packages.</div>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={addPackage}>
                    <Plus className="h-4 w-4" />
                    Add Package
                  </Button>
                </div>
              )}

              {/* Required Tools */}
              {selectedMarkerAttr.childKey === 'requiredTools' && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Required Tools (comma-separated)</Label>
                  <Input
                    value={requiredToolsInput}
                    onChange={(e) => setRequiredToolsInput(e.target.value)}
                    placeholder="tool-a, tool-b"
                  />
                  <p className="text-xs text-muted-foreground">Enter tool names separated by commas. Duplicates are removed automatically.</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={isPending || versionRangeBlocks}>
              {isPending ? 'Saving...' : mode === 'edit' ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
