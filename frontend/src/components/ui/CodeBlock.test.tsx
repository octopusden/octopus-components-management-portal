import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CodeBlock } from './CodeBlock'

describe('CodeBlock', () => {
  it('renders the code text across highlighted spans', () => {
    const code = 'bcomponent {\n    componentOwner = "user1"\n}\n'
    const { container } = render(<CodeBlock code={code} />)
    expect(container.textContent).toContain('componentOwner = "user1"')
    expect(container.textContent).toContain('bcomponent {')
  })

  it('colors enum tokens distinctly from string values', () => {
    render(<CodeBlock code={'build {\n    buildSystem = MAVEN\n}'} />)
    expect(screen.getByText('MAVEN').className).toContain('text-code-enum')
  })

  it('drops a single trailing newline (no empty last line span)', () => {
    const { container } = render(<CodeBlock code={'x {\n}\n'} />)
    const lines = container.querySelectorAll('code > span')
    expect(lines.length).toBe(2)
  })

  it('marks the requested 1-based line and scrolls it into view', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { container } = render(<CodeBlock code={'a {\n    x = 1\n}\n'} highlightLine={2} />)
    const marked = container.querySelectorAll('[data-highlighted="true"]')
    expect(marked.length).toBe(1)
    expect(marked[0]?.textContent).toBe('    x = 1')
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
  })

  it('marks nothing without highlightLine', () => {
    const { container } = render(<CodeBlock code={'a {\n}\n'} />)
    expect(container.querySelectorAll('[data-highlighted]').length).toBe(0)
  })

  it('renders a dark pane whose line numbers are not part of the text (copy yields code only)', () => {
    const { container } = render(<CodeBlock code={'a {\n    x = 1\n}\n'} />)
    expect(container.querySelector('pre')?.className).toContain('bg-code-bg')
    expect(container.textContent).toBe('a {    x = 1}')
  })
})
