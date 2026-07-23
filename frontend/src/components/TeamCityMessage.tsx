import { safeHttpUrl } from '../lib/utils'

interface TeamCityMessageProps {
  message: string
  /** The finding's project webUrl (TeamcityProject.projectUrl /
   *  TeamcityValidationRow.projectUrl) — the only per-row TeamCity URL we
   *  have. The base TC host is derived from it (stripping the trailing
   *  "/project/<id>") so STEP_ID/BUILD_CONF_ID lines can link into the
   *  TeamCity admin UI without a separate portal-config lookup. */
  projectUrl?: string | null
}

// TeamCity project webUrls look like "https://tc.example.com/project/Foo_Bar";
// the admin pages we link to (editBuildRunners.html / editRunType.html) hang
// off the same host, one level up from "/project/...".
function teamCityBaseUrl(projectUrl?: string | null): string | null {
  const url = safeHttpUrl(projectUrl ?? null)
  if (!url) return null
  const idx = url.indexOf('/project/')
  return idx === -1 ? null : url.slice(0, idx)
}

// A finding message can contain lines the TeamCity sweep emits in one of two
// shapes (see TeamCityMessage's callers): a build step nested in a build
// configuration, or a bare build configuration. Only lines matching one of
// these exactly (after the leading "-") get turned into links — anything
// else (including general prose starting with "-") renders as plain text.
const STEP_IN_BUILD_CONF = /^-\s*(\S+)\s+in\s+(\S+)\s*$/
const BUILD_CONF_ONLY = /^-\s*(\S+)\s*$/

function buildRunnersUrl(base: string, buildConfId: string): string {
  return `${base}/admin/editBuildRunners.html?id=buildType:${encodeURIComponent(buildConfId)}`
}

function runTypeUrl(base: string, buildConfId: string, stepId: string): string {
  return `${base}/admin/editRunType.html?id=buildType:${encodeURIComponent(buildConfId)}&runnerId=${encodeURIComponent(stepId)}`
}

function TcLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
    >
      {children}
    </a>
  )
}

function renderLine(line: string, base: string | null, key: number) {
  const stepMatch = line.match(STEP_IN_BUILD_CONF)
  if (stepMatch) {
    const [, stepId, buildConfId] = stepMatch as unknown as [string, string, string]
    if (!base) return <div key={key}>{line}</div>
    return (
      <div key={key}>
        {'- '}
        <TcLink href={runTypeUrl(base, buildConfId, stepId)}>{stepId}</TcLink>
        {' in '}
        <TcLink href={buildRunnersUrl(base, buildConfId)}>{buildConfId}</TcLink>
      </div>
    )
  }

  const confMatch = line.match(BUILD_CONF_ONLY)
  if (confMatch) {
    const [, buildConfId] = confMatch as unknown as [string, string]
    if (!base) return <div key={key}>{line}</div>
    return (
      <div key={key}>
        {'- '}
        <TcLink href={buildRunnersUrl(base, buildConfId)}>{buildConfId}</TcLink>
      </div>
    )
  }

  // Blank lines still need a rendered (non-empty) block so the gap survives
  // — an empty <div> collapses to zero height in most browsers.
  return <div key={key}>{line === '' ? ' ' : line}</div>
}

/**
 * Renders a TeamCity finding's free-text `message`, split on literal "\n"
 * line breaks (one block per line, so long lines still wrap normally while
 * the sweep's line breaks are preserved). Any line of the form
 * "- STEP_ID in BUILD_CONF_ID" or "- BUILD_CONF_ID" gets its identifiers
 * linked into the TeamCity admin UI (build steps / build configuration),
 * using the base host derived from `projectUrl`. Used by both the per-
 * component TeamCityValidationsTab and the registry-wide Validations page
 * findings table, so the two surfaces stay in sync.
 */
export function TeamCityMessage({ message, projectUrl }: TeamCityMessageProps) {
  const base = teamCityBaseUrl(projectUrl)
  const lines = message.split('\n')
  return <div className="text-sm">{lines.map((line, i) => renderLine(line, base, i))}</div>
}
