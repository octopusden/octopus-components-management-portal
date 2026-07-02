import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { SolutionTab } from './SolutionTab'
import { TooltipProvider } from '../ui/tooltip'
import type { GeneralFormValues } from './GeneralTab'

vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigEntry: () => ({ entry: { visibility: 'editable' }, isLoading: false, isError: false }),
  useFieldLabel: (_path: string, fallback: string) => fallback,
}))

function defaults(over: Partial<GeneralFormValues> = {}): GeneralFormValues {
  return {
    name: '', displayName: '', componentOwner: '', productType: '', system: '',
    clientCode: '', solution: false, archived: false, parentComponentName: '',
    canBeParent: false, releaseManager: [], securityChampion: [], copyright: '',
    labels: [], docs: [], artifactIds: [], ...over,
  }
}

function Harness({
  initial,
  formRef,
  visibility,
}: {
  initial?: Partial<GeneralFormValues>
  formRef?: React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
  visibility?: 'editable' | 'readonly' | 'hidden'
}) {
  const [mounted, setMounted] = React.useState(true)
  const form = useForm<GeneralFormValues>({ defaultValues: defaults(initial) })
  if (formRef) formRef.current = form
  return (
    <TooltipProvider>
      <button data-testid="toggle-mount" onClick={() => setMounted((m) => !m)}>toggle</button>
      {mounted && <SolutionTab form={form} visibility={visibility} />}
    </TooltipProvider>
  )
}

describe('SolutionTab', () => {
  it('reflects the current solution value on the switch', () => {
    render(<Harness initial={{ solution: true }} />)
    expect((screen.getByRole('switch') as HTMLButtonElement).getAttribute('aria-checked')).toBe('true')
  })

  it('toggling the switch writes the value into the form (dirty + touched)', async () => {
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    render(<Harness initial={{ solution: false }} formRef={formRef} />)

    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(formRef.current!.getValues('solution')).toBe(true))
    expect(formRef.current!.formState.dirtyFields.solution).toBe(true)
    expect(formRef.current!.formState.touchedFields.solution).toBe(true)
  })

  it('editable → switch enabled; readonly → switch disabled (defense-in-depth with buildUpdateRequest)', () => {
    const { unmount } = render(<Harness initial={{ solution: true }} visibility="editable" />)
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(false)
    unmount()
    render(<Harness initial={{ solution: true }} visibility="readonly" />)
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true)
  })

  it('preserves a clear-to-default toggle (true→false) across an unmount/remount', async () => {
    // true→false equals the RHF default, so only the shouldTouch flag marks the
    // field interacted — the page form (which outlives this tab) must keep false.
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    render(<Harness initial={{ solution: true }} formRef={formRef} />)

    fireEvent.click(screen.getByRole('switch')) // true → false
    expect(formRef.current!.getValues('solution')).toBe(false)

    fireEvent.click(screen.getByTestId('toggle-mount')) // unmount
    fireEvent.click(screen.getByTestId('toggle-mount')) // remount
    await waitFor(() => expect(screen.getByRole('switch')).toBeDefined())
    expect(formRef.current!.getValues('solution')).toBe(false)
  })
})
