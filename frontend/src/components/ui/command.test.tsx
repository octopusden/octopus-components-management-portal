import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from './command'

describe('Command', () => {
  it('renders the input, a group, and its items', () => {
    render(
      <Command>
        <CommandInput placeholder="Search…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Components">
            <CommandItem>Open list</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    )
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument()
    expect(screen.getByText('Components')).toBeInTheDocument()
    expect(screen.getByText('Open list')).toBeInTheDocument()
  })
})
