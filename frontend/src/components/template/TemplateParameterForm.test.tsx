import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { TemplateParameterForm } from './TemplateParameterForm'
import type { TemplateParameter } from '../../lib/component/templateParameters'

vi.mock('../../hooks/useOwners', () => ({ useOwners: vi.fn(() => ({ data: ['jdoe', 'asmith'] })) }))
vi.mock('../../hooks/useFieldOptions', () => ({ useFieldOptions: vi.fn(() => ({ options: [], isLoading: false })) }))

function param(name: string, overrides: Partial<TemplateParameter> = {}): TemplateParameter {
  return { name, label: name, type: 'text', required: true, multiple: false, default: [], ...overrides }
}

const PARAMETERS: TemplateParameter[] = [
  param('CLIENT_CODE', { label: 'Client code', type: 'select', options: ['ABC', 'XYZ'], hint: 'The client this plugin is for' }),
  param('PLUGIN_CODE', { label: 'Plugin code', pattern: '^[A-Z]+$' }),
  param('PLUGIN_NAME', { label: 'Plugin name', required: false }),
  param('REGIONS', { label: 'Regions', type: 'select', multiple: true, options: ['eu', 'us', 'apac'] }),
  param('LABELS', { label: 'Labels', type: 'crs-list', list: 'labels', values: ['sql', 'ui'] }),
  param('OWNER', { label: 'Component owner', type: 'person', default: ['jdoe'] }),
  param('CHAMPIONS', { label: 'Security champions', type: 'person', multiple: true }),
]

const onChange = vi.fn()

function renderForm(values: Record<string, string[]> = {}, errors: Record<string, string> = {}) {
  return render(<TemplateParameterForm parameters={PARAMETERS} values={values} errors={errors} onChange={onChange} />)
}

const fieldOf = (label: string) => screen.getByTestId(`template-parameter-${PARAMETERS.find((p) => p.label === label)!.name}`)

beforeEach(() => vi.clearAllMocks())

describe('TemplateParameterForm', () => {
  it('shows one input per parameter, in the template order, with label and hint', () => {
    renderForm()
    const labels = screen.getAllByTestId(/^template-parameter-/).map((el) => el.dataset.testid)
    expect(labels).toEqual(PARAMETERS.map((p) => `template-parameter-${p.name}`))
    expect(within(fieldOf('Client code')).getByText('The client this plugin is for')).toBeInTheDocument()
  })

  it('marks required parameters and says which are optional', () => {
    renderForm()
    expect(within(fieldOf('Plugin code')).getByText('*')).toBeInTheDocument()
    expect(within(fieldOf('Plugin name')).getByText('(optional)')).toBeInTheDocument()
  })

  it('uses a text input for text and reports what is typed', () => {
    renderForm({ PLUGIN_CODE: ['PA'] })
    const input = within(fieldOf('Plugin code')).getByRole('textbox')
    expect(input).toHaveValue('PA')
    fireEvent.change(input, { target: { value: 'PAY' } })
    expect(onChange).toHaveBeenCalledWith('PLUGIN_CODE', ['PAY'])
  })

  it('uses a dropdown for a single-value select', () => {
    renderForm({ CLIENT_CODE: ['ABC'] })
    expect(within(fieldOf('Client code')).getByRole('combobox')).toHaveTextContent('ABC')
  })

  it('uses chips offering only the options for a select that takes several values', () => {
    renderForm({ REGIONS: ['eu'] })
    const field = fieldOf('Regions')
    expect(within(field).getByTestId('chip-eu')).toBeInTheDocument()
    const add = within(field).getByRole('combobox', { name: 'Add value' })
    expect(within(add).getAllByRole('option').map((o) => o.textContent).filter(Boolean)).toEqual(['us', 'apac'])
    fireEvent.change(add, { target: { value: 'us' } })
    expect(onChange).toHaveBeenCalledWith('REGIONS', ['eu', 'us'])
  })

  it('uses chips from the registry list for labels', () => {
    renderForm({ LABELS: [] })
    const add = within(fieldOf('Labels')).getByRole('combobox', { name: 'Add label' })
    expect(within(add).getAllByRole('option').map((o) => o.textContent).filter(Boolean)).toEqual(['sql', 'ui'])
  })

  it('opens a person parameter on its default user', () => {
    renderForm({ OWNER: ['jdoe'] })
    expect(within(fieldOf('Component owner')).getByRole('textbox')).toHaveValue('jdoe')
  })

  it('uses the people list for a person parameter that takes several people', () => {
    renderForm({ CHAMPIONS: ['asmith'] })
    expect(within(fieldOf('Security champions')).getByText('asmith')).toBeInTheDocument()
  })

  it('shows a check message under its parameter', () => {
    renderForm({ PLUGIN_CODE: ['pay'] }, { PLUGIN_CODE: '3–16 uppercase letters or digits, starting with a letter.' })
    const input = within(fieldOf('Plugin code')).getByRole('textbox')
    expect(within(fieldOf('Plugin code')).getByText('3–16 uppercase letters or digits, starting with a letter.')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })
})
