import { ChipsInput } from '../ui/ChipsInput'
import { EnumSelect } from '../ui/EnumSelect'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { PeopleInput } from '../ui/PeopleInput'
import { PeopleListInput } from '../ui/PeopleListInput'
import { takesSeveral, type ParameterValues, type TemplateParameter } from '../../lib/component/templateParameters'

interface TemplateParameterFormProps {
  parameters: readonly TemplateParameter[]
  values: ParameterValues
  /** Messages by parameter name, from the local checks or a dry run. */
  errors: Readonly<Record<string, string>>
  onChange: (name: string, values: string[]) => void
}

const inputId = (name: string) => `template-parameter-input-${name}`

function ParameterInput({
  parameter,
  value,
  invalid,
  describedBy,
  onChange,
}: {
  parameter: TemplateParameter
  value: readonly string[]
  invalid: boolean
  describedBy: string | undefined
  onChange: (values: string[]) => void
}) {
  const id = inputId(parameter.name)
  const first = value[0] ?? ''
  if (parameter.type === 'person') {
    return parameter.multiple ? (
      <PeopleListInput value={[...value]} onChange={onChange} />
    ) : (
      <PeopleInput id={id} value={first} onChange={(login) => onChange(login ? [login] : [])} />
    )
  }
  const options = parameter.type === 'select' ? (parameter.options ?? []) : (parameter.values ?? [])
  if (parameter.type !== 'text' && takesSeveral(parameter)) {
    return (
      <ChipsInput
        id={id}
        noun={parameter.list === 'labels' ? 'label' : 'value'}
        value={[...value]}
        onChange={onChange}
        options={options}
        ariaInvalid={invalid}
        ariaDescribedBy={describedBy}
      />
    )
  }
  if (parameter.type !== 'text') {
    return (
      <EnumSelect
        id={id}
        fieldPath={`template.${parameter.name}`}
        optionsOverride={options}
        value={first}
        onValueChange={(v) => onChange(v ? [v] : [])}
        aria-required={parameter.required}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      />
    )
  }
  return (
    <Input
      id={id}
      value={first}
      onChange={(e) => onChange([e.target.value])}
      maxLength={parameter.maxLength}
      aria-required={parameter.required}
      aria-invalid={invalid}
      aria-describedby={describedBy}
    />
  )
}

/**
 * One input per template parameter, in the template's order, chosen by its type. It shows the
 * messages it is given and checks nothing itself; the caller owns the values and the checks.
 */
export function TemplateParameterForm({ parameters, values, errors, onChange }: TemplateParameterFormProps) {
  return (
    <div className="space-y-5">
      {parameters.map((parameter) => {
        const error = errors[parameter.name]
        const hintId = parameter.hint ? `template-parameter-hint-${parameter.name}` : undefined
        const errorId = error ? `template-parameter-error-${parameter.name}` : undefined
        const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
        return (
          <div key={parameter.name} className="space-y-1.5" data-testid={`template-parameter-${parameter.name}`}>
            <Label htmlFor={inputId(parameter.name)}>
              {parameter.label}
              {parameter.required ? (
                <span aria-hidden className="ml-0.5 text-destructive">
                  *
                </span>
              ) : (
                <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
              )}
            </Label>
            {parameter.hint && (
              <p id={hintId} className="text-xs text-muted-foreground">
                {parameter.hint}
              </p>
            )}
            <ParameterInput
              parameter={parameter}
              value={values[parameter.name] ?? []}
              invalid={!!error}
              describedBy={describedBy}
              onChange={(next) => onChange(parameter.name, next)}
            />
            {error && (
              <p id={errorId} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
