import { safeHttpUrl } from '../lib/utils'

interface TeamCityMessageProps {
  /** CRS models this as optional/nullable (not every row/validation carries
   *  a message) — render defensively rather than assuming it's always set. */
  message?: string | null
  /** The finding's project webUrl — the TeamCity base host is derived from
   *  it so STEP_ID/BUILD_CONF_ID lines can link into the admin UI. */
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

// A bullet line is anything starting with "-" (after trimming) — rendered as
// a real <li> (proper bullet glyph) instead of a literal "-" character. The
// rest of the line (after the marker) is what gets matched against the two
// identifier shapes below.
const BULLET_LINE = /^\s*-\s*(.*)$/
const STEP_IN_BUILD_CONF = /^(\S+)\s+in\s+(\S+)$/
const BUILD_CONF_ONLY = /^(\S+)$/

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

// Renders a bullet line's content (after the leading "-" is stripped): either
// the two known identifier shapes (linked, when a TeamCity base URL is
// available) or the rest of the line as plain text — never re-adds a literal
// "-", since the <li> marker already supplies the bullet glyph.
function renderBulletContent(rest: string, base: string | null) {
  const stepMatch = rest.match(STEP_IN_BUILD_CONF)
  if (stepMatch) {
    const [, stepId, buildConfId] = stepMatch as unknown as [string, string, string]
    if (base) {
      return (
        <>
          <TcLink href={runTypeUrl(base, buildConfId, stepId)}>{stepId}</TcLink>
          {' in '}
          <TcLink href={buildRunnersUrl(base, buildConfId)}>{buildConfId}</TcLink>
        </>
      )
    }
    return rest
  }

  const confMatch = rest.match(BUILD_CONF_ONLY)
  if (confMatch) {
    const [, buildConfId] = confMatch as unknown as [string, string]
    if (base) {
      return <TcLink href={buildRunnersUrl(base, buildConfId)}>{buildConfId}</TcLink>
    }
    return rest
  }

  return rest
}

// Groups consecutive bullet lines under one <ul> (a real list, not one <ul>
// per line) while non-bullet lines stay as their own paragraph-like block —
// preserves the message's original line order either way.
type Segment = { type: 'bullets'; items: string[] } | { type: 'plain'; line: string }

function segmentLines(lines: string[]): Segment[] {
  const segments: Segment[] = []
  for (const line of lines) {
    const bulletMatch = line.match(BULLET_LINE)
    if (bulletMatch) {
      const rest = bulletMatch[1] ?? ''
      const last = segments[segments.length - 1]
      if (last && last.type === 'bullets') {
        last.items.push(rest)
      } else {
        segments.push({ type: 'bullets', items: [rest] })
      }
    } else {
      segments.push({ type: 'plain', line })
    }
  }
  return segments
}

/**
 * Renders a TeamCity finding's free-text `message`, split on literal "\n"
 * line breaks. Lines starting with "-" render as real bulleted list items
 * (consecutive bullets share one <ul>); within a bullet, "STEP_ID in
 * BUILD_CONF_ID" / "BUILD_CONF_ID" gets linked into the TeamCity admin UI.
 * Used by both TeamCityValidationsTab and the Validations page findings
 * table, so text color/spacing stay identical on both surfaces.
 */
export function TeamCityMessage({ message, projectUrl }: TeamCityMessageProps) {
  if (!message) return null

  const base = teamCityBaseUrl(projectUrl)
  const segments = segmentLines(message.split('\n'))

  return (
    <div className="text-sm text-muted-foreground break-words" style={{ lineHeight: '30px' }}>
      {segments.map((segment, i) => {
        if (segment.type === 'bullets') {
          return (
            <ul key={i} className="list-disc pl-5">
              {segment.items.map((rest, j) => (
                <li key={j}>{renderBulletContent(rest, base)}</li>
              ))}
            </ul>
          )
        }
        // Blank lines still need a rendered (non-empty) block so the gap
        // survives — an empty <div> collapses to zero height in most browsers.
        return <div key={i}>{segment.line === '' ? ' ' : segment.line}</div>
      })}
    </div>
  )
}
