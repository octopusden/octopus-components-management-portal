import type {
  ComponentDetail,
  MavenArtifact,
  FileUrlArtifact,
  DockerImage,
  PackageEntry,
  SecurityGroup,
} from '../../lib/types'
import { selectBaseRow } from '../../lib/api/baseRow'
import type { SectionSlice, DiffEntry } from '../../lib/editor/combineRequest'
import { boolDiff, listDiff } from '../../lib/editor/diffUtil'
import { useSectionSnapshot } from './useSectionSnapshot'

export interface MavenState { groupPattern: string; artifactPattern: string; extension: string; classifier: string }
export interface FileUrlState { url: string; artifactId: string; classifier: string }
export interface DockerState { imageName: string; flavor: string }
export interface PackageState { packageType: string; packageName: string }
export interface SecurityGroupState { groupType: string; groupName: string }

interface DistState {
  explicit: boolean
  external: boolean
  maven: MavenState[]
  fileUrl: FileUrlState[]
  docker: DockerState[]
  packages: PackageState[]
  securityGroups: SecurityGroupState[]
}

function sortBy<T extends { sortOrder: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.sortOrder - b.sortOrder)
}

function snapshotFrom(component: ComponentDetail): DistState {
  const br = selectBaseRow(component)
  return {
    explicit: component.distributionExplicit ?? false,
    external: component.distributionExternal ?? false,
    maven: sortBy(br?.mavenArtifacts ?? []).map((a: MavenArtifact) => ({
      groupPattern: a.groupPattern, artifactPattern: a.artifactPattern, extension: a.extension ?? '', classifier: a.classifier ?? '',
    })),
    fileUrl: sortBy(br?.fileUrlArtifacts ?? []).map((a: FileUrlArtifact) => ({
      url: a.url, artifactId: a.artifactId ?? '', classifier: a.classifier ?? '',
    })),
    docker: sortBy(br?.dockerImages ?? []).map((d: DockerImage) => ({ imageName: d.imageName, flavor: d.flavor ?? '' })),
    packages: sortBy(br?.packages ?? []).map((p: PackageEntry) => ({ packageType: p.packageType, packageName: p.packageName })),
    securityGroups: (component.securityGroups ?? []).map((g: SecurityGroup) => ({ groupType: g.groupType, groupName: g.groupName })),
  }
}

export interface DistributionSection {
  state: DistState
  setExplicit: (v: boolean) => void
  setExternal: (v: boolean) => void
  addMaven: () => void; updateMaven: (i: number, f: keyof MavenState, v: string) => void; removeMaven: (i: number) => void
  addFileUrl: () => void; updateFileUrl: (i: number, f: keyof FileUrlState, v: string) => void; removeFileUrl: (i: number) => void
  addDocker: () => void; updateDocker: (i: number, f: keyof DockerState, v: string) => void; removeDocker: (i: number) => void
  addPackage: () => void; updatePackage: (i: number, f: keyof PackageState, v: string) => void; removePackage: (i: number) => void
  addSecurityGroup: () => void; updateSecurityGroup: (i: number, f: keyof SecurityGroupState, v: string) => void; removeSecurityGroup: (i: number) => void
  slice: SectionSlice
  reset: () => void
}

export function useDistributionSection(component: ComponentDetail): DistributionSection {
  const { state, setState, snapshotRef, isDirty, reseed } = useSectionSnapshot(component, snapshotFrom)

  type Lists = 'maven' | 'fileUrl' | 'docker' | 'packages' | 'securityGroups'
  function mutateList<T>(key: Lists, fn: (arr: T[]) => T[]) {
    setState((p) => ({ ...p, [key]: fn(p[key] as unknown as T[]) }))
  }

  const reset = reseed

  // Drop rows whose required fields are still blank — mirrors the legacy save guard.
  const cleanedMaven = state.maven
    .map((a) => ({ groupPattern: a.groupPattern.trim(), artifactPattern: a.artifactPattern.trim(), extension: (a.extension || '').trim(), classifier: (a.classifier || '').trim() }))
    .filter((a) => a.groupPattern !== '' && a.artifactPattern !== '')
  const cleanedFileUrl = state.fileUrl
    .map((a) => ({ url: a.url.trim(), artifactId: (a.artifactId || '').trim(), classifier: (a.classifier || '').trim() }))
    .filter((a) => a.url !== '')
  const cleanedDocker = state.docker
    .map((d) => ({ imageName: d.imageName.trim(), flavor: (d.flavor || '').trim() }))
    .filter((d) => d.imageName !== '')
  const cleanedPackages = state.packages
    .map((p) => ({ packageType: p.packageType.trim(), packageName: p.packageName.trim() }))
    .filter((p) => p.packageType !== '' && p.packageName !== '')
  const cleanedSecGroups = state.securityGroups
    .map((g) => ({ groupType: g.groupType.trim(), groupName: g.groupName.trim() }))
    .filter((g) => g.groupName !== '')

  const prior = snapshotRef.current
  const diff: DiffEntry[] = []
  const push = (d: DiffEntry | null) => { if (d) diff.push(d) }
  if (isDirty) {
    push(boolDiff('Distribution · Explicit', prior.explicit, state.explicit))
    push(boolDiff('Distribution · External', prior.external, state.external))
    push(listDiff('Distribution · Maven Artifacts', prior.maven.map((a) => `${a.groupPattern}:${a.artifactPattern}`), cleanedMaven.map((a) => `${a.groupPattern}:${a.artifactPattern}`)))
    push(listDiff('Distribution · File URL Artifacts', prior.fileUrl.map((a) => a.url), cleanedFileUrl.map((a) => a.url)))
    push(listDiff('Distribution · Docker Images', prior.docker.map((d) => d.imageName), cleanedDocker.map((d) => d.imageName)))
    push(listDiff('Distribution · Packages', prior.packages.map((p) => `${p.packageType}/${p.packageName}`), cleanedPackages.map((p) => `${p.packageType}/${p.packageName}`)))
    push(listDiff('Distribution · Security Groups', prior.securityGroups.map((g) => `${g.groupType}:${g.groupName}`), cleanedSecGroups.map((g) => `${g.groupType}:${g.groupName}`)))
  }

  const slice: SectionSlice = {
    isDirty,
    diff,
    request: {
      distributionExplicit: state.explicit,
      distributionExternal: state.external,
      securityGroups: cleanedSecGroups.map((g) => ({ groupType: g.groupType, groupName: g.groupName })),
      baseConfiguration: {
        mavenArtifacts: cleanedMaven.map((a) => ({ groupPattern: a.groupPattern, artifactPattern: a.artifactPattern, extension: a.extension || null, classifier: a.classifier || null })),
        fileUrlArtifacts: cleanedFileUrl.map((a) => ({ url: a.url, artifactId: a.artifactId || null, classifier: a.classifier || null })),
        dockerImages: cleanedDocker.map((d) => ({ imageName: d.imageName, flavor: d.flavor || null })),
        packages: cleanedPackages.map((p) => ({ packageType: p.packageType, packageName: p.packageName })),
      },
    },
  }

  return {
    state,
    setExplicit: (v) => setState((p) => ({ ...p, explicit: v })),
    setExternal: (v) => setState((p) => ({ ...p, external: v })),
    addMaven: () => mutateList<MavenState>('maven', (a) => [...a, { groupPattern: '', artifactPattern: '', extension: '', classifier: '' }]),
    updateMaven: (i, f, v) => mutateList<MavenState>('maven', (a) => a.map((r, idx) => (idx === i ? { ...r, [f]: v } : r))),
    removeMaven: (i) => mutateList<MavenState>('maven', (a) => a.filter((_, idx) => idx !== i)),
    addFileUrl: () => mutateList<FileUrlState>('fileUrl', (a) => [...a, { url: '', artifactId: '', classifier: '' }]),
    updateFileUrl: (i, f, v) => mutateList<FileUrlState>('fileUrl', (a) => a.map((r, idx) => (idx === i ? { ...r, [f]: v } : r))),
    removeFileUrl: (i) => mutateList<FileUrlState>('fileUrl', (a) => a.filter((_, idx) => idx !== i)),
    addDocker: () => mutateList<DockerState>('docker', (a) => [...a, { imageName: '', flavor: '' }]),
    updateDocker: (i, f, v) => mutateList<DockerState>('docker', (a) => a.map((r, idx) => (idx === i ? { ...r, [f]: v } : r))),
    removeDocker: (i) => mutateList<DockerState>('docker', (a) => a.filter((_, idx) => idx !== i)),
    addPackage: () => mutateList<PackageState>('packages', (a) => [...a, { packageType: '', packageName: '' }]),
    updatePackage: (i, f, v) => mutateList<PackageState>('packages', (a) => a.map((r, idx) => (idx === i ? { ...r, [f]: v } : r))),
    removePackage: (i) => mutateList<PackageState>('packages', (a) => a.filter((_, idx) => idx !== i)),
    addSecurityGroup: () => mutateList<SecurityGroupState>('securityGroups', (a) => [...a, { groupType: 'read', groupName: '' }]),
    updateSecurityGroup: (i, f, v) => mutateList<SecurityGroupState>('securityGroups', (a) => a.map((r, idx) => (idx === i ? { ...r, [f]: v } : r))),
    removeSecurityGroup: (i) => mutateList<SecurityGroupState>('securityGroups', (a) => a.filter((_, idx) => idx !== i)),
    slice,
    reset,
  }
}
