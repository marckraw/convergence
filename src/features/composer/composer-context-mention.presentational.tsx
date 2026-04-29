import type { FC } from 'react'
import { Repeat } from 'lucide-react'
import type { ProjectContextItem } from '@/entities/project-context'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'

const BODY_PREVIEW_LIMIT = 90

function bodyPreview(body: string): string {
  const trimmed = body.trim()
  if (trimmed.length <= BODY_PREVIEW_LIMIT) return trimmed
  return `${trimmed.slice(0, BODY_PREVIEW_LIMIT)}…`
}

interface ComposerContextMentionPickerProps {
  open: boolean
  items: ProjectContextItem[]
  highlightedIndex: number
  onSelect: (item: ProjectContextItem) => void
  onHover: (index: number) => void
  onDismiss: () => void
}

export const ComposerContextMentionPicker: FC<
  ComposerContextMentionPickerProps
> = ({ open, items, highlightedIndex, onSelect, onHover, onDismiss }) => {
  if (!open) return null

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-50 mb-2 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      data-testid="composer-context-mention-picker"
      role="listbox"
    >
      {items.length === 0 ? (
        <div
          className="px-3 py-2 text-xs text-muted-foreground"
          data-testid="composer-context-mention-empty"
        >
          No matching project context items.
        </div>
      ) : (
        items.map((item, index) => {
          const label = item.label?.trim() ? item.label : 'Untitled'
          const isActive = index === highlightedIndex
          return (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              role="option"
              aria-selected={isActive}
              onMouseEnter={() => onHover(index)}
              onClick={() => onSelect(item)}
              data-testid={`composer-context-mention-item-${item.id}`}
              className={cn(
                'flex h-auto w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left text-xs',
                isActive && 'bg-accent text-accent-foreground',
              )}
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
        aria-label="Close context mention picker"
      >
        Close
      </Button>
    </div>
  )
}
