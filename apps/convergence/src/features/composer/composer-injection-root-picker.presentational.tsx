import type { FC } from 'react'
import { BookOpenText, FileText, Library } from 'lucide-react'
import type { ComposerInjectionRootItem } from './composer-injection-trigger.pure'
import { Button, Listbox, ListboxOption } from '@convergence/ui'

interface ComposerInjectionRootPickerProps {
  open: boolean
  /** The list's id: the message field names it (aria-controls) and its active row. */
  listId: string
  items: ComposerInjectionRootItem[]
  highlightedIndex: number
  onSelect: (item: ComposerInjectionRootItem) => void
  onHover: (index: number) => void
  onDismiss: () => void
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
> = ({
  open,
  listId,
  items,
  highlightedIndex,
  onSelect,
  onHover,
  onDismiss,
}) => {
  if (!open) return null

  return (
    <div
      className="absolute right-0 bottom-full left-0 z-50 mb-2 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      data-testid="composer-injection-root-picker"
    >
      {items.length === 0 ? (
        <div
          className="px-3 py-2 text-xs text-muted-foreground"
          data-testid="composer-injection-root-empty"
        >
          No matching injections.
        </div>
      ) : (
        <Listbox id={listId} aria-label="Injections" active={highlightedIndex}>
          {items.map((item, index) => (
            <ListboxOption
              key={item.kind}
              index={index}
              onHover={() => onHover(index)}
              onPick={() => onSelect(item)}
              data-testid={`composer-injection-root-item-${item.kind}`}
              className="items-start rounded px-2 py-1.5 text-xs"
            >
              <span className="mt-0.5 text-muted-foreground">
                {itemIcon(item)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{item.label}</span>
                  <code className="rounded border border-border/70 bg-muted/40 px-1 py-0.5 text-[10px] text-muted-foreground">
                    {item.alias}
                  </code>
                </span>
                <span className="line-clamp-1 w-full text-[11px] text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </ListboxOption>
          ))}
        </Listbox>
      )}
      <Button
        type="button"
        variant="ghost"
        onClick={onDismiss}
        aria-label="Close injection picker"
        className="sr-only"
      >
        Close
      </Button>
    </div>
  )
}
