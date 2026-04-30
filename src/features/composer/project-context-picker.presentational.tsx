import type { FC } from 'react'
import type { ProjectContextItem } from '@/entities/project-context'
import { Button } from '@/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { cn } from '@/shared/lib/cn.pure'
import { Check, FileText, Repeat } from 'lucide-react'

interface ProjectContextPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: ProjectContextItem[]
  selectedIds: string[]
  disabled?: boolean
  onToggleItem: (id: string) => void
}

const BODY_PREVIEW_LIMIT = 110

function itemLabel(item: ProjectContextItem): string {
  return item.label?.trim() ? item.label : 'Untitled'
}

function bodyPreview(body: string): string {
  const trimmed = body.trim()
  if (trimmed.length <= BODY_PREVIEW_LIMIT) return trimmed
  return `${trimmed.slice(0, BODY_PREVIEW_LIMIT)}...`
}

export const ProjectContextPicker: FC<ProjectContextPickerProps> = ({
  open,
  onOpenChange,
  items,
  selectedIds,
  disabled = false,
  onToggleItem,
}) => (
  <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        aria-label="Select project context"
        disabled={disabled || items.length === 0}
      >
        <FileText className="h-3.5 w-3.5" />
        Context
        {selectedIds.length > 0 ? (
          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
            {selectedIds.length}
          </span>
        ) : null}
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      className="w-[min(420px,calc(100vw-2rem))] p-0"
    >
      <div className="border-b border-border/70 p-3">
        <p className="text-sm font-semibold">Project context</p>
        <p className="text-xs text-muted-foreground">
          Attach reusable project notes to the next session.
        </p>
      </div>

      <div className="app-scrollbar max-h-80 overflow-y-auto p-2">
        <div className="space-y-1">
          {items.map((item) => {
            const selected = selectedIds.includes(item.id)
            return (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                className={cn(
                  'h-auto w-full justify-start rounded-lg border border-transparent px-3 py-2 text-left',
                  selected
                    ? 'border-primary/30 bg-primary/10 text-foreground'
                    : 'hover:border-border/70 hover:bg-muted/40',
                )}
                onClick={() => onToggleItem(item.id)}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {itemLabel(item)}
                    </span>
                    {selected ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : null}
                    {item.reinjectMode === 'every-turn' ? (
                      <Repeat className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                    ) : null}
                  </span>
                  <span className="mt-1 line-clamp-2 block whitespace-normal text-xs font-normal leading-5 text-muted-foreground">
                    {bodyPreview(item.body)}
                  </span>
                  <span className="mt-2 inline-flex rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {item.reinjectMode === 'every-turn' ? 'Every turn' : 'Boot'}
                  </span>
                </span>
              </Button>
            )
          })}
        </div>
      </div>
    </PopoverContent>
  </Popover>
)
