import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { ReleaseProcessTab } from './ReleaseProcessTab'
import type { GeneralFormValues } from './GeneralTab'
import { TooltipProvider } from '../ui/tooltip'

import { PERMISSIONS, type User } from '../../lib/auth'

// The real field-config hooks run against a mocked field-config blob and current user,
// so the `editable` axis (adminOnly / none) is exercised end to end.
const mockFieldConfig = vi.fn()
vi.mock('../../hooks/useAdminConfig', () => ({ useFieldConfig: () => mockFieldConfig() }))
const mockCurrentUser = vi.fn()
vi.mock('../../hooks/useCurrentUser', () => ({ useCurrentUser: () => mockCurrentUser() }))

const adminUser: User = {
  username: 'admin', groups: [],
  roles: [{ name: 'ADMIN', permissions: [PERMISSIONS.EDIT_ANY_COMPONENT] }],
}
const regularUser: User = {
  username: 'bob', groups: [],
  roles: [{ name: 'USER', permissions: [PERMISSIONS.ACCESS_COMPONENTS] }],
}

function setAutoReleaseEntry(entry: Record<string, string>) {
  mockFieldConfig.mockReturnValue({
    data: { component: { autoRelease: entry } },
    isLoading: false,
    isError: false,
  })
}

type Form = ReturnType<typeof useForm<GeneralFormValues>>

function Harness({ autoRelease, formRef }: { autoRelease: boolean; formRef?: React.MutableRefObject<Form | null> }) {
  const form = useForm<GeneralFormValues>({ defaultValues: { autoRelease } })
  if (formRef) formRef.current = form
  return <ReleaseProcessTab form={form} />
}

function renderTab(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}

beforeEach(() => {
  mockFieldConfig.mockReturnValue({ data: undefined, isLoading: false, isError: false })
  mockCurrentUser.mockReturnValue({ data: regularUser, isLoading: false })
})

describe('ReleaseProcessTab auto release switch', () => {
  it('shows the form value and writes the toggled value into the form', async () => {
    const formRef = { current: null } as React.MutableRefObject<Form | null>
    renderTab(<Harness autoRelease={true} formRef={formRef} />)
    const sw = screen.getByRole('switch', { name: /auto release/i })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    await userEvent.click(sw)
    expect(formRef.current!.getValues('autoRelease')).toBe(false)
  })

  it('hidden hides, readonly disables', () => {
    setAutoReleaseEntry({ visibility: 'hidden' })
    const { unmount } = renderTab(<Harness autoRelease={false} />)
    expect(screen.queryByRole('switch', { name: /auto release/i })).toBeNull()
    unmount()
    setAutoReleaseEntry({ visibility: 'readonly' })
    renderTab(<Harness autoRelease={false} />)
    expect((screen.getByRole('switch', { name: /auto release/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('adminOnly: disabled for a non-admin, enabled for an admin', () => {
    setAutoReleaseEntry({ visibility: 'editable', editable: 'adminOnly' })
    const { unmount } = renderTab(<Harness autoRelease={false} />)
    expect((screen.getByRole('switch', { name: /auto release/i }) as HTMLButtonElement).disabled).toBe(true)
    unmount()
    mockCurrentUser.mockReturnValue({ data: adminUser, isLoading: false })
    renderTab(<Harness autoRelease={false} />)
    expect((screen.getByRole('switch', { name: /auto release/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('editable none: disabled even for an admin', () => {
    setAutoReleaseEntry({ visibility: 'editable', editable: 'none' })
    mockCurrentUser.mockReturnValue({ data: adminUser, isLoading: false })
    renderTab(<Harness autoRelease={false} />)
    expect((screen.getByRole('switch', { name: /auto release/i }) as HTMLButtonElement).disabled).toBe(true)
  })
})
