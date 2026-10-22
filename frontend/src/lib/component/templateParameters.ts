import type { components } from '../api/schema'

export type TemplateParameter = components['schemas']['ComponentTemplateParameter']

/** Values entered per parameter name, as the form holds them: blanks and repeats included. */
export type ParameterValues = Readonly<Record<string, readonly string[]>>

/** Blank values dropped and a value given twice kept once, as the registry takes them. */
export function cleanValues(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((v) => v.trim()).filter((v) => v !== ''))]
}

/** The `labels` list takes several values even though the registry reports it as not `multiple`. */
export function takesSeveral(parameter: TemplateParameter): boolean {
  return parameter.multiple || (parameter.type === 'crs-list' && parameter.list === 'labels')
}

const compiled = new Map<string, RegExp | null>()

// Anchored so `test` matches the whole value, as the registry's Java `matches()` does. Unicode mode
// makes Java-only escapes fail to compile, so the check is skipped instead of misread.
function regexOf(pattern: string): RegExp | null {
  if (!compiled.has(pattern)) {
    let regex: RegExp | null
    try {
      regex = new RegExp(`^(?:${pattern})$`, 'u')
    } catch {
      regex = null
    }
    compiled.set(pattern, regex)
  }
  return compiled.get(pattern) ?? null
}

function countError(parameter: TemplateParameter, entered: string[]): string | undefined {
  // An empty parameter takes its default in the registry; a default was checked when it loaded.
  if (entered.length === 0) {
    return parameter.required && parameter.default.length === 0 ? `${parameter.label} is required` : undefined
  }
  if (!takesSeveral(parameter) && entered.length > 1) return `${parameter.label} takes one value`
  return undefined
}

function valueError(parameter: TemplateParameter, value: string): string | undefined {
  if (parameter.maxLength != null && value.length > parameter.maxLength) {
    return `At most ${parameter.maxLength} characters`
  }
  const regex = parameter.pattern ? regexOf(parameter.pattern) : null
  if (regex && !regex.test(value)) return parameter.message ?? `Must match ${parameter.pattern}`
  if (parameter.type === 'select' && !(parameter.options ?? []).includes(value)) {
    return `"${value}" is not one of the options`
  }
  return undefined
}

function errorOf(parameter: TemplateParameter, entered: string[]): string | undefined {
  const countFailure = countError(parameter, entered)
  if (countFailure || entered.length === 0) return countFailure
  for (const value of entered) {
    const error = valueError(parameter, value)
    if (error) return error
  }
  if (parameter.maxSelection != null && entered.length > parameter.maxSelection) {
    return `At most ${parameter.maxSelection} may be chosen`
  }
  return undefined
}

/**
 * The checks a template parameter's own definition allows in the browser — required, number of
 * values, maximum length, pattern, option and maximum selection — keyed by parameter name.
 *
 * A fast check only, sending nothing to the registry. A value outside a registry list or an
 * inactive employee is not checked here: the pickers offer only current values and employees, and
 * the dry run reports what still fails.
 */
export function templateParameterErrors(
  parameters: readonly TemplateParameter[],
  values: ParameterValues,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const parameter of parameters) {
    const error = errorOf(parameter, cleanValues(values[parameter.name]))
    if (error) errors[parameter.name] = error
  }
  return errors
}

export type TemplateRunBody = components['schemas']['TemplateComponentRequest']

/**
 * The body of a dry run: the entered values and the overrides, by create-request path. A
 * parameter left empty is left out, so the registry fills its default. The Jira task key and
 * comment are not part of a dry run — the registry checks the key's format first, and a key still
 * being typed would fail every run.
 */
export function templateRunBody(values: ParameterValues, overrides: ParameterValues): TemplateRunBody {
  const parameters: Record<string, string[]> = {}
  for (const [name, entered] of Object.entries(values)) {
    const cleaned = cleanValues(entered)
    if (cleaned.length > 0) parameters[name] = cleaned
  }
  return { parameters, overrides: Object.fromEntries(Object.entries(overrides).map(([path, v]) => [path, [...v]])) }
}

/** The values the Parameters form opens with: each parameter's default. */
export function initialParameterValues(parameters: readonly TemplateParameter[]): Record<string, string[]> {
  return Object.fromEntries(parameters.map((p) => [p.name, [...p.default]]))
}
