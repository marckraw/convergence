import type { FC } from 'react'
import { BookOpenText, Loader2 } from 'lucide-react'
import type { PromptLibraryEntry } from '@/entities/prompt-library'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'

interface ComposerPromptInjectionPickerProps {
  open: boolean
  items: PromptLibraryEntry[]
  highlightedIndex: number
  isLoading: boolean
  error: string | null
  onSelect: (prompt: PromptLibraryEntry) => void
  onHover: (index: number) => void
  onDismiss: () => void
}

export const ComposerPromptInjectionPicker: FC<
  ComposerPromptInjectionPickerProps
> = ({
  open,
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
    <div
      className="absolute right-0 bottom-full left-0 z-50 mb-2 max-h-72 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      data-testid="composer-prompt-injection-picker"
      role="listbox"
    >
      <div className="border-b border-border/70 px-2 py-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <BookOpenText className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Prompts</span>
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          Prompt library
        </div>
      </div>
      {error ? (
        <div className="px-3 py-2 text-xs text-destructive">{error}</div>
      ) : isLoading ? (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading prompts...
        </div>
      ) : items.length === 0 ? (
        <div
          className="px-3 py-2 text-xs text-muted-foreground"
          data-testid="composer-prompt-injection-empty"
        >
          No matching prompts.
        </div>
      ) : (
        items.map((prompt, index) => {
          const isActive = index === highlightedIndex
          return (
            <Button
              key={prompt.id}
              type="button"
              variant="ghost"
              role="option"
              aria-selected={isActive}
              onMouseEnter={() => onHover(index)}
              onClick={() => onSelect(prompt)}
              data-testid={`composer-prompt-injection-item-${prompt.id}`}
              className={cn(
                'flex h-auto w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left text-xs',
                isActive && 'bg-accent text-accent-foreground',
              )}
            >
              <span className="flex w-full min-w-0 items-center gap-1.5">
                <span className="truncate font-medium">{prompt.title}</span>
                <span className="ml-auto shrink-0 rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                  {prompt.sourceLabel}
                </span>
              </span>
              <span className="line-clamp-2 w-full text-[11px] text-muted-foreground">
                {prompt.shortDescription ||
                  prompt.description ||
                  prompt.relativePath}
              </span>
              {prompt.tags.length > 0 ? (
                <span className="mt-0.5 flex w-full flex-wrap gap-1">
                  {prompt.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              ) : null}
            </Button>
          )
        })
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDismiss}
        className="sr-only"
        aria-label="Close prompt injection picker"
      >
        Close
      </Button>
    </div>
  )
}
