import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { EnumSelect } from '../ui/EnumSelect'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldOverrideInline } from './FieldOverrideInline'
import { CANNOT_EDIT_TITLE } from './editPermission'
import { selectBaseRow, selectOverrideRows } from '../../lib/api/baseRow'
import type { ComponentDetail } from '../../lib/types'
import type { ComponentUpdateRequest } from '../../hooks/useComponent'
import type { UseMutationResult } from '@tanstack/react-query'
import { useOptimisticConflict } from '../../hooks/useOptimisticConflict'

interface BuildTabProps {
  component: ComponentDetail
  updateMutation: UseMutationResult<ComponentDetail, Error, ComponentUpdateRequest>
  toast: (opts: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void
  canEdit: boolean
}

export function BuildTab({ component, updateMutation, toast, canEdit }: BuildTabProps) {
  const handleConflict = useOptimisticConflict(component.id)
  const baseRow = selectBaseRow(component)
  const build = baseRow?.build

  const [buildSystem, setBuildSystem] = useState(build?.buildSystem ?? '')
  // ui-swift-sloth §5: buildSystem is required server-side. Track touched
  // state locally (BuildTab is plain `useState`, not RHF/Zod) so the inline
  // error doesn't blare on initial mount with a legacy empty value.
  const [buildSystemTouched, setBuildSystemTouched] = useState(false)
  // localError is the surface for the handleSave guard — covers the case
  // where the user clicks Save without ever interacting with the field.
  const [localError, setLocalError] = useState<string | null>(null)
  const [buildFilePath, setBuildFilePath] = useState(build?.buildFilePath ?? '')
  const [javaVersion, setJavaVersion] = useState(build?.javaVersion ?? '')
  const [mavenVersion, setMavenVersion] = useState(build?.mavenVersion ?? '')
  const [gradleVersion, setGradleVersion] = useState(build?.gradleVersion ?? '')
  const [projectVersion, setProjectVersion] = useState(build?.projectVersion ?? '')
  // buildTasks / systemProperties / deprecated / requiredProject / requiredTools
  // moved to the Escrow tab (escrow/automation knobs) — EscrowTab owns them now.

  useEffect(() => {
    const b = selectBaseRow(component)?.build
    setBuildSystem(b?.buildSystem ?? '')
    setBuildFilePath(b?.buildFilePath ?? '')
    setJavaVersion(b?.javaVersion ?? '')
    setMavenVersion(b?.mavenVersion ?? '')
    setGradleVersion(b?.gradleVersion ?? '')
    setProjectVersion(b?.projectVersion ?? '')
  }, [component])

  // Maven/Gradle Version visibility: the tool-version input renders only when
  // SOME version range builds with that tool — the BASE Build System (the live,
  // possibly unsaved selection) or any build.buildSystem override row. A range
  // override on the version field itself also keeps it visible, otherwise its
  // inline-override list would become unreachable. Hidden ≠ cleared: a hidden
  // field is omitted from the PATCH payload and stays untouched server-side.
  const overrideRows = selectOverrideRows(component)
  const effectiveBuildSystems = new Set(
    [
      buildSystem,
      ...overrideRows
        .filter((r) => r.overriddenAttribute === 'build.buildSystem')
        .map((r) => r.build?.buildSystem),
    ].filter((s): s is string => Boolean(s)),
  )
  const hasOverrideOn = (attr: string) => overrideRows.some((r) => r.overriddenAttribute === attr)
  const showMavenVersion = effectiveBuildSystems.has('MAVEN') || hasOverrideOn('build.mavenVersion')
  const showGradleVersion = effectiveBuildSystems.has('GRADLE') || hasOverrideOn('build.gradleVersion')

  async function handleSave() {
    if (!canEdit) return // Save is disabled when !canEdit; guard the handler too (backend also 403s).
    // ui-swift-sloth §5: hard guard — empty buildSystem would 400 once the
    // CRS strict contract lands. Surface the error inline (mirrors the
    // touched-on-blur path) and bail before calling the mutation.
    if (!buildSystem) {
      setLocalError('Build System is required')
      setBuildSystemTouched(true)
      return
    }
    setLocalError(null)
    try {
      await updateMutation.mutateAsync({
        version: component.version,
        clearGroup: false,
        baseConfiguration: {
          // Only the toolchain scalars this tab renders. The Escrow-tab-migrated
          // fields (buildTasks / systemProperties / deprecated / requiredProject
          // / requiredTools) are intentionally ABSENT: CRS PATCH applies
          // per-field (?.let), so omitted keys stay untouched.
          build: {
            buildSystem: buildSystem || null,
            buildFilePath: buildFilePath || null,
            javaVersion: javaVersion || null,
            // Hidden tool versions are omitted (not nulled) — see the
            // visibility note above the render block.
            ...(showMavenVersion ? { mavenVersion: mavenVersion || null } : {}),
            ...(showGradleVersion ? { gradleVersion: gradleVersion || null } : {}),
            projectVersion: projectVersion || null,
          },
        },
      })
      toast({ title: 'Build configuration saved' })
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor="build-buildSystem">
              Build System <span className="text-destructive">*</span>
            </Label>
            <FieldInfo path="build.buildSystem" label="Build System" />
          </div>
          <EnumSelect
            fieldPath="buildSystem"
            value={buildSystem}
            onValueChange={(v) => {
              setBuildSystem(v)
              if (v) setLocalError(null)
            }}
            onBlur={() => setBuildSystemTouched(true)}
            placeholder="Select build system"
            id="build-buildSystem"
            aria-required
            aria-invalid={(buildSystemTouched && !buildSystem) || localError !== null}
            aria-describedby={
              (buildSystemTouched && !buildSystem) || localError ? 'build-buildSystem-error' : undefined
            }
          />
          {((buildSystemTouched && !buildSystem) || localError) && (
            <p id="build-buildSystem-error" className="text-xs text-destructive">
              {localError ?? 'Build System is required'}
            </p>
          )}
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.buildSystem" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label>Build File Path</Label>
            <FieldInfo path="build.buildFilePath" label="Build File Path" />
          </div>
          <Input
            value={buildFilePath}
            onChange={(e) => setBuildFilePath(e.target.value)}
            placeholder="pom.xml / build.gradle"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.buildFilePath" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor="build-javaVersion">Java Version</Label>
            <FieldInfo path="build.javaVersion" label="Java Version" />
          </div>
          {/* Dropdown sourced from /meta/java-versions (configured in CRS application.yml,
              per-install overridable). An existing off-list value is preserved as a selectable
              item by EnumSelect; new entries are limited to the configured list. */}
          <EnumSelect
            id="build-javaVersion"
            fieldPath="build.javaVersion"
            value={javaVersion}
            onValueChange={setJavaVersion}
            placeholder="Select Java version"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.javaVersion" />
        </div>

        {showMavenVersion && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="build-mavenVersion">Maven Version</Label>
              <FieldInfo path="build.mavenVersion" label="Maven Version" />
            </div>
            {/* Dropdown sourced from /meta/maven-versions (see Java Version note above). */}
            <EnumSelect
              id="build-mavenVersion"
              fieldPath="build.mavenVersion"
              value={mavenVersion}
              onValueChange={setMavenVersion}
              placeholder="Select Maven version"
            />
            <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.mavenVersion" />
          </div>
        )}

        {showGradleVersion && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label>Gradle Version</Label>
              <FieldInfo path="build.gradleVersion" label="Gradle Version" />
            </div>
            <Input
              value={gradleVersion}
              onChange={(e) => setGradleVersion(e.target.value)}
              placeholder="8.6"
            />
            <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.gradleVersion" />
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label>Project Version</Label>
            <FieldInfo path="build.projectVersion" label="Project Version" />
          </div>
          <Input
            value={projectVersion}
            onChange={(e) => setProjectVersion(e.target.value)}
            placeholder="1.0.0"
          />
          <FieldOverrideInline canEdit={canEdit} componentId={component.id} overriddenAttribute="build.projectVersion" />
        </div>
      </div>

      <div className="flex justify-end">
        {/* title on the wrapping span: a disabled Button has pointer-events-none, so a
            title on it would never show on hover. */}
        <span className="inline-flex" title={!canEdit ? CANNOT_EDIT_TITLE : undefined}>
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending || !canEdit}>
            <Save className="h-4 w-4" />
            {updateMutation.isPending ? 'Saving...' : 'Save Build'}
          </Button>
        </span>
      </div>
    </div>
  )
}
