import type { FC } from 'react'
import { BookOpenText } from 'lucide-react'
import type { PromptLibraryEntry } from '@/entities/prompt-library'
import { Badge, Listbox, ListboxOption } from '@convergence/ui'
import { InlinePicker, InlinePickerState } from './inline-picker.presentational'
import {
  inlinePickerRow,
  inlinePickerRowDetail,
  inlinePickerRowLine,
} from './inline-picker.styles'

interface ComposerPromptInjectionPickerProps {
  open: boolean
  /** The list's id: the message field names it (aria-controls) and its active row. */
  listId: string
  items: PromptLibraryEntry[]
  highlightedIndex: number
  isLoading: boolean
  error: string | null
  onSelect: (prompt: PromptLibraryEntry) => void
  onHover: (index: number) => void
  onDismiss: () => void
}

/**
 * The prompt library under `::prompt::`: a Listbox the message field drives
 * (MAR-3616 DS3e). The field keeps the focus; its arrows move the active row
 * and Enter picks it. The heading, the loading, failed and empty lines and
 * the hidden Close sit beside the list, never in it.
 */
export const ComposerPromptInjectionPicker: FC<
  ComposerPromptInjectionPickerProps
> = ({
  open,
  listId,
  items,
  highlightedIndex,
  isLoading,
  error,
  onSelect,
  onHover,
  onDismiss,
}) => {
  if (!open) return null

  return (
    <InlinePicker
      testId="composer-prompt-injection-picker"
      heading={{
        icon: <BookOpenText />,
        title: 'Prompts',
        detail: 'Prompt library',
      }}
      closeLabel="Close prompt injection picker"
      onDismiss={onDismiss}
      tall
    >
      {error ? (
        <InlinePickerState
          state="failed"
          title="Couldn’t load prompts"
          detail={error}
        />
      ) : isLoading ? (
        <InlinePickerState state="loading" title="Loading prompts…" />
      ) : items.length === 0 ? (
        <InlinePickerState state="empty" title="No matching prompts" />
      ) : (
        <Listbox
          id={listId}
          aria-label="Prompts"
          active={highlightedIndex}
          multiline
        >
          {items.map((prompt, index) => (
            <ListboxOption
              key={prompt.id}
              index={index}
              onHover={() => onHover(index)}
              onPick={() => onSelect(prompt)}
              data-testid={`composer-prompt-injection-item-${prompt.id}`}
              className={inlinePickerRow}
            >
              <span className={inlinePickerRowLine}>
                <span className="truncate font-medium">{prompt.title}</span>
                <Badge shape="label" caps className="ml-auto">
                  {prompt.sourceLabel}
                </Badge>
              </span>
              <span className={inlinePickerRowDetail}>
                {prompt.shortDescription ||
                  prompt.description ||
                  prompt.relativePath}
              </span>
              {prompt.tags.length > 0 ? (
                <span className="mt-0.5 flex w-full flex-wrap gap-1">
                  {prompt.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} shape="label">
                      {tag}
                    </Badge>
                  ))}
                </span>
              ) : null}
            </ListboxOption>
          ))}
        </Listbox>
      )}
    </InlinePicker>
  )
}
