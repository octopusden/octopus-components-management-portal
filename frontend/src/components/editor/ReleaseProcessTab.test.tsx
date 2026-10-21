import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { ReleaseProcessTab } from './ReleaseProcessTab'
import type { GeneralFormValues } from './GeneralTab'
import { TooltipProvider } from '../ui/tooltip'

const mockUseFieldConfigEntry = vi.fn()
vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigEntry: (fieldPath: string) => mockUseFieldConfigEntry(fieldPath),
  useFieldLabel: (_path: string, fallback: string) => fallback,
}))

function makeEntry(visibility: 'editable' | 'readonly' | 'hidden' = 'editable') {
  return { entry: { visibility, required: false }, isLoading: false, isError: false }
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
  mockUseFieldConfigEntry.mockImplementation(() => makeEntry('editable'))
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

  it('says that the TeamCity sync turns it on from a finish-build trigger', () => {
    renderTab(<Harness autoRelease={false} />)
    expect(screen.getByText(/finish-build trigger/i)).toBeDefined()
  })

  it('hidden → not rendered; readonly → disabled', () => {
    mockUseFieldConfigEntry.mockImplementation(() => makeEntry('hidden'))
    const { unmount } = renderTab(<Harness autoRelease={false} />)
    expect(screen.queryByRole('switch', { name: /auto release/i })).toBeNull()
    unmount()
    mockUseFieldConfigEntry.mockImplementation(() => makeEntry('readonly'))
    renderTab(<Harness autoRelease={false} />)
    expect((screen.getByRole('switch', { name: /auto release/i }) as HTMLButtonElement).disabled).toBe(true)
  })
})
