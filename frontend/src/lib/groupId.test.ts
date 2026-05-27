import { describe, it, expect } from 'vitest'
import { suggestGroupId } from './groupId'

describe('suggestGroupId', () => {
  it('returns empty string when parent is empty (no suggestion)', () => {
    expect(suggestGroupId('widget', '')).toBe('')
  })

  it('returns empty string when parent is whitespace-only', () => {
    expect(suggestGroupId('widget', '   ')).toBe('')
  })

  it('appends a lowercase suffix derived from the component key', () => {
    expect(suggestGroupId('widget', 'com.example')).toBe('com.example.widget')
  })

  it('collapses kebab-case to dots', () => {
    expect(suggestGroupId('widget-svc', 'com.example')).toBe('com.example.widget.svc')
  })

  it('collapses underscores to dots', () => {
    expect(suggestGroupId('widget_svc', 'com.example')).toBe('com.example.widget.svc')
  })

  it('lowercases mixed-case keys', () => {
    expect(suggestGroupId('WidgetSvc', 'com.example')).toBe('com.example.widgetsvc')
  })

  it('preserves existing dots in the key', () => {
    expect(suggestGroupId('widget.svc', 'com.example')).toBe('com.example.widget.svc')
  })

  it('treats slashes as separators', () => {
    expect(suggestGroupId('widget/svc', 'com.example')).toBe('com.example.widget.svc')
  })

  it('treats spaces as separators', () => {
    expect(suggestGroupId('widget svc', 'com.example')).toBe('com.example.widget.svc')
  })

  it('strips unicode / non-ascii characters', () => {
    expect(suggestGroupId('widget—β', 'com.example')).toBe('com.example.widget')
  })

  it('collapses consecutive separators into a single dot', () => {
    expect(suggestGroupId('widget---svc', 'com.example')).toBe('com.example.widget.svc')
  })

  it('trims leading and trailing dots from the suffix', () => {
    expect(suggestGroupId('-widget-', 'com.example')).toBe('com.example.widget')
  })

  it('handles a multi-segment kebab + underscore mix', () => {
    expect(suggestGroupId('my_lib-v2', 'com.example')).toBe('com.example.my.lib.v2')
  })

  it('returns the parent itself when the key collapses to empty', () => {
    expect(suggestGroupId('---', 'com.example')).toBe('com.example')
  })

  it('does not lowercase the parent (parent already comes from a trusted source)', () => {
    // We pass parent through unchanged so admins can configure case if they want;
    // the validation step on the consumer side does a case-insensitive compare.
    expect(suggestGroupId('widget', 'org.Example')).toBe('org.Example.widget')
  })

  it('collapses repeated dots even when interleaved with disallowed characters', () => {
    // Exercises the second-pass `/\.{2,}/` collapse: the first pass turns
    // `-` into `.`, so the input below becomes `widget...svc` before the
    // collapse rolls it back to `widget.svc`.
    expect(suggestGroupId('widget.-.svc', 'com.example')).toBe('com.example.widget.svc')
  })
})
