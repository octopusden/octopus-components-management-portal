import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { GeneralTab, type GeneralFormValues } from './GeneralTab'
import { fromArtifactId } from '../../lib/artifactOwnership'
import { TooltipProvider } from '../ui/tooltip'
import { fieldDescriptions } from '../../lib/fieldDescriptions'
import { lookupEmployee } from '../../hooks/useEmployees'
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

// Dictionary mocks. `systems` is a ChipsInput multi-select whose options
// come from useSystemsDictionary (full dictionary endpoint) — NOT the
// in-use endpoint that useFieldOptions falls back to. Labels stays chips
// with its own dict (rendered in the header, not GeneralTab).
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
const DEFAULT_EDITORS = {
  data: { componentOwner: 'alice', releaseManagers: ['rm-1'], securityChampions: ['sc-1'] },
  isLoading: false,
}
const mockUseComponentEditors = vi.fn(() => DEFAULT_EDITORS)
vi.mock('../../hooks/useComponentEditors', () => ({
  useComponentEditors: () => mockUseComponentEditors(),
}))

// useFieldConfigEntry mock — controls visibility-gating per test.
// Default: all fields 'editable'. Tests can override per field via mockReturnValue.
const mockUseFieldConfigEntry = vi.fn()
vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigOptions: () => ({ options: [], isLoading: false }),
  useFieldConfigEntry: (fieldPath: string) => mockUseFieldConfigEntry(fieldPath),
  // FieldLabelText dependency — label overrides are exercised by the
  // Escrow/Build/Vcs tab tests; here the fallback text is enough.
  useFieldLabel: (_path: string, fallback: string) => fallback,
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

/** Returns an entry object with the given visibility (defaults to editable). */
function makeEntry(visibility: 'editable' | 'readonly' | 'hidden' = 'editable') {
  return { entry: { visibility, required: false }, isLoading: false, isError: false }
}

/** Default mock: all fields editable. */
function setAllEditable() {
  mockUseFieldConfigEntry.mockImplementation(() => makeEntry('editable'))
}

function Harness({ component, formRef, onOwnerValidatingChange, canEdit, classification }: { component: ComponentDetail; formRef?: React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>; onOwnerValidatingChange?: (validating: boolean) => void; canEdit?: boolean; classification?: { explicit: boolean; external: boolean; setExplicit: (v: boolean) => void; setExternal: (v: boolean) => void } }) {
  const form = useForm<GeneralFormValues>({
    defaultValues: {
      name: component.name,
      displayName: component.displayName ?? '',
      componentOwner: component.componentOwner ?? '',
      productType: component.productType ?? '',
      // systems is MULTI-value `string[]` end-to-end (DTO + form), mirroring
      // labels exactly.
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
      docs: (component.docs ?? []).map((d) => ({
        docComponentKey: d.docComponentKey,
        majorVersion: d.majorVersion ?? '',
      })),
      artifactIds: (component.artifactIds ?? []).map(fromArtifactId),
    },
  })
  if (formRef) formRef.current = form
  return <GeneralTab component={component} form={form} canEdit={canEdit} onOwnerValidatingChange={onOwnerValidatingChange} classification={classification} />
}

beforeEach(() => {
  // Default to admin so the established 7.1.5 tests don't need to opt-in.
  // Tests that care about permission gating override per-test below.
  mockUseCurrentUser.mockReturnValue({ data: ADMIN_USER, isLoading: false, isError: false })
  // Default: all fields editable
  setAllEditable()
  // Reset the "who can edit" projection to the populated default — the loading
  // test below installs a sticky mockReturnValue that would otherwise leak forward.
  mockUseComponentEditors.mockReturnValue(DEFAULT_EDITORS)
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

  it('system hidden → systems ChipsInput NOT rendered', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.system') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const component = baseComponent({ systems: ['SYS1'] })
    renderWithProviders(<Harness component={component} />)

    // ChipsInput's add-select is labelled by the outer <Label
    // htmlFor="component-system">. Hidden → no label, no control.
    expect(screen.queryByText(/^system$/i)).toBeNull()
  })

  it('system readonly → systems ChipsInput rendered disabled', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.system') return makeEntry('readonly')
      return makeEntry('editable')
    })
    const component = baseComponent({ systems: ['SYS1'] })
    renderWithProviders(<Harness component={component} />)

    // ChipsInput's add-select carries the `disabled` attribute when the
    // field-config visibility is 'readonly'; the remove buttons are also
    // disabled but the add-select is the element labelled "System".
    const trigger = screen.getByLabelText(/^system$/i)
    expect(trigger.hasAttribute('disabled')).toBe(true)
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

// ── systems-field-hidden → undefined (not sent) ───────────────────────────────
// The actual save-payload filtering lives in buildUpdateRequest, but we
// verify the form value contract: when systems is hidden the field is still
// registered (setValue called with original value) but the save handler is
// responsible for mapping it to undefined. This test verifies the form renders
// the expected structure so the page-level filter can operate correctly.
describe('GeneralTab systems field hidden → form value contract', () => {
  it('when systems is hidden, the form still initialises systems from component.systems (page filters to undefined on save)', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (path === 'component.system') return makeEntry('hidden')
      return makeEntry('editable')
    })
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ systems: ['SYS1'] })
    renderWithProviders(<Harness component={component} formRef={formRef} />)

    // ChipsInput not rendered (hidden)
    expect(screen.queryByText(/^system$/i)).toBeNull()
    // Multi-value form field hydrates directly from `component.systems`.
    const val = formRef.current?.getValues('systems')
    expect(val).toEqual(['SYS1'])
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

  // Labels editing moved to the component header (badges + popover); its tests
  // live in HeaderLabelsEditor.test.tsx. GeneralTab no longer renders labels.

  it('all SYS-039 entries hidden → none of the SYS-039 controls render', () => {
    mockUseFieldConfigEntry.mockImplementation((path: string) => {
      if (
        path === 'component.releaseManager' ||
        path === 'component.securityChampion' ||
        path === 'component.copyright'
      ) {
        return makeEntry('hidden')
      }
      return makeEntry('editable')
    })
    const component = baseComponent({
      releaseManager: ['rm'],
      securityChampion: ['sc'],
      copyright: '(c)',
    })
    renderWithProviders(<Harness component={component} />)

    expect(screen.queryByLabelText(/^release managers?$/i)).toBeNull()
    expect(screen.queryByLabelText(/^security champions?$/i)).toBeNull()
    expect(screen.queryByLabelText(/^copyright$/i)).toBeNull()
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

  it('setError("systems") renders the message under the System ChipsInput', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    renderWithProviders(<Harness component={baseComponent({ systems: ['SYS1'] })} formRef={formRef} />)

    await act(async () => {
      formRef.current?.setError('systems', { type: 'server', message: 'duplicate system code' })
    })

    await waitFor(() => {
      expect(screen.getByText('duplicate system code')).toBeDefined()
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
// Regression: componentOwner is written via setValue (PeopleInput is not a
// register()ed input). Without {shouldDirty, shouldTouch} on its onChange, a
// real edit/clear never marks the form interacted, so buildUpdateRequest's
// interacted-gate omits componentOwner and the clear is silently dropped (and
// the SaveBar never arms). This pins that the owner onChange marks the field.
// ---------------------------------------------------------------------------

describe('GeneralTab — componentOwner edit marks the form interacted', () => {
  it('clearing the owner via PeopleInput marks componentOwner dirty/touched', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    renderWithProviders(<Harness component={baseComponent({ componentOwner: 'alice' })} formRef={formRef} />)

    await userEvent.clear(screen.getByLabelText(/component owner/i, { selector: 'input' }))

    await waitFor(() => {
      expect(formRef.current?.getValues('componentOwner')).toBe('')
      const state = formRef.current!.getFieldState('componentOwner', formRef.current!.formState)
      expect(state.isDirty || state.isTouched).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// Regression: GeneralTab's mount-effect re-hydrates the page-owned form from the
// server component. Radix unmounts the inactive tab, so switching away from
// General and back re-mounts GeneralTab → the effect re-runs → it would stomp an
// in-progress edit with the server value and falsely clear the save bar. The
// effect must NOT re-hydrate once the form has unsaved edits (dirty OR touched);
// a genuine component-id change is handled by the page-level reset instead.
// ---------------------------------------------------------------------------

describe('GeneralTab — re-hydration guard (tab-switch / refetch must not clobber edits)', () => {
  function RemountHarness({
    component,
    formRef,
  }: {
    component: ComponentDetail
    formRef: React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
  }) {
    const [mounted, setMounted] = React.useState(true)
    // Mirror the page: BLANK defaults, the form lives ABOVE GeneralTab so it
    // survives GeneralTab's unmount (Radix tab switch).
    const form = useForm<GeneralFormValues>({
      defaultValues: {
        name: '', displayName: '', componentOwner: '', productType: '', systems: [],
        clientCode: '', solution: false, archived: false, parentComponentName: '',
        canBeParent: false, releaseManager: [], securityChampion: [], copyright: '',
        labels: [], docs: [], artifactIds: [],
      },
    })
    formRef.current = form
    return (
      <>
        <button data-testid="toggle-mount" onClick={() => setMounted((m) => !m)}>toggle</button>
        {mounted && <GeneralTab component={component} form={form} />}
      </>
    )
  }

  it('preserves an in-progress Display Name edit across a tab-switch unmount/remount', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    renderWithProviders(<RemountHarness component={baseComponent({ displayName: 'Old Name' })} formRef={formRef} />)

    const input = () => screen.getByLabelText(/display name/i, { selector: 'input' })
    await userEvent.clear(input())
    await userEvent.type(input(), 'Edited Name')
    expect(formRef.current!.getValues('displayName')).toBe('Edited Name')

    // Simulate the Radix tab switch: GeneralTab unmounts then re-mounts under the
    // same (page-owned) form that still holds the edit.
    fireEvent.click(screen.getByTestId('toggle-mount')) // unmount General
    fireEvent.click(screen.getByTestId('toggle-mount')) // remount General
    await waitFor(() => expect(input()).toBeDefined())

    // Without the guard, GeneralTab's mount-effect re-hydrates from component →
    // 'Old Name', silently discarding the edit.
    expect(formRef.current!.getValues('displayName')).toBe('Edited Name')
  })

  // The Solution toggle moved to its own tab (SolutionTab); the clear-to-default
  // touched-flag preservation is exercised in SolutionTab.test.tsx. GeneralTab
  // still HYDRATES `solution` on mount (it's the default tab) — covered by the
  // hydration assertions elsewhere in this file.
})

// ---------------------------------------------------------------------------
// systems: ChipsInput multi-select (mirrors labels' add/remove chip
// contract); systems is now OPTIONAL server-side, so an empty selection is a
// legitimate state, not an error.
// ---------------------------------------------------------------------------

describe('GeneralTab — systems ChipsInput (multi-value)', () => {
  it('hydrates the systems ChipsInput from component.systems (full array)', () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ systems: ['SYS1', 'SYS2'] })
    renderWithProviders(<Harness component={component} formRef={formRef} />)
    // Form value is the full array — every system, not just the first.
    expect(formRef.current?.getValues('systems')).toEqual(['SYS1', 'SYS2'])
  })

  it('renders one removable chip per system', () => {
    setAllEditable()
    const component = baseComponent({ systems: ['SYS1', 'SYS2'] })
    renderWithProviders(<Harness component={component} />)

    expect(screen.getByText('SYS1')).toBeDefined()
    expect(screen.getByText('SYS2')).toBeDefined()
    expect(screen.getByRole('button', { name: /^remove sys1$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^remove sys2$/i })).toBeDefined()
  })

  it('offers values from the FULL dictionary, not just in-use values (Sonnet review finding)', () => {
    // The dictionary endpoint surfaces values an admin defined but no
    // component is yet attached to. If the editor offered only in-use
    // values, those new dictionary entries would be invisible until
    // someone wired them to a component via a separate path. The mock
    // useSystemsDictionary returns `SYS_NEW_DICT_ONLY` which has no
    // component reference — verify the add-picker still offers it. (The
    // native <select> always renders its <option>s, no "open" step needed.)
    setAllEditable()
    const component = baseComponent({ systems: ['SYS1'] })
    renderWithProviders(<Harness component={component} />)

    expect(screen.getByRole('option', { name: 'SYS_NEW_DICT_ONLY' })).toBeDefined()
  })

  it('picking a system in the add-select appends it and marks the field dirty/touched', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ systems: ['SYS1'] })
    renderWithProviders(<Harness component={component} formRef={formRef} />)

    // ChipsInput's add-select is labelled by its `noun` prop; GeneralTab
    // passes noun="system", so the accessible name is "Add system".
    await userEvent.selectOptions(screen.getByLabelText(/^add system$/i), 'SYS2')

    await waitFor(() => {
      expect(formRef.current?.getValues('systems')).toEqual(['SYS1', 'SYS2'])
      const state = formRef.current!.getFieldState('systems', formRef.current!.formState)
      expect(state.isDirty || state.isTouched).toBe(true)
    })
  })

  it('removing a chip emits the shorter array', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ systems: ['SYS1', 'SYS2'] })
    renderWithProviders(<Harness component={component} formRef={formRef} />)

    await userEvent.click(screen.getByRole('button', { name: /^remove sys1$/i }))

    await waitFor(() => {
      expect(formRef.current?.getValues('systems')).toEqual(['SYS2'])
    })
  })

  it('removing every chip leaves an empty (not undefined) array — clearing all systems is allowed', async () => {
    // systems is OPTIONAL server-side now: an empty selection is a valid,
    // save-able state (buildUpdateRequest emits `systems: []` as an explicit
    // clear), not a validation error to block on.
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    const component = baseComponent({ systems: ['SYS1'] })
    renderWithProviders(<Harness component={component} formRef={formRef} />)

    await userEvent.click(screen.getByRole('button', { name: /^remove sys1$/i }))

    await waitFor(() => {
      expect(formRef.current?.getValues('systems')).toEqual([])
    })
    expect(screen.queryByText(/system is required/i)).toBeNull()
  })

  it('renders an inline error below the System ChipsInput when form.setError("systems") fires', async () => {
    setAllEditable()
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    renderWithProviders(<Harness component={baseComponent({ systems: ['SYS1'] })} formRef={formRef} />)

    await act(async () => {
      formRef.current?.setError('systems', { type: 'server', message: 'unknown system code' })
    })

    await waitFor(() => {
      expect(screen.getByText(/unknown system code/i)).toBeDefined()
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
    // solution → Solution tab, labels → header, docs → Documentation tab.
    'component.componentOwner',
    'component.releaseManager',
    'component.securityChampion',
    'component.system',
    'component.clientCode',
    'component.copyright',
    // component.artifactIds (Produced Artifacts) moved to the Build tab
    // (ProducedArtifactsSection) — its FieldInfo is asserted there.
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

describe('GeneralTab — responsible-people (who can edit) panel', () => {
  it('renders the highlighted read-only owner + RMs + SCs rows from useComponentEditors', () => {
    setAllEditable()
    renderWithProviders(<Harness component={baseComponent()} />)
    const panel = screen.getByTestId('who-can-edit')
    expect(panel.textContent).toContain('Who can edit this component')
    expect(panel.textContent).toContain('alice')
    expect(panel.textContent).toContain('rm-1')
    expect(panel.textContent).toContain('sc-1')
  })

  it('hides the footer panel for read-only viewers (they get the header banner instead)', () => {
    setAllEditable()
    renderWithProviders(<Harness component={baseComponent()} canEdit={false} />)
    expect(screen.queryByTestId('who-can-edit')).toBeNull()
  })

  it('shows a Loading… placeholder while the editors projection is in flight', () => {
    setAllEditable()
    // mockReturnValue (not Once): GeneralTab re-renders via form.watch, so a one-shot would be
    // consumed before the assertion. beforeEach resets this back to DEFAULT_EDITORS, so the
    // sticky loading state does not leak into later tests.
    mockUseComponentEditors.mockReturnValue({ data: undefined as never, isLoading: true })
    renderWithProviders(<Harness component={baseComponent()} />)
    expect(screen.getByTestId('who-can-edit').textContent).toContain('Loading…')
  })
})

// ── Owner async-validation propagation (page Save guard) ─────────────────────
// PeopleInput commits a typed owner only after the directory lookup resolves;
// GeneralTab forwards the in-flight signal so ComponentDetailPage can hold the
// global Save (otherwise the unsaved edit is silently dropped from the PATCH).
describe('GeneralTab — owner validating propagation', () => {
  it('reports the owner lookup in-flight state through onOwnerValidatingChange', async () => {
    vi.mocked(lookupEmployee).mockResolvedValue([{ username: 'bob', active: true }])
    const onOwnerValidatingChange = vi.fn()
    const component = baseComponent({ componentOwner: 'alice' })
    renderWithProviders(
      <Harness component={component} onOwnerValidatingChange={onOwnerValidatingChange} />,
    )

    const input = screen.getByPlaceholderText('AD userkey')
    fireEvent.change(input, { target: { value: 'bob' } })
    fireEvent.blur(input)

    await waitFor(() => expect(onOwnerValidatingChange).toHaveBeenCalledWith(true))
    await waitFor(() => expect(onOwnerValidatingChange).toHaveBeenLastCalledWith(false))
  })
})

// Artifact-ownership ("Produced Artifacts") rendering moved to the Build tab
// (ProducedArtifactsSection); its tests live in ProducedArtifactsSection.test.tsx.

// ── Classification (Explicit / External) — relocated from the Distribution tab ─
// The toggle STATE still lives in the page's useDistributionSection; GeneralTab
// only renders the section when the optional `classification` prop is supplied.
describe('GeneralTab — Classification', () => {
  function stubClassification(explicit = false, external = false) {
    return {
      explicit,
      external,
      setExplicit: vi.fn(),
      setExternal: vi.fn(),
    }
  }

  it('renders both Explicit and External switches reflecting the passed state', () => {
    setAllEditable()
    const classification = stubClassification(true, false)
    renderWithProviders(<Harness component={baseComponent()} classification={classification} />)

    const explicitSwitch = screen.getByRole('switch', { name: /explicit/i })
    const externalSwitch = screen.getByRole('switch', { name: /external/i })
    expect(explicitSwitch).toHaveAttribute('aria-checked', 'true')
    expect(externalSwitch).toHaveAttribute('aria-checked', 'false')
  })

  it('toggling a switch calls the corresponding setter', async () => {
    setAllEditable()
    const classification = stubClassification(false, false)
    renderWithProviders(<Harness component={baseComponent()} classification={classification} />)

    await userEvent.click(screen.getByRole('switch', { name: /explicit/i }))
    expect(classification.setExplicit).toHaveBeenCalledWith(true)
    expect(classification.setExternal).not.toHaveBeenCalled()
  })

  it('does not render the Classification section when no classification prop is passed', () => {
    setAllEditable()
    renderWithProviders(<Harness component={baseComponent()} />)
    expect(screen.queryByTestId('section-classification')).toBeNull()
  })
})
