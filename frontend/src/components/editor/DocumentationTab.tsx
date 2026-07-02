import { UseFormReturn, useFieldArray } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { ComponentSelect } from '../ui/ComponentSelect'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import type { GeneralFormValues } from './GeneralTab'

interface DocumentationTabProps {
  form: UseFormReturn<GeneralFormValues>
}

/**
 * Doc-links editor, split out of GeneralTab into its own sidebar topic. Works on
 * the SAME page-owned RHF form as GeneralTab — the `docs` field is hydrated by
 * GeneralTab's mount effect (General is the default tab) and re-baselined by the
 * page's on-id-change reset / post-save reset, so this tab just renders the
 * current form value and edits it in place.
 */
export function DocumentationTab({ form }: DocumentationTabProps) {
  const { control, register, setValue, watch } = form
  // useFieldArray provides stable `id` keys so row re-renders don't blow away
  // focus on text inputs.
  const docsFieldArray = useFieldArray({ control, name: 'docs' })
  // Doc-link rows use a controlled ComponentSelect (filtered to label=doc), so
  // watch the array to feed each row's current value.
  const watchedDocs = watch('docs')

  return (
    <section data-testid="section-references" className="space-y-4">
      <div className="flex items-center gap-1">
        <h3 className="text-sm font-medium text-muted-foreground">
          <FieldLabelText path="component.docs" fallback="Documentation" />
        </h3>
        <FieldInfo path="component.docs" label="Documentation" />
      </div>
      <p className="text-[13px] text-muted-foreground">
        Links from this component to its documentation components (those carrying the <code>doc</code> label), each
        pinned to a major version.
      </p>
      <div className="space-y-2">
        {docsFieldArray.fields.length === 0 ? (
          <p className="text-xs text-muted-foreground">No documentation links configured.</p>
        ) : (
          docsFieldArray.fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              {/* Doc target restricted to components carrying the `doc` label.
                  `strict` enforces the restriction: only a suggestion click
                  (drawn from the doc-filtered list) commits — a free-typed
                  non-doc key reverts on blur instead of being saved. Without
                  it the `filter` only narrowed the suggestions while any typed
                  key still committed. */}
              <ComponentSelect
                id={`docs-${index}-key`}
                ariaLabel={`Doc link component key (row ${index + 1})`}
                value={watchedDocs?.[index]?.docComponentKey ?? ''}
                onChange={(val) =>
                  setValue(`docs.${index}.docComponentKey` as const, val, { shouldDirty: true })
                }
                filter={{ labels: ['doc'] }}
                strict
                placeholder="docs-component-key"
              />
              <Input
                placeholder="majorVersion (e.g. 3.x)"
                aria-label={`Doc link major version (row ${index + 1})`}
                {...register(`docs.${index}.majorVersion` as const)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-destructive"
                onClick={() => docsFieldArray.remove(index)}
                aria-label="Remove doc link"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => docsFieldArray.append({ docComponentKey: '', majorVersion: '' })}
        >
          <Plus className="h-4 w-4" />
          Add doc link
        </Button>
      </div>
    </section>
  )
}
