import { z } from 'zod'
import { isBadToken } from '../artifactOwnership'
import { findUnsupportedGroupId } from '../groupValidation'
import { isVcsHostSupported, hostOf } from '../vcsHost'
import { selectBaseRow } from '../api/baseRow'
import type { ComponentDetail, EscrowAspect } from '../types'
import type { ComponentProfile, ProfileFieldRule } from '../../hooks/useComponentProfiles'
import { flagsForProfile } from './createProfile'
import { formFieldOfRulePath, profileRuleErrors } from './profileRules'
import {
  buildCreateRequest,
  effectiveCreateClientCode,
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

// SYS-095 / CRS ADR-020: an underscore is legal in a Component Key only inside its
// client-code prefix — the lowercased Client Code of the same component, leading the key
// and followed by the end of the key or '-' and the usual kebab tail. No Client Code
// therefore means no underscore, and an uppercase key stays rejected either way.
const KEY_TAIL_REGEX = /^(-[a-z0-9-]*)?$/

export function componentKeyCharsetError(key: string, clientCode?: string): string | null {
  const trimmed = key.trim()
  if (BASE_KEY_REGEX.test(trimmed)) return null

  // The prefix relaxes the charset, never the letter start: a Client Code may begin with
  // a digit or an underscore (`[A-Z_0-9]+`), and a Component Key may not.
  const prefix = clientCode?.trim().toLowerCase()
  if (prefix && trimmed.startsWith(prefix) && /^[a-z]/.test(trimmed)) {
    if (KEY_TAIL_REGEX.test(trimmed.slice(prefix.length))) return null
  }
  return prefix
    ? `Component Key must be lowercase letters, digits and "-", starting with a letter; "_" is allowed only inside the Client Code prefix "${prefix}" (e.g. ${prefix}-payments)`
    : 'Component Key must be lowercase letters, digits and "-", starting with a letter'
}

/**
 * Rename-target charset check, shared by the editor's inline error and its Save gate.
 *
 * Change-based like CRS's `isRename`: an untouched key is never re-validated, so legacy
 * keys that predate the convention don't render their own editor invalid. Blank-tolerant
 * because `buildUpdateRequest`'s `nameChanged` gate treats a blank name as "not a rename"
 * and omits it from the PATCH — a cleared field is not-yet-attempted, not a violation.
 */
export function renameKeyCharsetError(
  key: string | undefined,
  currentName: string,
  clientCode?: string,
): string | null {
  const trimmed = (key ?? '').trim()
  if (!trimmed || trimmed === currentName) return null
  return componentKeyCharsetError(trimmed, clientCode)
}

export function componentKeyError(key: string, clientCode?: string): string | null {
  const trimmed = key.trim()
  if (!trimmed) return null
  return componentKeyCharsetError(trimmed, clientCode)
}

// A single Zod object; the explicit+external block is enforced via superRefine
// (no discriminated union — the discriminant is a pair of booleans and only one
// combination gates extra fields). Copyright is intentionally NOT validated here:
// CRS only requires it when a copyright catalog is configured server-side, which
// the Portal can't detect — a server 400 is mapped inline instead. The schema is
// built per-render from field-config visibility (a hidden/readonly field is
// removed and must not fire its requirement) and from the chosen profile's field
// rules, checked against the request the form would send (D3).
export function makeCreateSchema(
  editable: (field: string) => boolean,
  supportedGroups: readonly string[],
  gitBaseUrl: string | null | undefined,
  profileRules: readonly ProfileFieldRule[],
  // Needed for the Component-Key rule: a clone that is not external keeps its source's
  // clientCode in the payload, so the key may legally lean on it.
  source?: ComponentDetail,
) {
  return z
    .object({
      name: z.string().trim().min(1, 'Component Key is required'),
      displayName: z.string(),
      buildSystem: z.string().min(1, 'Build System is required'),
      componentOwner: z.string().trim().min(1, 'Component Owner is required'),
      distributionExplicit: z.boolean(),
      distributionExternal: z.boolean(),
      releaseManager: z.array(z.string()),
      securityChampion: z.array(z.string()),
      copyright: z.string(),
      clientCode: z.string(),
      jiraProjectKey: z.string().trim().min(1, 'Jira Project Key is required'),
      versionPrefix: z.string(),
      // A component's Jira versions can't render without a full version format,
      // so it must never be blank — it is seeded from component-defaults and
      // stays required even if the user clears it.
      versionFormat: z.string().trim().min(1, 'Full Version Format is required'),
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
        // Optional Docker flavor (e.g. "alpine"); only meaningful for a docker image.
        flavor: z.string(),
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
      // Free-form: an enum value or ''. Never blocks submit (the escrow
      // generation is optional at create and validated server-side).
      escrowGeneration: z.string(),
      labels: z.array(z.string()),
      buildTasks: z.string(),
    })
    .superRefine((v, ctx) => {
      const keyError = componentKeyError(v.name, effectiveCreateClientCode(v, source, editable))
      if (keyError) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['name'], message: keyError })
      }
      const request = buildCreateRequest(v, source, editable)
      for (const [rulePath, message] of profileRuleErrors(profileRules, request)) {
        const field = formFieldOfRulePath(rulePath)
        // The key shows one message at a time: "required" or the charset rule come first.
        if (!field || (field === 'name' && (keyError || !v.name.trim()))) continue
        const path = field.split('.').map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message })
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
  flavor: '',
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
  clientCode: '',
  jiraProjectKey: '',
  versionPrefix: '',
  // Universal fallback (legacy global default) so the REQUIRED Full Version Format
  // is never blank. component-defaults / the cloned source OVERRIDE it when present.
  versionFormat: '$versionPrefix-$baseVersionFormat',
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
  escrowGeneration: '',
  labels: [],
  buildTasks: '',
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
  // Full/custom version-format wrapper (e.g. "$versionPrefix-$baseVersionFormat").
  // Seeds the create form's Full Version Format field; not part of a mirror pair.
  versionFormat?: string
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
  // Part of the component-defaults contract, but the create wizard no longer
  // seeds the distribution flags from here — a scratch component's
  // external/explicit are DERIVED FROM THE PRE-SELECTED PROFILE (see initialValues).
  distribution?: { explicit?: boolean; external?: boolean }
  vcs?: VcsDefaults
  // Only `generation` is consumed by the create wizard (the sole escrow field
  // it exposes); the rest of the escrow aspect is not seeded from defaults.
  escrow?: EscrowAspect
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
  // The profile the wizard pre-selects; a clone copies its flags from the source instead.
  profile: ComponentProfile | null = null,
): CreateFormValues {
  const vcsDefaults = defaults.vcs ?? {}
  const baseVcs = source ? selectBaseRow(source)?.vcsEntries?.[0] : undefined
  const vcsTag = blankToUndefined(baseVcs?.tag) ?? blankToUndefined(vcsDefaults.tag) ?? ''
  const vcsBranch =
    blankToUndefined(baseVcs?.branch) ?? blankToUndefined(vcsDefaults.branch) ?? FALLBACK_VCS_BRANCH
  if (!source) {
    const defaultBuildSystem = blankToUndefined(defaults.buildSystem)
    // Distribution classification is DERIVED FROM THE PRE-SELECTED PROFILE (the
    // wizard's source of truth), not from component-defaults — otherwise the
    // pre-selected profile and the seeded flags could disagree and the payload
    // would carry a classification that contradicts the shown profile.
    const { distributionExplicit, distributionExternal } = profile
      ? flagsForProfile(profile, SCRATCH_DEFAULTS.distributionExplicit)
      : SCRATCH_DEFAULTS
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
      versionFormat:
        blankToUndefined(defaults.jira?.componentVersionFormat?.versionFormat) ??
        SCRATCH_DEFAULTS.versionFormat,
      escrowGeneration: blankToUndefined(defaults.escrow?.generation) ?? '',
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
    clientCode: source.clientCode ?? '',
    versionPrefix: selectBaseRow(source)?.jira?.versionPrefix ?? '',
    versionFormat:
      blankToUndefined(selectBaseRow(source)?.jira?.versionFormat) ?? SCRATCH_DEFAULTS.versionFormat,
    ...seedVersionFormats(
      selectBaseRow(source)?.jira?.lineVersionFormat,
      selectBaseRow(source)?.jira?.minorVersionFormat,
      selectBaseRow(source)?.jira?.releaseVersionFormat,
      selectBaseRow(source)?.jira?.buildVersionFormat,
    ),
    escrowGeneration: selectBaseRow(source)?.escrow?.generation ?? '',
    vcsTag,
    vcsBranch,
    labels: [...(source.labels ?? [])],
    buildTasks: selectBaseRow(source)?.build?.buildTasks ?? '',
  }
}
