import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { asCodeLineHref, highlightSubstring } from './asCodeSearch'

function marks(text: string, query: string): string[] {
  const { container } = render(<span>{highlightSubstring(text, query)}</span>)
  return Array.from(container.querySelectorAll('mark')).map((m) => m.textContent ?? '')
}

describe('asCodeLineHref', () => {
  it('opens the As Code tab at the given line', () => {
    expect(asCodeLineHref('3f2c-uuid', 12)).toBe('/components/3f2c-uuid?tab=as-code&line=12')
  })
})

describe('highlightSubstring', () => {
  it('marks every case-insensitive occurrence, keeping the original casing', () => {
    expect(marks('groupId = "Org.Example.org.example"', 'org.example')).toEqual(['Org.Example', 'org.example'])
  })

  it('keeps the surrounding text intact', () => {
    const { container } = render(<span>{highlightSubstring('a FOO b', 'foo')}</span>)
    expect(container.textContent).toBe('a FOO b')
  })

  it('treats regex metacharacters literally', () => {
    expect(marks('version = "1.0.*"', '.*')).toEqual(['.*'])
  })

  it('marks nothing for a blank query or no occurrence', () => {
    expect(marks('anything', '  ')).toEqual([])
    expect(marks('anything', 'zzz')).toEqual([])
  })
})
