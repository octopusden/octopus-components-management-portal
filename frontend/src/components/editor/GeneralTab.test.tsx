import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { GeneralTab, type GeneralFormValues } from './GeneralTab'
import { TooltipProvider } from '../ui/tooltip'
import { fieldDescriptions } from '../../lib/fieldDescriptions'
import type { ComponentDetail } from '../../lib/types'

// Stub the live data sources behind the embedded ui pickers so this file stays
// focused on the GeneralTab rendering contract for 7.1.5 (parentComponentName
// editable) and downstream tests for owner/enum/field-overrides remain isolated.
vi.mock('../../hooks/useOwners', () => ({
  useOwners: () => ({ data: [] }),
}))
vi.mock('../../hooks/useEmployees', () => ({
  lookupEmployee: vi.fn(),
  useEmployeeStatuses: () => ({ data: { alice: false, 'rm-inactive': false, 'sc-active': true } }),
}))
vi.mock('../../hooks/useComponents', () => ({
  useComponents: vi.fn(() => ({ data: { content: [], totalElements: 0 } })),
}))

// Dictionary mocks. Task #14: system is a single-select EnumSelect whose
// options come from useSystemsDictionary (full dictionary endpoint) via
// the new optionsOverride prop — NOT the in-use endpoint that
// useFieldOptions falls back to. Labels stays chips with its own dict.
const mockUseSystemsDictionary = vi.fn(() => ({ data: ['SYS1', 'SYS2', 'SYS_NEW_DICT_ONLY'], isLoading: false, isError: false }))
const mockUseLabelsDictionary = vi.fn(() => ({ data: ['backend', 'internal', 'frontend'], isLoading: false, isError: false }))
vi.mock('../../hooks/useSystemsDictionary', () => ({
  useSystemsDictionary: () => mockUseSystemsDictionary(),
}))
vi.mock('../../hooks/useLabelsDictionary', () => ({
  useLabelsDictionary: () => mockUseLabelsDictionary(),
}))

// useComponentEditors mock — the read-only "who can edit" projection. Default editable test
// data; the field renders a comma-joined owner + RMs + SCs list.
const mockUseComponentEditors = vi.fn(() => ({
  data: { componentOwner: 'alice', releaseManagers: ['rm-1'], securityChampions: ['sc-1'] },
  isLoading: false,
}))
vi.mock('../../hooks/useComponentEditors', () => ({
  useComponentEditors: () => mockUseComponentEditors(),
}))

// useFieldConfigEntry mock — controls visibility-gating per test.
// Default: all fields 'editable'. Tests can override per field via mockReturnValue.
const mockUseFieldConfigEntry = vi.fn()
vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigOptions: () => ({ options: [], isLoading: false }),
  useFieldConfigEntry: (fieldPath: string) => mockUseFieldConfigEntry(fieldPath),
}))

// Render a queryable marker so tests can assert presence/absence per attribute.
vi.mock('./FieldOverrideInline', () => ({
  FieldOverrideInline: ({ overriddenAttribute }: { overriddenAttribute: string }) => (
    <span data-testid={`field-override-inline-${overriddenAttribute}`} />
  ),
}))

// Stub useCurrentUser so each test pins the role/permission set under test.
// The 7.1.4 rename surface depends on the JWT-derived RENAME_COMPONENTS
// permission: ROLE_ADMIN holds it; ROLE_COMPONENTS_REGISTRY_EDITOR / VIEWER do not.
const mockUseCurrentUser = vi.fn()
vi.mock('../../hooks/useCurrentUser', () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}))

function baseComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1',
    name: 'my-component',
    displayName: 'My Component',
    componentOwner: 'alice',
    productType: '',
    system: null,
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

/** Returns an entry object with the given visibility (defaults to editable). */
function makeEntry(visibility: 'editable' | 'readonly' | 'hidden' = 'editable') {
  return { entry: { visibility, required: false }, isLoading: false, isError: false }
}

/** Default mock: all fields editable. */
function setAllEditable() {
  mockUseFieldConfigEntry.mockImplementation(() => makeEntry('editable'))
}

function Harness({ component, formRef }: { component: ComponentDetail; formRef?: React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null> }) {
  const form = useForm<GeneralFormValues>({
    defaultValues: {
      name: component.name,
      displayName: component.displayName ?? '',
      componentOwner: component.componentOwner ?? '',
      productType: component.productType ?? '',
      // CRS PR #301: system is scalar `string | null` end-to-end (DTO +
      // form). Hydrate directly; the array-wrap bridge from PR #45 is gone.
      system: component.system ?? '',
      labels: component.labels ?? [],
      clientCode: component.clientCode ?? '',
      solution: component.solution ?? false,
      archived: component.archived,
      parentComponentName: component.parentComponentName ?? '',
      canBeParent: component.canBeParent ?? false,
      releaseManager: component.releaseManager ?? [],
      securityChampion: component.securityChampion ?? [],
      copyright: component.copyright ?? '',
      docs: (component.docs ?? []).map((d) => ({
        docComponentKey: d.docComponentKey,
        majorVersion: d.majorVersion ?? '',
      })),
      artifactIds: (component.artifactIds ?? []).map((a) => ({
        groupPattern: a.groupPattern,
        artifactPattern: a.artifactPattern,
      })),
    },
  })
  if (formRef) formRef.current = form
  return <GeneralTab component={component} form={form} />
}

beforeEach(() => {
  // Default to admin so the established 7.1.5 tests don't need to opt-in.
  // Tests that care about permission gating override per-test below.
  mockUseCurrentUser.mockReturnValue({ data: ADMIN_USER, isLoading: false, isError: false })
  // Default: all fields editable
  setAllEditable()
})

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // TooltipProvider mirrors the app-root provider (App.tsx) required by the
  // FieldInfo description tooltips rendered next to the field labels.
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  )
}

// User shape mirrors /auth/me — `roles` is an array of {name, permissions}.
// hasPermission flattens the per-role permission lists. RENAME_COMPONENTS is
// granted to ROLE_ADMIN only (per CRS application-common.yml octopus-security.roles).
const ADMIN_USER = {
  username: 'alice',
  roles: [
    {
      name: 'ROLE_ADMIN',
      permissions: [
        'ACCESS_COMPONENTS',
        'CREATE_COMPONENTS',
        'ARCHIVE_COMPONENTS',
        'RENAME_COMPONENTS',
        'DELETE_COMPONENTS',
        'IMPORT_DATA',
        'ACCESS_AUDIT',
      ],
    },
  ],
  groups: [],
}
const EDITOR_USER = {
  username: 'bob',
  roles: [
    {
      name: 'ROLE_COMPONENTS_REGISTRY_EDITOR',
      permissions: ['ACCESS_COMPONENTS', 'CREATE_COMPONENTS', 'ACCESS_AUDIT'],
    },
  ],
  groups: [],
}

// parentComponentName / canBeParent / group-key tests moved to MiscTab.test.tsx (those
// fields now render on the Misc tab).

describe('GeneralTab rename (B7.1.4)', () => {
  it('admin with RENAME_COMPONENTS sees an editable Name input pre-filled with the current name', () => {
    mockUseCurrentUser.mockReturnValue({ data: ADMIN_USER, isLoading: false, isError: false })
    const component = baseComponent({ name: 'orig-name' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/^component key$/i) as HTMLInputElement
    expect(input).toBeDefined()
    expect(input.disabled).toBe(false)
    expect(input.value).toBe('orig-name')
  })

  it('editor without RENAME_COMPONENTS sees the Name input disabled with explanatory hint', () => {
    mockUseCurrentUser.mockReturnValue({ data: EDITOR_USER, isLoading: false, isError: false })
    const component = baseComponent({ name: 'orig-name' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/^component key$/i) as HTMLInputElement
    expect(input).toBeDefined()
    expect(input.disabled).toBe(true)
    expect(input.value).toBe('orig-name')
    // The disabled hint should mention RENAME_COMPONENTS so the user understands
    // why the field is locked rather than treating "disabled" as "read-only forever".
    expect(screen.getByText(/RENAME_COMPONENTS/i)).toBeDefined()
  })

  it('admin can edit the Name input and the form picks up the new value', async () => {
    mockUseCurrentUser.mockReturnValue({ data: ADMIN_USER, isLoading: false, isError: false })
    const component = baseComponent({ name: 'orig-name' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/^component key$/i) as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, 'renamed-component')

    await waitFor(() => expect(input.value).toBe('renamed-component'))
  })

  it('viewer (no permissions beyond ACCESS_COMPONENTS) cannot edit Name', () => {
    mockUseCurrentUser.mockReturnValue({
      data: {
        username: 'carol',
        roles: [{ name: 'ROLE_COMPONENTS_REGISTRY_VIEWER', permissions: ['ACCESS_COMPONENTS', 'ACCESS_AUDIT'] }],
        groups: [],
      },
      isLoading: false,
      isError: false,
    })
    const component = baseComponent({ name: 'orig-name' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/^component key$/i) as HTMLInputElement
    expect(input.disabled).toBe(true)
  })
})

// ── Visibility-gating (§7.0/2c critical contract) ─────────────────────────────

describe('GeneralTab visibility-gating', () => {
  it('clientCode hidden → input NOT rendered', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.clientCode') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({ clientCode: 'ACME' })
    renderWithProviders(<Harness component={component} />)

    expect(screen.queryByLabelText(/^client code$/i)).toBeNull()
  })

  it('clientCode readonly → input rendered disabled', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.clientCode') return makeEntry('readonly')
      return makeEntry('editable')
    })
    const component = baseComponent({ clientCode: 'ACME' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/^client code$/i) as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('clientCode editable → input rendered enabled', () => {
    setAllEditable()
    const component = baseComponent({ clientCode: 'ACME' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/^client code$/i) as HTMLInputElement
    expect(input.disabled).toBe(false)
  })

  it('system hidden → System single-select NOT rendered (task #14)', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.system') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({ system: 'SYS1' })
    renderWithProviders(<Harness component={component} />)

    // EnumSelect renders a SelectTrigger with role=combobox labelled
    // by the outer <Label htmlFor="component-system">. Hidden → no label.
    expect(screen.queryByText(/^system$/i)).toBeNull()
  })

  it('system readonly → System single-select rendered disabled (task #14)', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.system') return makeEntry('readonly')
      return makeEntry('editable')
    })
    const component = baseComponent({ system: 'SYS1' })
    renderWithProviders(<Harness component={component} />)

    // EnumSelect renders a SelectTrigger (Radix) with role=combobox.
    // Disabled→ Radix sets `data-disabled` on the trigger.
    const trigger = screen.getByLabelText(/^system$/i)
    expect(
      trigger.hasAttribute('disabled') || trigger.getAttribute('data-disabled') !== null,
    ).toBe(true)
  })

  it('componentOwner hidden → Ownership section NOT rendered', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.componentOwner') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({ componentOwner: 'alice' })
    renderWithProviders(<Harness component={component} />)

    expect(screen.queryByLabelText(/^component owner$/i)).toBeNull()
  })

  it('displayName hidden → Display Name input NOT rendered', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.displayName') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({ displayName: 'Test' })
    renderWithProviders(<Harness component={component} />)

    expect(screen.queryByLabelText(/^display name$/i)).toBeNull()
  })

  it('productType EnumSelect is NOT rendered in GeneralTab (migrated to EscrowTab)', () => {
    setAllEditable()
    const component = baseComponent({ productType: 'TYPE_A' })
    renderWithProviders(<Harness component={component} />)

    // productType should not appear in GeneralTab at all
    expect(screen.queryByText(/product type/i)).toBeNull()
  })
})

// ── system-field-hidden → undefined (not []) ──────────────────────────────────
// The actual save-payload filtering lives in ComponentDetailPage.tsx, but we
// verify the form value contract: when system is hidden the field is still
// registered (setValue called with original value) but the save handler is
// responsible for mapping it to undefined. This test verifies the form renders
// the expected structure so the page-level filter can operate correctly.
describe('GeneralTab system field hidden → form value contract (CRS #301)', () => {
  it('when system is hidden, the form still initialises system from component.system (page filters to undefined on save)', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.system') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ system: 'SYS1' })
    renderWithProviders(<Harness component={component} formRef={formRef} />)

    // EnumSelect not rendered (hidden)
    expect(screen.queryByText(/^system$/i)).toBeNull()
    // Scalar form field hydrates directly from `component.system`.
    const val = formRef.current?.getValues('system')
    expect(val).toBe('SYS1')
  })
})

describe('GeneralTab SYS-039 fields (Wave 2 PR-G)', () => {
  it('annotates inactive people across owner and ordered lists', () => {
    const component = baseComponent({
      componentOwner: 'alice',
      releaseManager: ['rm-inactive'],
      securityChampion: ['sc-active'],
    })
    renderWithProviders(<Harness component={component} />)

    expect(screen.getAllByText('Inactive')).toHaveLength(2)
  })

  // group-key read-only + groupId-hidden tests moved to MiscTab.test.tsx.

  it('releaseManager editable → PeopleListInput hydrates ordered rows from the array', () => {
    setAllEditable()
    const component = baseComponent({ releaseManager: ['rm-1', 'rm-2'] })
    renderWithProviders(<Harness component={component} />)

    // PeopleListInput renders one row per person, each with an aria-labelled
    // Remove button. Two people stored → two remove buttons.
    expect(screen.getByRole('button', { name: /^remove rm-1$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^remove rm-2$/i })).toBeDefined()
  })

  it('renders PLURAL labels "Release Managers" / "Security Champions"', () => {
    setAllEditable()
    const component = baseComponent({ releaseManager: ['rm-1'], securityChampion: ['sc-1'] })
    renderWithProviders(<Harness component={component} />)

    // Exact plural text (field keys / JSON names stay singular; only labels change).
    expect(screen.getByText('Release Managers')).toBeDefined()
    expect(screen.getByText('Security Champions')).toBeDefined()
  })

  it('releaseManager readonly → joined comma list rendered disabled', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.releaseManager') return makeEntry('readonly')
      return makeEntry('editable')
    })
    const component = baseComponent({ releaseManager: ['rm-a', 'rm-b'] })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/^release managers$/i) as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(input.value).toBe('rm-a, rm-b')
  })

  it('securityChampion hidden → input NOT rendered', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.securityChampion') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({ securityChampion: ['sc-user'] })
    renderWithProviders(<Harness component={component} />)

    expect(screen.queryByLabelText(/^security champions?$/i)).toBeNull()
  })

  it('reordering a release manager updates the ordered form value (keyboard drag down)', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ releaseManager: ['rm-1', 'rm-2'] })
    renderWithProviders(<Harness component={component} formRef={formRef} />)

    // The arrow buttons are gone — reorder is now drag-and-drop via the row
    // grip (dnd-kit). KeyboardSensor needs non-zero layout rects, which jsdom
    // does not provide, so give each PeopleListInput row a vertical slot keyed
    // off its data-testid.
    const rectSpy = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: Element) {
        const m = /^person-row-(\d+)$/.exec(this.getAttribute('data-testid') ?? '')
        const top = m ? Number(m[1]) * 40 : 0
        return {
          x: 0,
          y: top,
          top,
          bottom: top + (m ? 40 : 0),
          left: 0,
          right: 200,
          width: m ? 200 : 0,
          height: m ? 40 : 0,
          toJSON: () => ({}),
        } as DOMRect
      })
    try {
      // Lift rm-1's grip (Space on the activator), ArrowDown, drop → [rm-2, rm-1].
      const grip = screen.getByRole('button', { name: /^drag rm-1 to reorder$/i })
      grip.focus()
      fireEvent.keyDown(grip, { key: ' ', code: 'Space' })
      // KeyboardSensor adds its document keydown listener on a setTimeout(0).
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25))
      })
      fireEvent.keyDown(document.body, { key: 'ArrowDown', code: 'ArrowDown' })
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      fireEvent.keyDown(document.body, { key: ' ', code: 'Space' })
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      await waitFor(() => {
        expect(formRef.current?.getValues('releaseManager')).toEqual(['rm-2', 'rm-1'])
      })
    } finally {
      rectSpy.mockRestore()
    }
  })

  it('copyright editable → input rendered with current value', () => {
    setAllEditable()
    const component = baseComponent({ copyright: '(c) 2026 Acme Inc.' })
    renderWithProviders(<Harness component={component} />)

    const input = screen.getByLabelText(/^copyright$/i) as HTMLInputElement
    expect(input.value).toBe('(c) 2026 Acme Inc.')
  })

  it('labels editable → chips UX renders one badge per stored label (task #9)', () => {
    setAllEditable()
    const component = baseComponent({ labels: ['backend', 'internal'] })
    renderWithProviders(<Harness component={component} />)

    // The chips primitive renders each value as a Badge plus an aria-
    // labelled remove button. Two labels stored → two remove buttons.
    expect(screen.getByRole('button', { name: /^remove backend$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^remove internal$/i })).toBeDefined()
  })

  it('labels readonly → × buttons + add control disabled (task #9 integration)', () => {
    // Parity with the System readonly test: when field-config marks labels
    // readonly, both the per-chip × buttons and the add control must be
    // disabled. The integration path matters — ChipsInput's `disabled`
    // unit test covers the prop, but the GeneralTab gate that wires
    // `labelsEntry.visibility === 'readonly'` to that prop is what we're
    // pinning here.
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.labels') return makeEntry('readonly')
      return makeEntry('editable')
    })
    const component = baseComponent({ labels: ['backend'] })
    renderWithProviders(<Harness component={component} />)

    const removeBackend = screen.getByRole('button', { name: /^remove backend$/i }) as HTMLButtonElement
    expect(removeBackend.disabled).toBe(true)
    const addControl = screen.getByLabelText(/^add label$/i) as HTMLSelectElement
    expect(addControl.disabled).toBe(true)
  })

  it('all SYS-039 entries hidden → none of the SYS-039 controls render', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (
        path === 'component.releaseManager' ||
        path === 'component.securityChampion' ||
        path === 'component.copyright' ||
        path === 'component.labels'
      ) {
        return makeEntry('hidden')
      }
      return makeEntry('editable')
    })
    const component = baseComponent({
      releaseManager: ['rm'],
      securityChampion: ['sc'],
      copyright: '(c)',
      labels: ['x'],
    })
    renderWithProviders(<Harness component={component} />)

    expect(screen.queryByLabelText(/^release managers?$/i)).toBeNull()
    expect(screen.queryByLabelText(/^security champions?$/i)).toBeNull()
    expect(screen.queryByLabelText(/^copyright$/i)).toBeNull()
    // labels — hidden hides both the <Label> and the multi-select.
    expect(screen.queryByText(/^labels$/i)).toBeNull()
  })
})

// ── Server-side 400 inline error display (S3.1a) ──────────────────────────────
// When ComponentDetailPage catches a 400 it calls form.setError for fields in
// GENERAL_TAB_FIELDS. The GeneralTab must render those errors inline next to
// the relevant input.

describe('GeneralTab server error display (S3.1a)', () => {
  it('setError("componentOwner") renders the message inline below the field', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    renderWithProviders(<Harness component={baseComponent()} formRef={formRef} />)

    await act(async () => {
      formRef.current?.setError('componentOwner', { type: 'server', message: 'must not be blank' })
    })

    await waitFor(() => {
      expect(screen.getByText('must not be blank')).toBeDefined()
    })
  })

  it('setError("name") renders the message and suppresses the rename hint', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    renderWithProviders(<Harness component={baseComponent({ name: 'x' })} formRef={formRef} />)

    await act(async () => {
      formRef.current?.setError('name', { type: 'server', message: 'must not be blank' })
    })

    await waitFor(() => {
      expect(screen.getByText('must not be blank')).toBeDefined()
      // Rename hint must not appear alongside the error
      expect(screen.queryByText(/canonical identifier/i)).toBeNull()
    })
  })

  it('setError("system") renders the message under the System single-select', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    renderWithProviders(<Harness component={baseComponent({ system: 'SYS1' })} formRef={formRef} />)

    await act(async () => {
      formRef.current?.setError('system', { type: 'server', message: 'must not be null' })
    })

    await waitFor(() => {
      expect(screen.getByText('must not be null')).toBeDefined()
    })
  })
})

// ---------------------------------------------------------------------------
// FieldOverride catalogue gating — schema-v2 contract.
//
// CRS schema-v2 only accepts overriddenAttribute strings that map to
// SCALAR_ATTRIBUTE_PATHS (build.*, escrow.*, jira.* — config-row scalars)
// or to one of the six marker names. Component-level fields like
// componentOwner, system, clientCode live on the top-level ComponentDetail
// row, not on component_configurations rows, so POST /field-overrides with
// those attributes returns 400. We must not surface those override buttons.
// ---------------------------------------------------------------------------

describe('GeneralTab — FieldOverrideInline gating (schema-v2 contract)', () => {
  it.each(['componentOwner', 'system', 'clientCode'])(
    'does not render FieldOverrideInline for component-level field %s',
    (attribute) => {
      renderWithProviders(<Harness component={baseComponent()} />)
      expect(
        screen.queryByTestId(`field-override-inline-${attribute}`),
      ).toBeNull()
    },
  )
})

// ---------------------------------------------------------------------------
// task #14: system → single-select EnumSelect; labels stays chips.
// ---------------------------------------------------------------------------

describe('GeneralTab — system single-select + labels chips (task #14)', () => {
  it('hydrates system single-select from component.system[0] (task #14)', () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ system: 'SYS1' })
    renderWithProviders(<Harness component={component} formRef={formRef} />)
    // Form value is the scalar 'SYS1', not ['SYS1'].
    expect(formRef.current?.getValues('system')).toBe('SYS1')
  })

  it('System single-select offers values from the FULL dictionary, not just in-use values (task #14, Sonnet review finding)', async () => {
    // The dictionary endpoint surfaces values an admin defined but no
    // component is yet attached to. If the editor offered only in-use
    // values, those new dictionary entries would be invisible until
    // someone wired them to a component via a separate path. The mock
    // useSystemsDictionary returns `SYS_NEW_DICT_ONLY` which has no
    // component reference — verify the dropdown still surfaces it.
    setAllEditable()
    const component = baseComponent({ system: 'SYS1' })
    renderWithProviders(<Harness component={component} />)

    // Open the single-select trigger and confirm the dictionary-only
    // option is offered. (Radix Select renders options in a portal on
    // open; under jsdom the trigger click materialises them.)
    const trigger = screen.getByLabelText(/^system$/i)
    await userEvent.click(trigger)
    // The dict-only option must be listed alongside the in-use values.
    expect(screen.getByRole('option', { name: 'SYS_NEW_DICT_ONLY' })).toBeDefined()
  })

  it('hydrates the single-select from the scalar component.system field (CRS #301)', () => {
    // Single-value scalar both in the DTO (CRS PR #301) and in the form.
    // The hydration useEffect mirrors `component.system` directly into
    // the EnumSelect's controlled value.
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ system: 'SYS_A' })
    renderWithProviders(<Harness component={component} formRef={formRef} />)
    expect(formRef.current?.getValues('system')).toBe('SYS_A')
  })

  it('hydrates labels chips from component.labels and clicking × removes the chip (task #9)', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ labels: ['backend', 'internal'] })
    renderWithProviders(<Harness component={component} formRef={formRef} />)

    const removeBackend = screen.getByRole('button', { name: /^remove backend$/i })
    await userEvent.click(removeBackend)

    await waitFor(() => {
      expect(formRef.current?.getValues('labels')).toEqual(['internal'])
    })
  })

  it('picking a label from the add control appends to form value (task #9)', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ labels: ['backend'] })
    renderWithProviders(<Harness component={component} formRef={formRef} />)

    const addControl = screen.getByLabelText(/^add label$/i) as HTMLSelectElement
    await userEvent.selectOptions(addControl, 'frontend')

    await waitFor(() => {
      expect(formRef.current?.getValues('labels')).toEqual(['backend', 'frontend'])
    })
  })

  it('renders an inline error below the System single-select when form.setError("system") fires (task #14)', async () => {
    // ComponentDetailPage.handleSave is the source of truth for the
    // "systems is required" guard, but the error needs to surface in
    // GeneralTab's render tree — otherwise the user clicks Save, the page
    // returns early, and the UI gives no visible feedback.
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    renderWithProviders(<Harness component={baseComponent({ system: 'SYS1' })} formRef={formRef} />)

    await act(async () => {
      formRef.current?.setError('system', { type: 'required', message: 'At least one system is required' })
    })

    await waitFor(() => {
      expect(screen.getByText(/at least one system is required/i)).toBeDefined()
    })
  })
})

// ---------------------------------------------------------------------------
// ui-swift-sloth §3.5: Group Key required + disallowed-prefix.
// ---------------------------------------------------------------------------

// group-key + canBeParent + parent-picker tests moved to MiscTab.test.tsx.

describe('GeneralTab field descriptions (FieldInfo)', () => {
  // Exact set of registry paths this tab must expose an info icon for.
  // data-field-path (not the accessible name) is the wiring contract — it
  // catches a duplicated or misassigned path, not just a missing icon.
  const EXPECTED_PATHS = [
    'component.name',
    'component.displayName',
    // parentComponentName / canBeParent / groupId moved to the Misc tab (see MiscTab.test).
    'component.solution',
    'component.componentOwner',
    'component.releaseManager',
    'component.securityChampion',
    'component.system',
    'component.clientCode',
    'component.copyright',
    'component.labels',
    'component.docs',
    'component.artifactIds',
  ]

  it('renders exactly one info icon per described field', () => {
    setAllEditable()
    renderWithProviders(<Harness component={baseComponent()} />)
    for (const path of EXPECTED_PATHS) {
      expect(
        document.querySelectorAll(`[data-field-path="${path}"]`),
        `info icon for ${path}`,
      ).toHaveLength(1)
    }
  })

  it('opens the registry description for Component Key on focus', async () => {
    setAllEditable()
    renderWithProviders(<Harness component={baseComponent()} />)
    const trigger = document.querySelector('[data-field-path="component.name"]') as HTMLElement
    act(() => trigger.focus())
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(fieldDescriptions['component.name']!)
  })
})

describe('GeneralTab — responsible-people (who can edit) field', () => {
  it('renders the read-only owner + RMs + SCs list from useComponentEditors', () => {
    setAllEditable()
    renderWithProviders(<Harness component={baseComponent()} />)
    const input = screen.getByLabelText(/owner, release managers, and security champions/i) as HTMLInputElement
    expect(input.value).toBe('alice, rm-1, sc-1')
    expect(input.disabled).toBe(true)
    expect(screen.getByText(/administrators may also have edit access/i)).toBeDefined()
  })

  it('shows a Loading… placeholder while the editors projection is in flight', () => {
    setAllEditable()
    // mockReturnValue (not Once): GeneralTab re-renders via form.watch, so a one-shot would be
    // consumed before the assertion. This is the last test in the file, so leftover state is moot.
    mockUseComponentEditors.mockReturnValue({ data: undefined as never, isLoading: true })
    renderWithProviders(<Harness component={baseComponent()} />)
    const input = screen.getByLabelText(/owner, release managers, and security champions/i) as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('Loading…')
  })
})
