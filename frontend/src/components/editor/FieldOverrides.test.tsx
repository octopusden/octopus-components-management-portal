import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FieldOverrides } from './FieldOverrides'
import type { FieldOverride } from '../../lib/types'
import type { User } from '../../lib/auth'

// ---------------------------------------------------------------------------
// Mock hooks — item D: the table now reads the page-level override draft and
// queues deletes (no immediate DELETE). (Mock-prefixed names so Vitest's
// hoisted vi.mock factory may reference them.)
// ---------------------------------------------------------------------------

const mockQueueDelete = vi.fn()
let mockOverrides: FieldOverride[] = []
let mockLoading = false

vi.mock('./overridesDraft', () => ({
  useOverridesDraft: () => ({
    serverOverrides: mockOverrides,
    effectiveOverrides: mockOverrides,
    isLoading: mockLoading,
    isDirty: false,
    queueCreate: vi.fn(),
    queueUpdate: vi.fn(),
    queueDelete: mockQueueDelete,
    reset: vi.fn(),
  }),
}))

// FieldOverrides gates its edit surface on the EDIT_METADATA permission, read via
// useCurrentUser. Default to an admin in beforeEach so existing tests keep
// seeing the actions; gating tests override with a non-admin user.
const mockUser = vi.fn<() => { data: User | null }>()
vi.mock('../../hooks/useCurrentUser', () => ({
  useCurrentUser: () => mockUser(),
}))

function makeUser(permissions: string[]): User {
  return { username: 'u', roles: [{ name: 'r', permissions }], groups: [] }
}
const ADMIN_USER = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS', 'EDIT_METADATA'])
const EDITOR_USER = makeUser(['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'])

// Stub OverrideRowEditor so FieldOverrides tests focus on the table/buttons,
// not on the editor internals. The stub renders a sentinel element when open
// so tests can detect modal open state.
const mockOnOpenChange = vi.fn()
vi.mock('./OverrideRowEditor', () => ({
  OverrideRowEditor: ({
    open,
    onOpenChange,
    mode,
    override,
  }: {
    open: boolean
    onOpenChange: (v: boolean) => void
    mode: string
    override?: { overriddenAttribute?: string }
  }) => {
    mockOnOpenChange.mockImplementation(onOpenChange)
    if (!open) return null
    return (
      <div data-testid="override-row-editor" data-mode={mode} data-attribute={override?.overriddenAttribute ?? ''}>
        <span>{mode === 'edit' ? 'Edit Override' : 'Add Override (modal)'}</span>
        {mode === 'create' && <input type="radio" name="overrideType" aria-label="Scalar" defaultChecked />}
      </div>
    )
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderComponent() {
  return render(<FieldOverrides />)
}

function makeScalarOverride(overrides: Partial<FieldOverride> = {}): FieldOverride {
  return {
    id: 'fo-scalar',
    overriddenAttribute: 'build.javaVersion',
    versionRange: '[11,12)',
    rowType: 'SCALAR_OVERRIDE',
    value: '11',
    markerChildren: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

function makeMarkerOverride(overrides: Partial<FieldOverride> = {}): FieldOverride {
  return {
    id: 'fo-marker',
    overriddenAttribute: 'distribution.maven',
    versionRange: '[1,2)',
    rowType: 'MARKER',
    value: null,
    markerChildren: { mavenArtifacts: [] },
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FieldOverrides', () => {
  beforeEach(() => {
    mockQueueDelete.mockReset()
    mockOverrides = []
    mockLoading = false
    mockUser.mockReturnValue({ data: ADMIN_USER })
  })

  it('renders Add Override button when loaded', () => {
    renderComponent()
    expect(screen.getByRole('button', { name: /add override/i })).toBeDefined()
  })

  it('shows a loading skeleton (not the empty state) while the override baseline loads', () => {
    mockLoading = true
    const { container } = renderComponent()
    // No "No field overrides defined" flash and no table while loading.
    expect(screen.queryByText(/no field overrides/i)).toBeNull()
    expect(container.querySelector('table')).toBeNull()
  })

  it('shows empty state when no overrides', () => {
    mockOverrides = []
    renderComponent()
    expect(screen.getByText(/no field overrides/i)).toBeDefined()
  })

  it('Add Override button opens the OverrideRowEditor modal in create mode', async () => {
    renderComponent()
    await userEvent.click(screen.getByRole('button', { name: /add override/i }))
    await waitFor(() => {
      const editor = screen.getByTestId('override-row-editor')
      expect(editor.getAttribute('data-mode')).toBe('create')
    })
  })

  it('shows a read-only inline summary of marker children (no need to open the editor)', () => {
    mockOverrides = [
      makeMarkerOverride({
        overriddenAttribute: 'vcs.settings',
        markerChildren: {
          vcsEntries: [
            { name: 'main', vcsPath: 'org/main' },
            { name: 'ui', vcsPath: 'org/ui' },
          ],
        },
      }),
    ]
    renderComponent()
    expect(screen.getByText('main, ui')).toBeDefined()
    expect(screen.queryByText(/edit to view children/i)).toBeNull()
  })

  it('renders override rows in a table when overrides exist', () => {
    mockOverrides = [makeScalarOverride()]
    renderComponent()
    const table = screen.getByRole('table')
    expect(within(table).getByText('build.javaVersion')).toBeDefined()
    expect(within(table).getByText('SCALAR_OVERRIDE')).toBeDefined()
    expect(within(table).getByText('[11,12)')).toBeDefined()
  })

  it('Edit button on SCALAR_OVERRIDE row opens editor in edit mode with correct attribute', async () => {
    mockOverrides = [makeScalarOverride()]
    renderComponent()
    await userEvent.click(screen.getByRole('button', { name: /^edit override$/i }))
    await waitFor(() => {
      const editor = screen.getByTestId('override-row-editor')
      expect(editor.getAttribute('data-mode')).toBe('edit')
      expect(editor.getAttribute('data-attribute')).toBe('build.javaVersion')
    })
  })

  it('Edit button on MARKER row is ENABLED and opens editor in edit mode', async () => {
    mockOverrides = [makeMarkerOverride()]
    renderComponent()
    const editBtn = screen.getByRole('button', { name: /^edit override$/i }) as HTMLButtonElement
    expect(editBtn.disabled).toBe(false)
    await userEvent.click(editBtn)
    await waitFor(() => {
      const editor = screen.getByTestId('override-row-editor')
      expect(editor.getAttribute('data-mode')).toBe('edit')
      expect(editor.getAttribute('data-attribute')).toBe('distribution.maven')
    })
  })

  it('Delete button triggers confirm dialog', async () => {
    mockOverrides = [makeScalarOverride()]
    renderComponent()
    await userEvent.click(screen.getByRole('button', { name: /^delete override$/i }))
    await waitFor(() => {
      expect(screen.getByText('Delete Override')).toBeDefined()
    })
  })

  it('confirming Delete QUEUES the delete by row id (no immediate write)', async () => {
    mockOverrides = [makeScalarOverride()]
    renderComponent()

    await userEvent.click(screen.getByRole('button', { name: /^delete override$/i }))
    await waitFor(() => expect(screen.getByText('Delete Override')).toBeDefined())
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    expect(mockQueueDelete).toHaveBeenCalledOnce()
    expect(mockQueueDelete).toHaveBeenCalledWith('fo-scalar')
  })

  it('Delete button is enabled for MARKER rows', () => {
    mockOverrides = [makeMarkerOverride()]
    renderComponent()
    const deleteBtn = screen.getByRole('button', { name: /^delete override$/i }) as HTMLButtonElement
    expect(deleteBtn.disabled).toBe(false)
  })
})

describe('FieldOverrides — EDIT_METADATA gating', () => {
  beforeEach(() => {
    mockQueueDelete.mockReset()
    mockOverrides = [makeScalarOverride()]
  })

  it('admin (EDIT_METADATA) sees Add Override and per-row edit/delete actions', () => {
    mockUser.mockReturnValue({ data: ADMIN_USER })
    renderComponent()
    expect(screen.getByRole('button', { name: /add override/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit override/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete override/i })).toBeInTheDocument()
  })

  it('non-admin sees a read-only table — no Add Override, no row actions, no Actions column', () => {
    mockUser.mockReturnValue({ data: EDITOR_USER })
    renderComponent()
    expect(within(screen.getByRole('table')).getByText('build.javaVersion')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add override/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /edit override/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /delete override/i })).toBeNull()
    expect(screen.queryByText('Actions')).toBeNull()
  })

  it('treats a null user (unauthenticated/loading) as non-admin', () => {
    mockUser.mockReturnValue({ data: null })
    renderComponent()
    expect(screen.queryByRole('button', { name: /add override/i })).toBeNull()
  })

  it('shows the read-only marker child summary to non-admins (not the editor-only placeholder)', () => {
    mockUser.mockReturnValue({ data: EDITOR_USER })
    mockOverrides = [
      makeMarkerOverride({
        overriddenAttribute: 'vcs.settings',
        markerChildren: {
          vcsEntries: [
            { name: 'main', vcsPath: 'org/main' },
            { name: 'ui', vcsPath: 'org/ui' },
          ],
        },
      }),
    ]
    renderComponent()
    expect(screen.getByText('main, ui')).toBeInTheDocument()
    expect(screen.queryByText(/edit to view children/i)).toBeNull()
  })

  it('shows the same read-only marker child summary to admins (no editor-only placeholder)', () => {
    mockUser.mockReturnValue({ data: ADMIN_USER })
    mockOverrides = [
      makeMarkerOverride({
        overriddenAttribute: 'distribution.maven',
        markerChildren: { mavenArtifacts: [{ groupPattern: 'org.acme', artifactPattern: 'svc' }] },
      }),
    ]
    renderComponent()
    expect(screen.getByText('org.acme:svc')).toBeInTheDocument()
    expect(screen.queryByText(/edit to view children/i)).toBeNull()
  })
})
