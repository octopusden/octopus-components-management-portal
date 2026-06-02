import { describe, it, expect } from 'vitest'
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
    expect(screen.getByText('MAVEN').className).toContain('amber')
  })

  it('drops a single trailing newline (no empty last line span)', () => {
    const { container } = render(<CodeBlock code={'x {\n}\n'} />)
    const lines = container.querySelectorAll('code > span.block')
    expect(lines.length).toBe(2)
  })
})
