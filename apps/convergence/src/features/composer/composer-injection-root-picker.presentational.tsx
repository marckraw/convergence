import type { FC } from 'react'
import { BookOpenText, FileText, Library } from 'lucide-react'
import type { ComposerInjectionRootItem } from './composer-injection-trigger.pure'
import { Code, Listbox, ListboxOption } from '@convergence/ui'
import { InlinePicker, InlinePickerState } from './inline-picker.presentational'
import { inlinePickerRow } from './inline-picker.styles'

interface ComposerInjectionRootPickerProps {
  open: boolean
  /** The list's id: the message field names it (aria-controls) and its active row. */
  listId: string
  items: ComposerInjectionRootItem[]
  highlightedIndex: number
  onSelect: (item: ComposerInjectionRootItem) => void
  onHover: (index: number) => void
}

function itemIcon(item: ComposerInjectionRootItem) {
  if (item.kind === 'context') {
    return <FileText className="h-3.5 w-3.5 shrink-0" />
  }
  if (item.kind === 'prompt') {
    return <BookOpenText className="h-3.5 w-3.5 shrink-0" />
  }
  return <Library className="h-3.5 w-3.5 shrink-0" />
}

/**
 * What `::` offers (context, skill, prompt): a Listbox the message field
 * drives (MAR-3616 DS3e). The field keeps the focus; its arrows move the
 * active row and Enter picks it. The empty message and the hidden Close sit
 * beside the list, never in it.
 */
export const ComposerInjectionRootPicker: FC<
  ComposerInjectionRootPickerProps
> = ({ open, listId, items, highlightedIndex, onSelect, onHover }) => {
  if (!open) return null

  return (
    <InlinePicker testId="composer-injection-root-picker">
      {items.length === 0 ? (
        <InlinePickerState state="empty" title="No matching injections" />
      ) : (
        <Listbox id={listId} aria-label="Injections" active={highlightedIndex}>
          {items.map((item, index) => (
            <ListboxOption
              key={item.kind}
              index={index}
              onHover={() => onHover(index)}
              onPick={() => onSelect(item)}
              data-testid={`composer-injection-root-item-${item.kind}`}
              className={inlinePickerRow}
            >
              <span className="mt-0.5 text-ink-muted">{itemIcon(item)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{item.label}</span>
                  <Code className="text-3xs text-ink-muted">{item.alias}</Code>
                </span>
                <span className="line-clamp-1 w-full text-2xs text-ink-muted">
                  {item.description}
                </span>
              </span>
            </ListboxOption>
          ))}
        </Listbox>
      )}
    </InlinePicker>
  )
}
