import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { MiscTab } from './MiscTab'
import type { GeneralFormValues } from './GeneralTab'
import { TooltipProvider } from '../ui/tooltip'
import type { ComponentDetail } from '../../lib/types'

// ComponentSelect (parent picker) pulls its option list from useComponents.
vi.mock('../../hooks/useComponents', () => ({
  useComponents: vi.fn(() => ({ data: { content: [], totalElements: 0 } })),
}))

// useFieldConfigEntry mock — controls visibility-gating per test. Default: editable.
const mockUseFieldConfigEntry = vi.fn()
vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigOptions: () => ({ options: [], isLoading: false }),
  useFieldConfigEntry: (fieldPath: string) => mockUseFieldConfigEntry(fieldPath),
  // FieldLabelText dependency — label overrides are exercised by the
  // Escrow/Build/Vcs tab tests; here the fallback text is enough.
  useFieldLabel: (_path: string, fallback: string) => fallback,
}))

function baseComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1',
    name: 'my-component',
    displayName: 'My Component',
    componentOwner: 'alice',
    productType: '',
    systems: [],
    clientCode: null,
    solution: false,
    parentComponentName: null,
    archived: false,
    version: 0,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as ComponentDetail
}

function makeEntry(visibility: 'editable' | 'readonly' | 'hidden' = 'editable') {
  return { entry: { visibility, required: false }, isLoading: false, isError: false }
}

function Harness({
  component,
  formRef,
}: {
  component: ComponentDetail
  formRef?: React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
}) {
  const form = useForm<GeneralFormValues>({
    defaultValues: {
      name: component.name,
      displayName: component.displayName ?? '',
      componentOwner: component.componentOwner ?? '',
      productType: component.productType ?? '',
      systems: component.systems ?? [],
      labels: component.labels ?? [],
      clientCode: component.clientCode ?? '',
      solution: component.solution ?? false,
      archived: component.archived,
      parentComponentName: component.parentComponentName ?? '',
      canBeParent: component.canBeParent ?? false,
      releaseManager: component.releaseManager ?? [],
      securityChampion: component.securityChampion ?? [],
      copyright: component.copyright ?? '',
      docs: [],
      artifactIds: [],
    },
  })
  if (formRef) formRef.current = form
  return <MiscTab component={component} form={form} />
}

beforeEach(() => {
  mockUseFieldConfigEntry.mockImplementation(() => makeEntry('editable'))
})

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  )
}

describe('MiscTab parentComponentName', () => {
  it('renders parentComponentName pre-filled with the current value', () => {
    renderWithProviders(<Harness component={baseComponent({ parentComponentName: 'platform-core' })} />)
    const input = screen.getByLabelText(/^parent component$/i) as HTMLInputElement
    expect(input.value).toBe('platform-core')
  })

  it('renders an empty parent input when the component has no parent', () => {
    renderWithProviders(<Harness component={baseComponent({ parentComponentName: null })} />)
    const input = screen.getByLabelText(/^parent component$/i) as HTMLInputElement
    expect(input.value).toBe('')
  })

  it('lets the user type a new parent value and surfaces it via the form', async () => {
    renderWithProviders(<Harness component={baseComponent({ parentComponentName: 'old-parent' })} />)
    const input = screen.getByLabelText(/^parent component$/i) as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, 'new-parent')
    await waitFor(() => expect(input.value).toBe('new-parent'))
  })
})

describe('MiscTab canBeParent + group key', () => {
  it('canBeParent switch reflects the component flag and is editable', () => {
    renderWithProviders(<Harness component={baseComponent({ canBeParent: true })} />)
    const sw = screen.getByLabelText(/^can be a parent$/i) as HTMLButtonElement
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Can be a parent')).toBeDefined()
    expect(screen.getByText(/not an aggregator/i)).toBeDefined()
  })

  it('a canBeParent component with no parent: the parent picker is disabled', () => {
    renderWithProviders(<Harness component={baseComponent({ canBeParent: true, parentComponentName: null })} />)
    const parentInput = screen.getByLabelText(/^parent component$/i) as HTMLInputElement
    expect(parentInput.disabled).toBe(true)
  })

  it('a grandfathered canBeParent component WITH a parent: read-only value + Clear button', async () => {
    const formRef = React.createRef<
      ReturnType<typeof useForm<GeneralFormValues>> | null
    >() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    renderWithProviders(
      <Harness
        component={baseComponent({ canBeParent: true, parentComponentName: 'legacy-parent' })}
        formRef={formRef}
      />,
    )
    const parentInput = screen.getByLabelText(/^parent component$/i) as HTMLInputElement
    expect(parentInput.value).toBe('legacy-parent')
    expect(parentInput.disabled).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: /^clear$/i }))
    expect(formRef.current!.getValues('parentComponentName')).toBe('')
  })

  it('group key renders READ-ONLY with the derived group value', () => {
    renderWithProviders(
      <Harness component={baseComponent({ group: { groupKey: 'org.example.alpha', isFake: false, role: 'MEMBER' } })} />,
    )
    const input = screen.getByLabelText(/^group key$/i) as HTMLInputElement
    expect(input.value).toBe('org.example.alpha')
    expect(input.disabled).toBe(true)
    const label = screen.getByText(/group key/i)
    expect(label.textContent).not.toContain('*')
  })

  it('groupId hidden → group key input NOT rendered', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) =>
      path === 'component.groupId' ? makeEntry('hidden') : makeEntry('editable'),
    )
    renderWithProviders(
      <Harness component={baseComponent({ group: { groupKey: 'org.example.alpha', isFake: false, role: 'MEMBER' } })} />,
    )
    expect(screen.queryByLabelText(/^group key$/i)).toBeNull()
  })
})

describe('MiscTab field descriptions (FieldInfo)', () => {
  const EXPECTED_PATHS = ['component.parentComponentName', 'component.canBeParent', 'component.groupId']

  it('renders exactly one info icon per described field', () => {
    renderWithProviders(
      <Harness component={baseComponent({ group: { groupKey: 'org.example.alpha', isFake: false, role: 'MEMBER' } })} />,
    )
    for (const path of EXPECTED_PATHS) {
      expect(
        document.querySelectorAll(`[data-field-path="${path}"]`),
        `info icon for ${path}`,
      ).toHaveLength(1)
    }
  })
})
