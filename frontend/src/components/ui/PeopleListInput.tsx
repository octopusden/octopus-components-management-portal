import { useMemo, useState } from 'react'
import { GripVertical, Trash2 } from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from './button'
import { EmployeeStatusBadge, PeopleInput } from './PeopleInput'
import type { EmployeeMatch, EmployeeStatuses } from '../../hooks/useEmployees'

/**
 * Ordered, reorderable multi-people editor. Renders the current people as a
 * vertical list of rows (drag-handle / remove per row) plus an add-row that
 * reuses the single-value {@link PeopleInput} autocomplete (owners + optional
 * external lookup).
 *
 * Reorder is by dragging the grip handle (mouse / touch) or by keyboard on the
 * grip (Space/Enter to lift, ↑/↓ to move, Space/Enter to drop, Esc to cancel)
 * via dnd-kit's {@link KeyboardSensor}. Screen-reader announcements describe
 * every pick-up / move / drop.
 *
 * Order is meaningful — the array is an ordered list (first = primary), matching
 * the CRS v4 `releaseManager` / `securityChampion` ordered child-row contract.
 *
 * Dedupe: a username already present in the list cannot be added again
 * (keep-first), mirroring the server-side canonicalization. That keeps adds via
 * the UI unique; the parent must likewise supply a duplicate-free `value` (the
 * CRS backend canonicalizes server-side, so this holds in practice) — the
 * username is used as the stable sortable id and dnd-kit requires unique ids.
 * The parent owns the `value` array; this component only emits a new array via
 * `onChange` and never mutates server state.
 */
export interface PeopleListInputProps {
  /** Currently selected people, in user-controlled order. */
  value: string[]
  /** Called with the new ordered array on every add / remove / reorder. */
  onChange: (value: string[]) => void
  /** Disables the add control and every row control (grip + remove). */
  disabled?: boolean
  /** Placeholder copy for the add-row autocomplete. */
  placeholder?: string
  /** External lookup forwarded to the embedded {@link PeopleInput}. */
  lookupFn?: (query: string) => Promise<EmployeeMatch[]>
  /** Batch active status for stored rows; null renders a not-verified badge. */
  statuses?: EmployeeStatuses
}

interface SortablePersonRowProps {
  person: string
  idx: number
  disabled?: boolean
  status?: boolean | null
  onRemove: (idx: number) => void
}

/**
 * A single draggable row. Lives in its own component so each row can call
 * {@link useSortable} (hooks cannot run inside the `.map` of the parent). The
 * whole row is the sortable node (`setNodeRef`); only the grip is the drag
 * activator (`setActivatorNodeRef` + dnd-kit listeners) so a click on the
 * remove button never starts a drag.
 */
function SortablePersonRow({ person, idx, disabled, status, onRemove }: SortablePersonRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: person, disabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 ${isDragging ? 'relative z-10 opacity-80' : ''}`}
      data-testid={`person-row-${idx}`}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 cursor-grab touch-none"
        ref={setActivatorNodeRef}
        disabled={disabled}
        aria-label={`Drag ${person} to reorder`}
        {...attributes}
        {...(disabled ? {} : listeners)}
      >
        <GripVertical className="h-4 w-4" />
      </Button>
      <span className="flex-1 truncate rounded-md border border-input bg-muted/40 px-3 py-1.5 text-sm">
        {person}
      </span>
      <EmployeeStatusBadge status={status} showUnknown />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-destructive"
        disabled={disabled}
        onClick={() => onRemove(idx)}
        aria-label={`Remove ${person}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

export function PeopleListInput({
  value,
  onChange,
  disabled,
  placeholder = 'Add person',
  lookupFn,
  statuses = {},
}: PeopleListInputProps) {
  // Remount key for the add-row PeopleInput. PeopleInput owns its internal
  // inputValue state and only re-syncs from the `value` prop when that prop
  // changes; we always pass `value=""`, so bumping this key is what clears the
  // embedded input after each add (or rejected duplicate).
  const [addKey, setAddKey] = useState(0)

  // PointerSensor: a 4px activation distance so a plain click on the remove
  // button (or the grip) isn't interpreted as a drag. KeyboardSensor +
  // sortableKeyboardCoordinates: full keyboard reorder on the focused grip.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleAdd = (raw: string) => {
    const person = raw.trim()
    // Clear the add input regardless (empty / duplicate / accepted) so the
    // control is always ready for the next pick.
    setAddKey((k) => k + 1)
    if (!person) return
    // Keep-first dedupe — never add a username already in the list.
    if (value.includes(person)) return
    onChange([...value, person])
  }

  const handleRemove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = value.indexOf(String(active.id))
    const newIndex = value.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    onChange(arrayMove(value, oldIndex, newIndex))
  }

  // Screen-reader support for keyboard dragging. Memoised so DndContext does not
  // see a fresh accessibility object on every render.
  const screenReaderInstructions = useMemo<ScreenReaderInstructions>(
    () => ({
      draggable:
        'To reorder a person, press Space or Enter to pick it up. While dragging, ' +
        'use the Arrow Up and Arrow Down keys to move it, then press Space or Enter ' +
        'to drop it in its new position, or press Escape to cancel.',
    }),
    [],
  )

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) =>
        `Picked up ${active.id}. It is in position ${value.indexOf(String(active.id)) + 1} of ${value.length}.`,
      onDragOver: ({ active, over }) =>
        over
          ? `${active.id} was moved to position ${value.indexOf(String(over.id)) + 1} of ${value.length}.`
          : `${active.id} is no longer over a reorder target.`,
      onDragEnd: ({ active, over }) =>
        over
          ? `${active.id} was dropped in position ${value.indexOf(String(over.id)) + 1} of ${value.length}.`
          : `${active.id} was dropped.`,
      onDragCancel: ({ active }) =>
        `Reordering cancelled. ${active.id} was returned to its original position.`,
    }),
    [value],
  )

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">No people yet</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{ announcements, screenReaderInstructions }}
        >
          <SortableContext items={value} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5" data-testid="people-list-rows">
              {value.map((person, idx) => (
                <SortablePersonRow
                  key={person}
                  person={person}
                  idx={idx}
                  disabled={disabled}
                  status={statuses[person]}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {!disabled && (
        <PeopleInput key={addKey} value="" onChange={handleAdd} placeholder={placeholder} lookupFn={lookupFn} />
      )}
    </div>
  )
}
