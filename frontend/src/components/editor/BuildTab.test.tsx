import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BuildTab } from './BuildTab'
import type { ComponentDetail } from '../../lib/types'
import type { UseMutationResult } from '@tanstack/react-query'
import type { ComponentUpdateRequest } from '../../hooks/useComponent'

// Stub FieldOverrideInline so tests don't need the overrides API
vi.mock('./FieldOverrideInline', () => ({
  FieldOverrideInline: () => null,
}))

// Stub EnumSelect to avoid field-config fetch
vi.mock('../ui/EnumSelect', () => ({
  EnumSelect: ({ value, onValueChange, placeholder }: { value: string; onValueChange: (v: string) => void; placeholder?: string }) => (
    <input
      data-testid="enum-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}))

function makeComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1',
    name: 'my-component',
    displayName: 'My Component',
    componentOwner: 'alice',
    productType: '',
    system: [],
    clientCode: null,
    solution: false,
    parentComponentName: null,
    archived: false,
    metadata: {},
    version: 5,
    createdAt: null,
    updatedAt: null,
    versions: [],
    buildConfigurations: [],
    vcsSettings: [],
    distribution: null,
    jiraComponentConfigs: [],
    escrowConfiguration: null,
    ...overrides,
  } as ComponentDetail
}

function makeMutation(mutateFn = vi.fn()) {
  return {
    mutateAsync: mutateFn,
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    data: undefined,
    variables: undefined,
    status: 'idle',
    reset: vi.fn(),
    mutate: vi.fn(),
    context: undefined,
    failureCount: 0,
    failureReason: null,
    isIdle: true,
    isPaused: false,
    submittedAt: 0,
  } as unknown as UseMutationResult<ComponentDetail, Error, ComponentUpdateRequest>
}

function renderTab(component: ComponentDetail, mutateAsync = vi.fn()) {
  const toast = vi.fn()
  const mutation = makeMutation(mutateAsync)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <BuildTab component={component} updateMutation={mutation} toast={toast} />
    </QueryClientProvider>
  )
  return { toast, mutateAsync, ...utils }
}

// ─── 1. REPLACE-regression test (mandatory) ────────────────────────────────
// Proves fetch-merge-send: changing gradleVersion must NOT wipe other metadata
// keys (mavenVersion, buildTasks). This is the canary for the wholesale-REPLACE
// risk documented in ComponentManagementServiceImpl.kt:179.
describe('BuildTab — metadata REPLACE-regression (§7.0 critical)', () => {
  it('preserves existing metadata keys when saving gradleVersion change', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      buildConfigurations: [
        {
          id: 'bc-1',
          buildSystem: 'GRADLE',
          buildFilePath: 'build.gradle',
          javaVersion: '17',
          deprecated: false,
          metadata: {
            gradleVersion: '8.5',
            mavenVersion: '3.9',
            buildTasks: 'clean build',
          },
        },
      ] as ComponentDetail['buildConfigurations'],
    })

    const { getByPlaceholderText, getByText } = renderTab(component, mutateFn)

    const gradleInput = getByPlaceholderText('8.6')
    await userEvent.clear(gradleInput)
    await userEvent.type(gradleInput, '8.6')

    const saveButton = getByText('Save Build')
    await userEvent.click(saveButton)

    expect(mutateFn).toHaveBeenCalledOnce()
    const callArg = mutateFn.mock.calls[0]![0] as ComponentUpdateRequest
    const sentMetadata = callArg.buildConfiguration?.metadata as Record<string, unknown>

    // The new value must be present
    expect(sentMetadata.gradleVersion).toBe('8.6')
    // Pre-existing keys MUST be preserved — this is the regression assertion
    expect(sentMetadata.mavenVersion).toBe('3.9')
    expect(sentMetadata.buildTasks).toBe('clean build')
  })

  it('removes gradleVersion key when input cleared', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const component = makeComponent({
      buildConfigurations: [
        {
          id: 'bc-1',
          buildSystem: 'GRADLE',
          buildFilePath: '',
          javaVersion: '',
          deprecated: false,
          metadata: { gradleVersion: '8.5', mavenVersion: '3.9' },
        },
      ] as ComponentDetail['buildConfigurations'],
    })

    const { getByPlaceholderText, getByText } = renderTab(component, mutateFn)

    const gradleInput = getByPlaceholderText('8.6')
    await userEvent.clear(gradleInput)

    await userEvent.click(getByText('Save Build'))

    expect(mutateFn).toHaveBeenCalledOnce()
    const sentMetadata = (mutateFn.mock.calls[0]![0] as ComponentUpdateRequest).buildConfiguration?.metadata as Record<string, unknown>
    expect('gradleVersion' in sentMetadata).toBe(false)
    // mavenVersion must still be there
    expect(sentMetadata.mavenVersion).toBe('3.9')
  })
})

// ─── 2. Build Tools render — string-encoded fixture ────────────────────────
describe('BuildTab — Build Tools read-only display', () => {
  it('renders build tools from JSON-encoded string (wire format)', () => {
    const component = makeComponent({
      buildConfigurations: [
        {
          id: 'bc-1',
          buildSystem: 'GRADLE',
          buildFilePath: '',
          javaVersion: '',
          deprecated: false,
          metadata: {
            buildTools: '[{"type":"odbc","version":"12.2"},{"type":"oracleDatabase","version":"11.2","edition":"ENTERPRISE"}]',
          },
        },
      ] as ComponentDetail['buildConfigurations'],
    })

    renderTab(component)

    // Both type badges must be present
    expect(screen.getByText('odbc')).toBeDefined()
    expect(screen.getByText('oracleDatabase')).toBeDefined()
    // Summary fields
    expect(screen.getByText('version 12.2')).toBeDefined()
    expect(screen.getAllByText(/version 11\.2/).length).toBeGreaterThan(0)
    expect(screen.getByText(/ENTERPRISE/)).toBeDefined()
  })

  it('renders build tools from native array (defensive path)', () => {
    const component = makeComponent({
      buildConfigurations: [
        {
          id: 'bc-1',
          buildSystem: 'GRADLE',
          buildFilePath: '',
          javaVersion: '',
          deprecated: false,
          metadata: {
            buildTools: [{ type: 'odbc', version: '12.2' }],
          },
        },
      ] as ComponentDetail['buildConfigurations'],
    })

    renderTab(component)

    expect(screen.getByText('odbc')).toBeDefined()
    expect(screen.getByText('version 12.2')).toBeDefined()
  })

  it('falls back to truncated JSON.stringify for unknown build tool subtype', () => {
    const component = makeComponent({
      buildConfigurations: [
        {
          id: 'bc-1',
          buildSystem: 'GRADLE',
          buildFilePath: '',
          javaVersion: '',
          deprecated: false,
          metadata: {
            buildTools: [{ type: 'futureSubtype', someField: 'someValue' }],
          },
        },
      ] as ComponentDetail['buildConfigurations'],
    })

    renderTab(component)

    expect(screen.getByText('futureSubtype')).toBeDefined()
    // The unknown fallback renders JSON.stringify summary containing the field
    expect(screen.getByText(/someValue/)).toBeDefined()
  })

  it('shows no-tools message when buildTools is empty', () => {
    const component = makeComponent({
      buildConfigurations: [
        {
          id: 'bc-1',
          buildSystem: 'GRADLE',
          buildFilePath: '',
          javaVersion: '',
          deprecated: false,
          metadata: { buildTools: [] },
        },
      ] as ComponentDetail['buildConfigurations'],
    })

    renderTab(component)

    expect(screen.getByText('No build tools configured.')).toBeDefined()
  })

  it('does NOT render add/edit/remove buttons for build tools', () => {
    const component = makeComponent({
      buildConfigurations: [
        {
          id: 'bc-1',
          buildSystem: 'GRADLE',
          buildFilePath: '',
          javaVersion: '',
          deprecated: false,
          metadata: {
            buildTools: [{ type: 'odbc', version: '12.2' }],
          },
        },
      ] as ComponentDetail['buildConfigurations'],
    })

    renderTab(component)

    expect(screen.queryByRole('button', { name: /add/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })
})

// ─── 3. Tools section ────────────────────────────────────────────────────────
describe('BuildTab — Tools read-only section', () => {
  it('renders tools section when metadata.tools is non-empty', () => {
    const component = makeComponent({
      buildConfigurations: [
        {
          id: 'bc-1',
          buildSystem: 'GRADLE',
          buildFilePath: '',
          javaVersion: '',
          deprecated: false,
          metadata: {
            tools: [
              {
                name: 'my-tool',
                sourceLocation: '/src/tools/my-tool',
                targetLocation: '/opt/tools/my-tool',
              },
            ],
          },
        },
      ] as ComponentDetail['buildConfigurations'],
    })

    renderTab(component)

    expect(screen.getByText('my-tool')).toBeDefined()
    expect(screen.getByText(/\/src\/tools\/my-tool.*\/opt\/tools\/my-tool/)).toBeDefined()
  })

  it('does NOT render tools section when metadata.tools is empty/absent', () => {
    const component = makeComponent({
      buildConfigurations: [
        {
          id: 'bc-1',
          buildSystem: 'GRADLE',
          buildFilePath: '',
          javaVersion: '',
          deprecated: false,
          metadata: {},
        },
      ] as ComponentDetail['buildConfigurations'],
    })

    renderTab(component)

    // The standalone "Tools (read-only)" heading (metadata.tools section) must not appear.
    // "Build Tools (read-only)" always renders; we check for the exact "Tools (read-only)" text only.
    const allMatches = screen.queryAllByText(/Tools \(read-only\)/i)
    // Only "Build Tools (read-only)" heading should be present, not a standalone "Tools (read-only)"
    const standaloneToolsHeading = allMatches.filter(
      (el) => el.textContent?.trim() === 'Tools (read-only)'
    )
    expect(standaloneToolsHeading).toHaveLength(0)
  })
})

// ─── 4. Existing structure preserved ────────────────────────────────────────
describe('BuildTab — existing structure preserved', () => {
  it('renders Build System, Java Version, Deprecated controls', () => {
    const component = makeComponent({
      buildConfigurations: [
        {
          id: 'bc-1',
          buildSystem: 'MAVEN',
          buildFilePath: 'pom.xml',
          javaVersion: '17',
          deprecated: false,
          metadata: {},
        },
      ] as ComponentDetail['buildConfigurations'],
    })

    renderTab(component)

    expect(screen.getByText('Build System')).toBeDefined()
    expect(screen.getByText('Java Version')).toBeDefined()
    expect(screen.getByText('Deprecated')).toBeDefined()
    expect(screen.getByText('Gradle Version')).toBeDefined()
    expect(screen.getByText('Save Build')).toBeDefined()
  })
})
