import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { EnumSelect } from '../ui/EnumSelect'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import { FieldOverrideInline } from './FieldOverrideInline'
import type { BuildSection } from './useBuildSection'

interface BuildTabProps {
  section: BuildSection
  canEdit: boolean
}

/**
 * Build tab — presentational only. State + the combined-save slice live in
 * `useBuildSection` (owned by ComponentDetailPage); this component renders the
 * BASE-row toolchain fields and reports edits up via `section.set`. The page's
 * single sticky Save bar replaces the old per-tab "Save Build" button.
 */
export function BuildTab({ section, canEdit }: BuildTabProps) {
  const { state, set, buildSystemMissing, buildSystemTouched, setBuildSystemTouched, showMavenVersion, showGradleVersion } = section
  const showRequiredError = buildSystemTouched && buildSystemMissing

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor="build-buildSystem">
              <FieldLabelText path="build.buildSystem" fallback="Build System" />{' '}
              <span className="text-destructive">*</span>
            </Label>
            <FieldInfo path="build.buildSystem" label="Build System" />
          </div>
          <EnumSelect
            fieldPath="buildSystem"
            value={state.buildSystem}
            onValueChange={(v) => set('buildSystem', v)}
            onBlur={() => setBuildSystemTouched(true)}
            placeholder="Select build system"
            id="build-buildSystem"
            aria-required
            aria-invalid={showRequiredError}
            aria-describedby={showRequiredError ? 'build-buildSystem-error' : undefined}
          />
          {showRequiredError && (
            <p id="build-buildSystem-error" className="text-xs text-destructive">
              Build System is required
            </p>
          )}
          <FieldOverrideInline canEdit={canEdit} overriddenAttribute="build.buildSystem" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="build.buildFilePath" fallback="Build File Path" /></Label>
            <FieldInfo path="build.buildFilePath" label="Build File Path" />
          </div>
          <Input
            value={state.buildFilePath}
            onChange={(e) => set('buildFilePath', e.target.value)}
            placeholder="pom.xml / build.gradle"
          />
          <FieldOverrideInline canEdit={canEdit} overriddenAttribute="build.buildFilePath" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor="build-javaVersion"><FieldLabelText path="build.javaVersion" fallback="Java Version" /></Label>
            <FieldInfo path="build.javaVersion" label="Java Version" />
          </div>
          <EnumSelect
            id="build-javaVersion"
            fieldPath="build.javaVersion"
            value={state.javaVersion}
            onValueChange={(v) => set('javaVersion', v)}
            placeholder="Select Java version"
          />
          <FieldOverrideInline canEdit={canEdit} overriddenAttribute="build.javaVersion" />
        </div>

        {showMavenVersion && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="build-mavenVersion"><FieldLabelText path="build.mavenVersion" fallback="Maven Version" /></Label>
              <FieldInfo path="build.mavenVersion" label="Maven Version" />
            </div>
            <EnumSelect
              id="build-mavenVersion"
              fieldPath="build.mavenVersion"
              value={state.mavenVersion}
              onValueChange={(v) => set('mavenVersion', v)}
              placeholder="Select Maven version"
            />
            <FieldOverrideInline canEdit={canEdit} overriddenAttribute="build.mavenVersion" />
          </div>
        )}

        {showGradleVersion && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label><FieldLabelText path="build.gradleVersion" fallback="Gradle Version" /></Label>
              <FieldInfo path="build.gradleVersion" label="Gradle Version" />
            </div>
            <Input
              value={state.gradleVersion}
              onChange={(e) => set('gradleVersion', e.target.value)}
              placeholder="8.6"
            />
            <FieldOverrideInline canEdit={canEdit} overriddenAttribute="build.gradleVersion" />
          </div>
        )}
      </div>
    </div>
  )
}
