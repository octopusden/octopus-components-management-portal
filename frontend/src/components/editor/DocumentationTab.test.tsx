import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { DocumentationTab } from './DocumentationTab'
import { TooltipProvider } from '../ui/tooltip'
import type { GeneralFormValues } from './GeneralTab'

vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigEntry: () => ({ entry: { visibility: 'editable' }, isLoading: false, isError: false }),
  useFieldLabel: (_path: string, fallback: string) => fallback,
}))
vi.mock('../../hooks/useComponents', () => ({
  useComponents: () => ({ data: { content: [], totalElements: 0 } }),
}))

function defaults(over: Partial<GeneralFormValues> = {}): GeneralFormValues {
  return {
    name: '', displayName: '', componentOwner: '', productType: '', systems: [],
    clientCode: '', solution: false, archived: false, parentComponentName: '',
    canBeParent: false, releaseManager: [], securityChampion: [], copyright: '',
    labels: [], docs: [], artifactIds: [], ...over,
  }
}

function Harness({
  initial,
  formRef,
}: {
  initial?: Partial<GeneralFormValues>
  formRef?: React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
}) {
  const form = useForm<GeneralFormValues>({ defaultValues: defaults(initial) })
  if (formRef) formRef.current = form
  return (
    <TooltipProvider>
      <DocumentationTab form={form} />
    </TooltipProvider>
  )
}

describe('DocumentationTab', () => {
  it('shows the empty state when there are no doc links', () => {
    render(<Harness />)
    expect(screen.getByText(/no documentation links configured/i)).toBeDefined()
  })

  it('renders one row per existing doc link', () => {
    render(<Harness initial={{ docs: [{ docComponentKey: 'docs-a', majorVersion: '3.x' }] }} />)
    expect(screen.getByLabelText(/doc link component key \(row 1\)/i)).toBeDefined()
    expect((screen.getByLabelText(/doc link major version \(row 1\)/i) as HTMLInputElement).value).toBe('3.x')
  })

  it('"Add doc link" appends an empty row to the form', async () => {
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    render(<Harness formRef={formRef} />)

    await userEvent.click(screen.getByRole('button', { name: /add doc link/i }))
    await waitFor(() => expect(formRef.current!.getValues('docs')).toHaveLength(1))
  })

  it('remove button drops the row from the form', async () => {
    const formRef = React.createRef<ReturnType<typeof useForm<GeneralFormValues>> | null>() as React.MutableRefObject<ReturnType<typeof useForm<GeneralFormValues>> | null>
    render(<Harness initial={{ docs: [{ docComponentKey: 'docs-a', majorVersion: '3.x' }] }} formRef={formRef} />)

    await userEvent.click(screen.getByRole('button', { name: /remove doc link/i }))
    await waitFor(() => expect(formRef.current!.getValues('docs')).toHaveLength(0))
  })
})
