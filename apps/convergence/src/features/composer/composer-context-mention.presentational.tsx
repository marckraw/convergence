import type { FC } from 'react'
import { Repeat } from 'lucide-react'
import type { ProjectContextItem } from '@/entities/project-context'
import { Button, Listbox, ListboxOption } from '@convergence/ui'

const BODY_PREVIEW_LIMIT = 90

function bodyPreview(body: string): string {
  const trimmed = body.trim()
  if (trimmed.length <= BODY_PREVIEW_LIMIT) return trimmed
  return `${trimmed.slice(0, BODY_PREVIEW_LIMIT)}…`
}

interface ComposerContextMentionPickerProps {
  open: boolean
  /** The list's id: the message field names it (aria-controls) and its active row. */
  listId: string
  items: ProjectContextItem[]
  highlightedIndex: number
  onSelect: (item: ProjectContextItem) => void
  onHover: (index: number) => void
  onDismiss: () => void
}

/**
 * The project context `@` offers: a Listbox the message field drives
 * (MAR-3616 DS3e). The field keeps the focus; its arrows move the active row
 * and Enter picks it. The empty message and the hidden Close sit beside the
 * list, never in it.
 */
export const ComposerContextMentionPicker: FC<
  ComposerContextMentionPickerProps
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
      className="absolute bottom-full left-0 right-0 z-50 mb-2 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      data-testid="composer-context-mention-picker"
    >
      {items.length === 0 ? (
        <div
          className="px-3 py-2 text-xs text-muted-foreground"
          data-testid="composer-context-mention-empty"
        >
          No matching project context items.
        </div>
      ) : (
        <Listbox
          id={listId}
          aria-label="Project context"
          active={highlightedIndex}
          multiline
        >
          {items.map((item, index) => {
            const label = item.label?.trim() ? item.label : 'Untitled'
            return (
              <ListboxOption
                key={item.id}
                index={index}
                onHover={() => onHover(index)}
                onPick={() => onSelect(item)}
                data-testid={`composer-context-mention-item-${item.id}`}
                className="items-start rounded px-2 py-1.5 text-xs"
              >
                <span className="flex w-full min-w-0 items-center gap-1.5">
                  {item.reinjectMode === 'every-turn' ? (
                    <Repeat className="h-3 w-3 shrink-0 text-amber-500" />
                  ) : null}
                  <span className="truncate font-medium">{label}</span>
                </span>
                <span className="line-clamp-2 w-full text-[11px] text-muted-foreground">
                  {bodyPreview(item.body)}
                </span>
              </ListboxOption>
            )
          })}
        </Listbox>
      )}
      <Button
        type="button"
        variant="ghost"
        onClick={onDismiss}
        aria-label="Close context mention picker"
        className="sr-only"
      >
        Close
      </Button>
    </div>
  )
}
