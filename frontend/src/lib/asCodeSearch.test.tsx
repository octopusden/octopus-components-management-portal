import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { asCodeLineHref, highlightRanges } from './asCodeSearch'
import type { AsCodeMatchRange } from './types'

function render_(text: string, ranges: AsCodeMatchRange[]) {
  const { container } = render(<span>{highlightRanges(text, ranges)}</span>)
  return {
    marks: Array.from(container.querySelectorAll('mark')).map((m) => m.textContent ?? ''),
    text: container.textContent,
  }
}

describe('asCodeLineHref', () => {
  it('opens the As Code tab at the given line', () => {
    expect(asCodeLineHref('3f2c-uuid', 12)).toBe('/components/3f2c-uuid?tab=as-code&line=12')
  })
})

describe('highlightRanges', () => {
  it('marks exactly the server-reported spans and keeps the text intact', () => {
    const out = render_('groupId = "Org.Example.org.example"', [
      { start: 11, end: 22 },
      { start: 23, end: 34 },
    ])
    expect(out.marks).toEqual(['Org.Example', 'org.example'])
    expect(out.text).toBe('groupId = "Org.Example.org.example"')
  })

  it('marks regex hits as reported (no client-side regex)', () => {
    // e.g. the server matched `\d+\.\d+` against `javaVersion = "21.0"`.
    expect(render_('javaVersion = "21.0"', [{ start: 15, end: 19 }]).marks).toEqual(['21.0'])
  })

  it('sorts spans and ignores empty, out-of-range or overlapping ones', () => {
    const out = render_('abcdef', [
      { start: 4, end: 6 },
      { start: 0, end: 2 },
      { start: 1, end: 3 }, // overlaps the first — only its non-overlapping tail is marked
      { start: 3, end: 3 }, // empty
      { start: 5, end: 99 }, // runs past the end, already covered
    ])
    expect(out.marks).toEqual(['ab', 'c', 'ef'])
    expect(out.text).toBe('abcdef')
  })

  it('marks nothing when there are no spans', () => {
    expect(render_('anything', []).marks).toEqual([])
  })
})
