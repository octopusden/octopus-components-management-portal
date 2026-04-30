import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ComponentHistoryTab } from './ComponentHistoryTab'
import type { AuditLogEntry, Page } from '../../lib/types'

// Mock useEntityAuditLog so the test pins the wire-shape regardless of the
// real fetch path. The interesting contract is that ComponentHistoryTab
// translates a component UUID into a `/audit/Component/{id}` query and
// renders the result through AuditLogTable.
const mockUseEntityAuditLog = vi.fn()
vi.mock('../../hooks/useAuditLog', () => ({
  useEntityAuditLog: (
    entityType: string,
    entityId: string,
    options?: { page?: number; size?: number },
  ) => mockUseEntityAuditLog(entityType, entityId, options),
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 1,
    entityType: 'Component',
    entityId: 'c-uuid',
    action: 'UPDATE',
    changedBy: 'alice',
    changedAt: '2026-04-30T10:15:00Z',
    oldValue: { displayName: 'Old' },
    newValue: { displayName: 'New' },
    changeDiff: { displayName: { from: 'Old', to: 'New' } },
    correlationId: null,
    source: 'api',
    ...overrides,
  } as AuditLogEntry
}

function makePage(content: AuditLogEntry[]): Page<AuditLogEntry> {
  return {
    content,
    totalElements: content.length,
    totalPages: 1,
    number: 0,
    size: content.length,
  } as Page<AuditLogEntry>
}

describe('ComponentHistoryTab (B7.1.2)', () => {
  it('queries /audit/Component/{id} for the supplied componentId', () => {
    mockUseEntityAuditLog.mockReturnValue({ data: makePage([]), isLoading: false, isError: false })

    renderWithProviders(<ComponentHistoryTab componentId="c-uuid-42" />)

    expect(mockUseEntityAuditLog).toHaveBeenCalled()
    const lastCall = mockUseEntityAuditLog.mock.calls.at(-1)!
    expect(lastCall[0]).toBe('Component') // entityType — must match what AuditEvent emits server-side
    expect(lastCall[1]).toBe('c-uuid-42')
  })

  it('renders rows from the entity audit log into AuditLogTable', () => {
    const entry = makeEntry({ id: 99, action: 'RENAME', changedBy: 'admin-bob' })
    mockUseEntityAuditLog.mockReturnValue({ data: makePage([entry]), isLoading: false, isError: false })

    renderWithProviders(<ComponentHistoryTab componentId="c-uuid-42" />)

    // AuditLogTable surfaces changedBy in a "Who" column; this is the canonical
    // smoke test for "the entry made it through".
    expect(screen.getByText('admin-bob')).toBeDefined()
    expect(screen.getByText('RENAME')).toBeDefined()
  })

  it('shows a friendly empty state when there are no audit entries yet', () => {
    mockUseEntityAuditLog.mockReturnValue({ data: makePage([]), isLoading: false, isError: false })

    renderWithProviders(<ComponentHistoryTab componentId="c-fresh" />)

    expect(screen.getByText(/no audit log entries/i)).toBeDefined()
  })
})
