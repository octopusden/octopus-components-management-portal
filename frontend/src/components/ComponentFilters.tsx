import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Button } from './ui/button'
import { Switch } from './ui/switch'
import { Label } from './ui/label'
import type { ComponentFilter } from '../lib/types'
import { useOwners } from '../hooks/useOwners'
import { useCurrentUser } from '../hooks/useCurrentUser'

interface ComponentFiltersProps {
  filter: ComponentFilter
  onFilterChange: (filter: ComponentFilter) => void
}

// Common system and product type values — can be extended later from API
const SYSTEM_OPTIONS = [
  'ALFA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO',
]

const PRODUCT_TYPE_OPTIONS = [
  'PRODUCT', 'COMPONENT', 'LIBRARY', 'SERVICE',
]

const ALL_VALUE = '__all__'

export function ComponentFilters({ filter, onFilterChange }: ComponentFiltersProps) {
  const [searchValue, setSearchValue] = useState(filter.search ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync external filter.search into local state when it changes from outside
  useEffect(() => {
    setSearchValue(filter.search ?? '')
  }, [filter.search])

  const handleSearchChange = (value: string) => {
    setSearchValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onFilterChange({ ...filter, search: value || undefined })
    }, 300)
  }

  const handleSystemChange = (value: string) => {
    onFilterChange({ ...filter, system: value === ALL_VALUE ? undefined : value })
  }

  const handleProductTypeChange = (value: string) => {
    onFilterChange({ ...filter, productType: value === ALL_VALUE ? undefined : value })
  }

  const handleOwnerChange = (value: string) => {
    onFilterChange({ ...filter, owner: value === ALL_VALUE ? undefined : value })
  }

  // Archived filter: 2-state cycle — false (active only, default) ↔ undefined (all)
  const handleArchivedToggle = () => {
    if (filter.archived === false) {
      onFilterChange({ ...filter, archived: undefined })
    } else {
      onFilterChange({ ...filter, archived: false })
    }
  }

  const handleClearAll = () => {
    setSearchValue('')
    // Reset to default: archived: false (active only)
    onFilterChange({ archived: false })
  }

  // archived: false is the default — does not count as an active filter
  const hasActiveFilters =
    !!filter.search ||
    !!filter.system ||
    !!filter.productType ||
    !!filter.owner ||
    filter.archived === undefined

  // Owner list comes from /components/meta/owners (B7.1.1, SYS-035 backend).
  // Cached for 5 minutes by useOwners; the list is small so we render every
  // value flat — no virtualization, no search-as-you-type. If/when the list
  // grows beyond a few hundred we can switch to a typeahead picker matching
  // PeopleInput's pattern.
  const { data: owners = [] } = useOwners()
  const { data: currentUser } = useCurrentUser()

  // My Components: when checked, owner is pinned to the current user
  const myComponentsChecked = !!currentUser && filter.owner === currentUser.username
  const handleMyComponentsChange = (checked: boolean) => {
    if (checked && currentUser) {
      onFilterChange({ ...filter, owner: currentUser.username })
    } else {
      onFilterChange({ ...filter, owner: undefined })
    }
  }

  const archivedLabel =
    filter.archived === false
      ? 'Show archived components'
      : 'Hide archived components'

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search components..."
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select value={filter.system ?? ALL_VALUE} onValueChange={handleSystemChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="All systems" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All systems</SelectItem>
          {SYSTEM_OPTIONS.map((sys) => (
            <SelectItem key={sys} value={sys}>
              {sys}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filter.productType ?? ALL_VALUE} onValueChange={handleProductTypeChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All types</SelectItem>
          {PRODUCT_TYPE_OPTIONS.map((pt) => (
            <SelectItem key={pt} value={pt}>
              {pt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filter.owner ?? ALL_VALUE}
        onValueChange={handleOwnerChange}
        disabled={myComponentsChecked}
      >
        <SelectTrigger className="w-[180px]" aria-label="Owner">
          <SelectValue placeholder="All owners" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All owners</SelectItem>
          {owners.map((owner) => (
            <SelectItem key={owner} value={owner}>
              {owner}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Switch
          id="my-components"
          checked={myComponentsChecked}
          onCheckedChange={handleMyComponentsChange}
          disabled={!currentUser}
          aria-label="My Components"
        />
        <Label htmlFor="my-components" className="cursor-pointer text-sm">
          My Components
        </Label>
      </div>

      <Button variant="outline" size="sm" onClick={handleArchivedToggle}>
        {archivedLabel}
      </Button>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={handleClearAll}>
          Clear filters
        </Button>
      )}
    </div>
  )
}
