import type { FC } from 'react'
import { BookOpenText, FileText, Library } from 'lucide-react'
import type { ComposerInjectionRootItem } from './composer-injection-trigger.pure'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'

interface ComposerInjectionRootPickerProps {
  open: boolean
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

export const ComposerInjectionRootPicker: FC<
  ComposerInjectionRootPickerProps
> = ({ open, items, highlightedIndex, onSelect, onHover, onDismiss }) => {
  if (!open) return null

  return (
    <div
      className="absolute right-0 bottom-full left-0 z-50 mb-2 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      data-testid="composer-injection-root-picker"
      role="listbox"
    >
      {items.length === 0 ? (
        <div
          className="px-3 py-2 text-xs text-muted-foreground"
          data-testid="composer-injection-root-empty"
        >
          No matching injections.
        </div>
      ) : (
        items.map((item, index) => {
          const isActive = index === highlightedIndex
          return (
            <Button
              key={item.kind}
              type="button"
              variant="ghost"
              role="option"
              aria-selected={isActive}
              onMouseEnter={() => onHover(index)}
              onClick={() => onSelect(item)}
              data-testid={`composer-injection-root-item-${item.kind}`}
              className={cn(
                'flex h-auto w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs',
                isActive && 'bg-accent text-accent-foreground',
              )}
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
        aria-label="Close injection picker"
      >
        Close
      </Button>
    </div>
  )
}
