import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TeamCityMessage } from './TeamCityMessage'

const PROJECT_URL = 'https://teamcity.example.com/project/Payments_Build'
const BASE = 'https://teamcity.example.com'

describe('TeamCityMessage', () => {
  it('renders plain text unchanged when there is nothing to link', () => {
    render(<TeamCityMessage message="Just a plain message." projectUrl={PROJECT_URL} />)
    expect(screen.getByText('Just a plain message.')).toBeDefined()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('preserves literal "\\n" line breaks as separate lines', () => {
    render(<TeamCityMessage message={'line one\nline two'} projectUrl={PROJECT_URL} />)
    expect(screen.getByText('line one')).toBeDefined()
    expect(screen.getByText('line two')).toBeDefined()
  })

  it('renders a "-" line as a real bulleted list item, not a literal "-" character', () => {
    render(<TeamCityMessage message="- Payments_Build_Deploy" projectUrl={null} />)
    expect(screen.getByRole('list')).toBeDefined()
    const item = screen.getByRole('listitem')
    expect(item).toBeDefined()
    // The bullet glyph comes from list-style, not a literal "-" in the text.
    expect(item.textContent).toBe('Payments_Build_Deploy')
    expect(screen.queryByText(/^-/)).toBeNull()
  })

  it('groups consecutive "-" lines under one shared list', () => {
    render(
      <TeamCityMessage
        message={'- Build_A\n- Build_B\n- Build_C'}
        projectUrl={null}
      />,
    )
    const lists = screen.getAllByRole('list')
    expect(lists).toHaveLength(1)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('links both STEP_ID and BUILD_CONF_ID for a "- STEP_ID in BUILD_CONF_ID" line', () => {
    render(
      <TeamCityMessage
        message="- RUNNER_5 in Payments_Build_Deploy"
        projectUrl={PROJECT_URL}
      />,
    )
    const stepLink = screen.getByRole('link', { name: 'RUNNER_5' }) as HTMLAnchorElement
    expect(stepLink.href).toBe(
      `${BASE}/admin/editRunType.html?id=buildType:Payments_Build_Deploy&runnerId=RUNNER_5`,
    )
    const confLink = screen.getByRole('link', { name: 'Payments_Build_Deploy' }) as HTMLAnchorElement
    expect(confLink.href).toBe(
      `${BASE}/admin/editBuildRunners.html?id=buildType:Payments_Build_Deploy`,
    )
    expect(screen.getByText(/in/)).toBeDefined()
    // The link's color class is what makes it read as near-black against the
    // gray prose — see the container's text-muted-foreground below.
    expect(stepLink.className).toContain('text-primary')
  })

  it('links BUILD_CONF_ID for a bare "- BUILD_CONF_ID" line', () => {
    render(<TeamCityMessage message="- Payments_Build_Deploy" projectUrl={PROJECT_URL} />)
    const link = screen.getByRole('link', { name: 'Payments_Build_Deploy' }) as HTMLAnchorElement
    expect(link.href).toBe(`${BASE}/admin/editBuildRunners.html?id=buildType:Payments_Build_Deploy`)
  })

  it('renders identifiers as plain bullet text (no links) when projectUrl cannot be parsed', () => {
    render(<TeamCityMessage message="- Payments_Build_Deploy" projectUrl={null} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByRole('listitem')).toHaveTextContent('Payments_Build_Deploy')
  })

  it('leaves a non-matching "-" line as a plain bullet (does not misparse general text)', () => {
    render(
      <TeamCityMessage
        message="- please contact the build team for details"
        projectUrl={PROJECT_URL}
      />,
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByRole('listitem')).toHaveTextContent('please contact the build team for details')
  })

  it('handles a mix of prose and identifier lines in one message', () => {
    render(
      <TeamCityMessage
        message={'2 build steps are non-compliant:\n- RUNNER_1 in Build_A\n- Build_B'}
        projectUrl={PROJECT_URL}
      />,
    )
    expect(screen.getByText('2 build steps are non-compliant:')).toBeDefined()
    expect(screen.getByRole('link', { name: 'RUNNER_1' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Build_A' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Build_B' })).toBeDefined()
    // The two bullet lines share one list; the prose line is not inside it.
    expect(screen.getAllByRole('list')).toHaveLength(1)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('applies a 30px line height and muted-gray text color to the container, on every surface that uses it', () => {
    const { container } = render(
      <TeamCityMessage message="Just a plain message." projectUrl={PROJECT_URL} />,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.style.lineHeight).toBe('30px')
    expect(root.className).toContain('text-muted-foreground')
  })
})
