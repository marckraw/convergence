import type { FC } from 'react'
import { Repeat } from 'lucide-react'
import type { ProjectContextItem } from '@/entities/project-context'
import { Listbox, ListboxOption } from '@convergence/ui'
import { InlinePicker, InlinePickerState } from './inline-picker.presentational'
import {
  inlinePickerRow,
  inlinePickerRowDetail,
  inlinePickerRowLine,
} from './inline-picker.styles'

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
    <InlinePicker
      testId="composer-context-mention-picker"
      closeLabel="Close context mention picker"
      onDismiss={onDismiss}
    >
      {items.length === 0 ? (
        <InlinePickerState
          state="empty"
          title="No matching project context items"
        />
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
                className={inlinePickerRow}
              >
                <span className={inlinePickerRowLine}>
                  {item.reinjectMode === 'every-turn' ? (
                    <Repeat
                      aria-hidden
                      className="size-3 shrink-0 text-warning-ink"
                    />
                  ) : null}
                  <span className="truncate font-medium">{label}</span>
                </span>
                <span className={inlinePickerRowDetail}>
                  {bodyPreview(item.body)}
                </span>
              </ListboxOption>
            )
          })}
        </Listbox>
      )}
    </InlinePicker>
  )
}
