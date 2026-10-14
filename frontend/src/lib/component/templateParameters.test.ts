import { describe, it, expect } from 'vitest'
import { templateParameterErrors, templateRunBody, type TemplateParameter } from './templateParameters'

function param(name: string, overrides: Partial<TemplateParameter> = {}): TemplateParameter {
  return { name, label: name, type: 'text', required: true, multiple: false, default: [], ...overrides }
}

const errorsOf = (p: TemplateParameter, values: string[] | undefined) =>
  templateParameterErrors([p], values === undefined ? {} : { [p.name]: values })[p.name]

describe('templateParameterErrors', () => {
  describe('required (P2)', () => {
    it('fails a required parameter left empty', () => {
      expect(errorsOf(param('CODE', { label: 'Plugin code' }), [])).toBe('Plugin code is required')
    })

    it('fails a required parameter given only blank values', () => {
      expect(errorsOf(param('CODE', { label: 'Plugin code' }), ['', '  '])).toBe('Plugin code is required')
    })

    it('passes an empty optional parameter', () => {
      expect(errorsOf(param('CODE', { required: false }), undefined)).toBeUndefined()
    })

    it('lets an empty parameter take its default, so required passes', () => {
      expect(errorsOf(param('BRANCH', { default: ['main'] }), [])).toBeUndefined()
    })
  })

  describe('number of values (P3)', () => {
    it('fails two values for a single-value parameter', () => {
      expect(errorsOf(param('CODE', { label: 'Plugin code' }), ['A1', 'B2'])).toBe('Plugin code takes one value')
    })

    it('counts a value given twice once', () => {
      expect(errorsOf(param('CODE'), ['ABC', 'ABC'])).toBeUndefined()
    })

    it('lets the labels list take several values, though the registry reports it as not multiple', () => {
      expect(errorsOf(param('LABELS', { type: 'crs-list', list: 'labels', values: ['a', 'b'] }), ['a', 'b'])).toBeUndefined()
    })

    it('lets a multiple person parameter take several people', () => {
      expect(errorsOf(param('CHAMPIONS', { type: 'person', multiple: true }), ['jdoe', 'asmith'])).toBeUndefined()
    })
  })

  describe('text (P4, P5)', () => {
    it('fails a value longer than the maximum length', () => {
      expect(errorsOf(param('NAME', { maxLength: 5 }), ['abcdef'])).toBe('At most 5 characters')
    })

    it('shows the template message when the pattern fails', () => {
      const p = param('CODE', {
        pattern: '^[A-Z][A-Z0-9]{2,15}$',
        message: '3–16 uppercase letters or digits, starting with a letter.',
      })
      expect(errorsOf(p, ['pay'])).toBe('3–16 uppercase letters or digits, starting with a letter.')
      expect(errorsOf(p, ['PAY'])).toBeUndefined()
    })

    it('matches the whole value, as the registry does', () => {
      expect(errorsOf(param('CODE', { pattern: '[A-Z]+' }), ['ABC1'])).toBe('Must match [A-Z]+')
    })

    it('skips a pattern the browser cannot compile, leaving it to the dry run', () => {
      expect(errorsOf(param('CODE', { pattern: '\\p{Lower}+' }), ['abc'])).toBeUndefined()
    })

    it('checks only what was typed, not a default the registry fills in', () => {
      expect(errorsOf(param('CODE', { required: false, pattern: '[A-Z]+' }), [])).toBeUndefined()
    })
  })

  describe('select (P6, P9)', () => {
    const select = (overrides: Partial<TemplateParameter> = {}) =>
      param('REGION', { label: 'Region', type: 'select', options: ['eu', 'us', 'apac'], ...overrides })

    it('fails a value that is not one of the options', () => {
      expect(errorsOf(select(), ['mars'])).toBe('"mars" is not one of the options')
    })

    it('fails more options than the maximum selection', () => {
      expect(errorsOf(select({ multiple: true, maxSelection: 2 }), ['eu', 'us', 'apac'])).toBe('At most 2 may be chosen')
    })

    it('passes up to the maximum selection', () => {
      expect(errorsOf(select({ multiple: true, maxSelection: 2 }), ['eu', 'us'])).toBeUndefined()
    })
  })

  it('reports each failing parameter under its own name', () => {
    const errors = templateParameterErrors(
      [param('A', { label: 'First' }), param('B', { label: 'Second' }), param('C', { required: false })],
      { A: [], B: ['x'] },
    )
    expect(errors).toEqual({ A: 'First is required' })
  })
})

describe('templateRunBody', () => {
  it('sends each parameter cleaned of blanks and repeats, and leaves an empty one out for its default', () => {
    expect(templateRunBody({ CODE: [' PAY ', 'PAY'], NAME: ['', ' '], LABELS: ['sql', 'ui'] }, {})).toEqual({
      parameters: { CODE: ['PAY'], LABELS: ['sql', 'ui'] },
      overrides: {},
    })
  })

  it('sends overrides by create-request path', () => {
    const path = 'baseConfiguration.vcsEntries[0].vcsPath'
    expect(templateRunBody({}, { [path]: ['ssh://git@git.example.com/x.git'] }).overrides).toEqual({
      [path]: ['ssh://git@git.example.com/x.git'],
    })
  })

  it('carries no Jira task key or comment: only Create sends those', () => {
    expect(Object.keys(templateRunBody({ CODE: ['PAY'] }, {}))).toEqual(['parameters', 'overrides'])
  })
})
