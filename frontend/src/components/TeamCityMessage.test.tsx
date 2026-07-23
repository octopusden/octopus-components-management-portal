import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TeamCityMessage } from './TeamCityMessage'

const PROJECT_URL = 'https://teamcity.example.com/project/Payments_Build'
const BASE = 'https://teamcity.example.com'

describe('TeamCityMessage', () => {
  it('renders plain text unchanged when there is nothing to link', () => {
    render(<TeamCityMessage message="Just a plain message." projectUrl={PROJECT_URL} />)
    expect(screen.getByText('Just a plain message.')).toBeDefined()
  })

  it('preserves literal "\\n" line breaks as separate lines', () => {
    render(<TeamCityMessage message={'line one\nline two'} projectUrl={PROJECT_URL} />)
    expect(screen.getByText('line one')).toBeDefined()
    expect(screen.getByText('line two')).toBeDefined()
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
  })

  it('links BUILD_CONF_ID for a bare "- BUILD_CONF_ID" line', () => {
    render(<TeamCityMessage message="- Payments_Build_Deploy" projectUrl={PROJECT_URL} />)
    const link = screen.getByRole('link', { name: 'Payments_Build_Deploy' }) as HTMLAnchorElement
    expect(link.href).toBe(`${BASE}/admin/editBuildRunners.html?id=buildType:Payments_Build_Deploy`)
  })

  it('renders identifiers as plain text (no links) when projectUrl cannot be parsed', () => {
    render(<TeamCityMessage message="- Payments_Build_Deploy" projectUrl={null} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('- Payments_Build_Deploy')).toBeDefined()
  })

  it('leaves a non-matching "-" line as plain prose (does not misparse general text)', () => {
    render(
      <TeamCityMessage
        message="- please contact the build team for details"
        projectUrl={PROJECT_URL}
      />,
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('- please contact the build team for details')).toBeDefined()
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
  })
})
