import { z } from 'zod'
import { isBadToken } from '../artifactOwnership'
import { findUnsupportedGroupId } from '../groupValidation'
import { isVcsHostSupported, hostOf } from '../vcsHost'
import { isSolutionCandidate } from '../solutionKey'
import { selectBaseRow } from '../api/baseRow'
import type { ComponentDetail } from '../types'
import {
  vcsBlockApplies,
  DEPRECATED_BUILD_SYSTEMS,
  FALLBACK_VCS_BRANCH,
  SSH_VCS_URL_REGEX,
  type CreateFormValues,
} from './buildCreateRequest'

// Strict Component-Key convention for NEW components (see brief §Identity): a
// lowercase letter, then lowercase letters / digits / '-'. This is deliberately
// stricter than the legacy tolerant NAME_REGEX (which allowed Upper/_/./ for
// pre-existing names) — new components follow the strict convention.
export const BASE_KEY_REGEX = /^[a-z][a-z0-9-]*$/

// The four component profiles chosen on the wizard's first (scratch) step. The
// profile is the single source for the solution / external / explicit flags and
// the Component-Key naming rule (see brief "Choose component profile").
export type ComponentProfile = 'solution' | 'dmp-bundle' | 'regular-external' | 'regular-internal'

export interface ProfileMeta {
  id: ComponentProfile
  label: string
  description: string
  /** Whether "Has explicit distribution?" is asked (only the two Regular profiles). */
  asksExplicit: boolean
}

// Fixed, sanitized copy (brief §10). No org/product tokens.
export const PROFILE_META: readonly ProfileMeta[] = [
  {
    id: 'solution',
    label: 'Solution',
    description:
      'A top-level solution component that groups and ships other components together. The key contains "-solution". External, with its own distribution.',
    asksExplicit: false,
  },
  {
    id: 'dmp-bundle',
    label: 'DMP Bundle',
    description:
      'A bundle component (also a solution). The key contains "dmp-bundle". External, with its own distribution.',
    asksExplicit: false,
  },
  {
    id: 'regular-external',
    label: 'Regular external component',
    description: 'An ordinary component that is delivered to the client.',
    asksExplicit: true,
  },
  {
    id: 'regular-internal',
    label: 'Regular internal component',
    description: 'An ordinary component for internal use only, not delivered to the client.',
    asksExplicit: true,
  },
]

export interface ProfileFlags {
  solution: boolean
  distributionExternal: boolean
  distributionExplicit: boolean
}

// Solution / DMP Bundle fix external+explicit=true; the two Regular profiles fix
// external by kind and take explicit from the "Has explicit distribution?" answer.
export function flagsForProfile(profile: ComponentProfile, explicitAnswer: boolean): ProfileFlags {
  switch (profile) {
    case 'solution':
    case 'dmp-bundle':
      return { solution: true, distributionExternal: true, distributionExplicit: true }
    case 'regular-external':
      return { solution: false, distributionExternal: true, distributionExplicit: explicitAnswer }
    case 'regular-internal':
      return { solution: false, distributionExternal: false, distributionExplicit: explicitAnswer }
  }
}

// Clone derives the profile from the source's flags + key pattern. Editable
// afterwards (changing it resets the key + recomputes flags).
export function profileFromSource(
  source: ComponentDetail,
  patterns: readonly string[] | undefined,
): { profile: ComponentProfile; explicit: boolean } {
  const key = source.name ?? ''
  const bundlePattern = patterns?.[1]
  if (source.solution) {
    if (bundlePattern && key.includes(bundlePattern)) return { profile: 'dmp-bundle', explicit: true }
    return { profile: 'solution', explicit: true }
  }
  return {
    profile: source.distributionExternal ? 'regular-external' : 'regular-internal',
    explicit: !!source.distributionExplicit,
  }
}

// Profile-dependent Component-Key requirement message, or null when the key is
// acceptable for the profile. Base-regex failure is reported first; then the
// per-profile substring rule.
export function componentKeyError(
  key: string,
  profile: ComponentProfile,
  patterns: readonly string[] | undefined,
): string | null {
  const trimmed = key.trim()
  if (!trimmed) return null
  if (!BASE_KEY_REGEX.test(trimmed)) {
    return 'Component Key must be lowercase letters, digits and "-", starting with a letter'
  }
  const solutionPattern = patterns?.[0] ?? '-solution'
  const bundlePattern = patterns?.[1] ?? 'dmp-bundle'
  if (profile === 'solution' && !trimmed.includes(solutionPattern)) {
    return `A Solution key must contain "${solutionPattern}"`
  }
  if (profile === 'dmp-bundle' && !trimmed.includes(bundlePattern)) {
    return `A DMP Bundle key must contain "${bundlePattern}"`
  }
  if (
    (profile === 'regular-external' || profile === 'regular-internal') &&
    isSolutionCandidate(trimmed, patterns)
  ) {
    return 'This key matches a solution pattern — choose the Solution or DMP Bundle profile instead'
  }
  return null
}

// A single Zod object; the explicit+external block is enforced via superRefine
// (no discriminated union — the discriminant is a pair of booleans and only one
// combination gates extra fields). Copyright is intentionally NOT validated here:
// CRS only requires it when a copyright catalog is configured server-side, which
// the Portal can't detect — a server 400 is mapped inline instead. The schema is
// built per-render from field-config visibility (a hidden/readonly field is
// removed and must not fire its requirement) and from the chosen profile (the
// Component-Key rule is profile-dependent).
export function makeCreateSchema(
  editable: (field: string) => boolean,
  supportedGroups: readonly string[],
  gitBaseUrl: string | null | undefined,
  profile: ComponentProfile,
  solutionPatterns: readonly string[] | undefined,
) {
  return z
    .object({
      name: z.string().min(1, 'Component Key is required'),
      displayName: z.string(),
      buildSystem: z.string().min(1, 'Build System is required'),
      componentOwner: z.string().trim().min(1, 'Component Owner is required'),
      distributionExplicit: z.boolean(),
      distributionExternal: z.boolean(),
      releaseManager: z.array(z.string()),
      securityChampion: z.array(z.string()),
      copyright: z.string(),
      jiraProjectKey: z.string().trim().min(1, 'Jira Project Key is required'),
      versionPrefix: z.string(),
      minorVersionFormat: z.string(),
      releaseVersionFormat: z.string(),
      buildVersionFormat: z.string(),
      lineVersionFormat: z.string(),
      minorSeparate: z.boolean(),
      buildSeparate: z.boolean(),
      vcsUrl: z.string(),
      vcsTag: z.string(),
      vcsBranch: z.string(),
      coordinate: z.object({
        type: z.enum(['maven', 'docker', 'package']),
        groupPattern: z.string(),
        artifactPattern: z.string(),
        imageName: z.string(),
        packageType: z.enum(['DEB', 'RPM']),
        packageName: z.string(),
      }),
      ownership: z.array(
        z.object({
          groupId: z.string(),
          mode: z.enum(['ALL', 'ALL_EXCEPT_CLAIMED', 'EXPLICIT']),
          tokens: z.array(z.string()),
        }),
      ),
    })
    .superRefine((v, ctx) => {
      // Profile-dependent Component-Key rule (strict for new components).
      const keyError = componentKeyError(v.name, profile, solutionPatterns)
      if (keyError) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['name'], message: keyError })
      }
      // Legacy EscrowConfigValidator rule: a VCS root is mandatory for every
      // build system outside the exempt set.
      if (vcsBlockApplies(v.buildSystem)) {
        const url = v.vcsUrl.trim()
        if (!url) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['vcsUrl'],
            message: 'VCS Path is required for this build system',
          })
        } else if (!SSH_VCS_URL_REGEX.test(url)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['vcsUrl'],
            message: 'VCS Path must be an ssh:// URL, e.g. ssh://git@host/path/repo.git',
          })
        } else if (!isVcsHostSupported(url, gitBaseUrl)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['vcsUrl'],
            message: `VCS host must be ${hostOf(gitBaseUrl)} (the ecosystem Bitbucket)`,
          })
        }
        if (!v.vcsTag.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['vcsTag'], message: 'Tag is required' })
        }
        if (!v.vcsBranch.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['vcsBranch'],
            message: 'Production branch is required',
          })
        }
      }
      // Base ownership: validate PER ROW (blank Group ID rows are skipped).
      v.ownership.forEach((row, i) => {
        const groupId = row.groupId.trim()
        if (!groupId) return
        if (isBadToken(groupId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['ownership', i, 'groupId'],
            message: `Invalid group "${groupId}" — letters, digits, . _ - only`,
          })
        }
        const unsupported = findUnsupportedGroupId(groupId, supportedGroups)
        if (unsupported) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['ownership', i, 'groupId'],
            message: `Group "${unsupported}" must start with a supported prefix (${supportedGroups.join(', ')})`,
          })
        }
        if (row.mode === 'EXPLICIT' && row.tokens.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['ownership', i, 'tokens'],
            message: 'Add at least one artifact, or switch to a catch-all mode',
          })
        }
      })
      if (!(v.distributionExplicit && v.distributionExternal)) return
      if (editable('displayName') && !v.displayName.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['displayName'],
          message: 'Display Name is required for an explicit + external component',
        })
      }
      if (editable('releaseManager') && v.releaseManager.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['releaseManager'],
          message: 'At least one Release Manager is required for an explicit + external component',
        })
      }
      if (editable('securityChampion') && v.securityChampion.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['securityChampion'],
          message: 'At least one Security Champion is required for an explicit + external component',
        })
      }
      const c = v.coordinate
      const missing = (field: string, msg: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['coordinate', field], message: msg })
      if (c.type === 'maven') {
        if (!c.groupPattern.trim()) {
          missing('groupPattern', 'Group ID is required')
        } else {
          const unsupported = findUnsupportedGroupId(c.groupPattern, supportedGroups)
          if (unsupported) {
            missing(
              'groupPattern',
              `Group ID "${unsupported}" must start with a supported prefix (${supportedGroups.join(', ')})`,
            )
          }
        }
        if (!c.artifactPattern.trim()) missing('artifactPattern', 'Artifact ID is required')
      } else if (c.type === 'docker') {
        if (!c.imageName.trim()) missing('imageName', 'Image name is required')
      } else {
        if (!c.packageName.trim()) missing('packageName', 'Package name is required')
      }
    })
}

export const EMPTY_COORDINATE: CreateFormValues['coordinate'] = {
  type: 'maven',
  groupPattern: '',
  artifactPattern: '',
  imageName: '',
  packageType: 'DEB',
  packageName: '',
}

export const SCRATCH_DEFAULTS: CreateFormValues = {
  name: '',
  displayName: '',
  buildSystem: '',
  componentOwner: '',
  distributionExplicit: false,
  distributionExternal: true,
  releaseManager: [],
  securityChampion: [],
  copyright: '',
  jiraProjectKey: '',
  versionPrefix: '',
  minorVersionFormat: '',
  releaseVersionFormat: '',
  buildVersionFormat: '',
  lineVersionFormat: '',
  minorSeparate: false,
  buildSeparate: false,
  vcsUrl: '',
  vcsTag: '',
  vcsBranch: '',
  coordinate: EMPTY_COORDINATE,
  ownership: [{ groupId: '', mode: 'ALL', tokens: [] }],
}

// vcs.tag / vcs.branch read from GET /config/component-defaults.
export interface VcsDefaults {
  tag?: string
  branch?: string
}

export interface ComponentVersionFormatDefaults {
  minorVersionFormat?: string
  releaseVersionFormat?: string
  buildVersionFormat?: string
  lineVersionFormat?: string
}

// The subset of CreateFormValues describing the two leading/derived pairs.
export type VersionFormatSeed = Pick<
  CreateFormValues,
  | 'lineVersionFormat'
  | 'minorVersionFormat'
  | 'minorSeparate'
  | 'releaseVersionFormat'
  | 'buildVersionFormat'
  | 'buildSeparate'
>

// Derive the leading/derived pair state from four stored/defaulted format
// strings (editor JiraTab parity). Line leads Minor; Release leads Build.
export function seedVersionFormats(
  line: string | null | undefined,
  minor: string | null | undefined,
  release: string | null | undefined,
  build: string | null | undefined,
): VersionFormatSeed {
  const l = (line ?? '').trim()
  const m = (minor ?? '').trim()
  const r = (release ?? '').trim()
  const b = (build ?? '').trim()
  const minorSeparate = l !== '' && m !== '' && l !== m
  const buildSeparate = b !== '' && b !== r
  return {
    lineVersionFormat: l !== '' ? l : m,
    minorVersionFormat: minorSeparate ? m : '',
    minorSeparate,
    releaseVersionFormat: r,
    buildVersionFormat: buildSeparate ? b : '',
    buildSeparate,
  }
}

export interface ComponentDefaults {
  buildSystem?: string
  componentDisplayName?: string
  copyright?: string
  jira?: { projectKey?: string; componentVersionFormat?: ComponentVersionFormatDefaults }
  distribution?: { explicit?: boolean; external?: boolean }
  vcs?: VcsDefaults
}

export function blankToUndefined(s: string | null | undefined): string | undefined {
  return typeof s === 'string' && s.trim() ? s.trim() : undefined
}

// Maps component-defaults jira.componentVersionFormat → the form's pair state.
export function versionFormatsFromDefaults(defaults: ComponentDefaults): VersionFormatSeed {
  const cvf = defaults.jira?.componentVersionFormat ?? {}
  return seedVersionFormats(
    cvf.lineVersionFormat,
    cvf.minorVersionFormat,
    cvf.releaseVersionFormat,
    cvf.buildVersionFormat,
  )
}

// Initial form values, computed synchronously from the source (clone mode) or
// the scratch defaults. Component Key + coordinate are never seeded (unique per
// component).
export function initialValues(
  source: ComponentDetail | null,
  defaults: ComponentDefaults,
): CreateFormValues {
  const vcsDefaults = defaults.vcs ?? {}
  const baseVcs = source ? selectBaseRow(source)?.vcsEntries?.[0] : undefined
  const vcsTag = blankToUndefined(baseVcs?.tag) ?? blankToUndefined(vcsDefaults.tag) ?? ''
  const vcsBranch =
    blankToUndefined(baseVcs?.branch) ?? blankToUndefined(vcsDefaults.branch) ?? FALLBACK_VCS_BRANCH
  if (!source) {
    const defaultBuildSystem = blankToUndefined(defaults.buildSystem)
    const distributionExplicit =
      defaults.distribution?.explicit ?? SCRATCH_DEFAULTS.distributionExplicit
    const distributionExternal =
      defaults.distribution?.external ?? SCRATCH_DEFAULTS.distributionExternal
    return {
      ...SCRATCH_DEFAULTS,
      buildSystem:
        defaultBuildSystem && !DEPRECATED_BUILD_SYSTEMS.has(defaultBuildSystem)
          ? defaultBuildSystem
          : '',
      displayName: blankToUndefined(defaults.componentDisplayName) ?? '',
      copyright:
        distributionExplicit && distributionExternal
          ? (blankToUndefined(defaults.copyright) ?? '')
          : '',
      distributionExplicit,
      distributionExternal,
      jiraProjectKey: blankToUndefined(defaults.jira?.projectKey) ?? '',
      ...versionFormatsFromDefaults(defaults),
      vcsTag,
      vcsBranch,
    }
  }
  const sourceBuildSystem = selectBaseRow(source)?.build?.buildSystem ?? ''
  return {
    ...SCRATCH_DEFAULTS,
    buildSystem: DEPRECATED_BUILD_SYSTEMS.has(sourceBuildSystem) ? '' : sourceBuildSystem,
    componentOwner: source.componentOwner ?? '',
    distributionExplicit: source.distributionExplicit ?? false,
    distributionExternal: source.distributionExternal ?? false,
    releaseManager: [...(source.releaseManager ?? [])],
    securityChampion: [...(source.securityChampion ?? [])],
    copyright: source.copyright ?? '',
    versionPrefix: selectBaseRow(source)?.jira?.versionPrefix ?? '',
    ...seedVersionFormats(
      selectBaseRow(source)?.jira?.lineVersionFormat,
      selectBaseRow(source)?.jira?.minorVersionFormat,
      selectBaseRow(source)?.jira?.releaseVersionFormat,
      selectBaseRow(source)?.jira?.buildVersionFormat,
    ),
    vcsTag,
    vcsBranch,
  }
}
