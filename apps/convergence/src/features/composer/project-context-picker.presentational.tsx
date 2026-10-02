import type { FC } from 'react'
import type { ProjectContextItem } from '@/entities/project-context'
import {
  Badge,
  Button,
  Card,
  CardAction,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@convergence/ui'
import {
  pickPopover,
  pickRowAction,
  pickRowClass,
  pickRowDetail,
} from './pick-row.styles'
import { Check, FileText, Repeat } from 'lucide-react'

interface ProjectContextPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: ProjectContextItem[]
  selectedIds: string[]
  disabled?: boolean
  triggerClassName?: string
  onToggleItem: (id: string) => void
}

const BODY_PREVIEW_LIMIT = 110

function itemLabel(item: ProjectContextItem): string {
  return item.label?.trim() ? item.label : 'Untitled'
}

function bodyPreview(body: string): string {
  const trimmed = body.trim()
  if (trimmed.length <= BODY_PREVIEW_LIMIT) return trimmed
  return `${trimmed.slice(0, BODY_PREVIEW_LIMIT)}…`
}

export const ProjectContextPicker: FC<ProjectContextPickerProps> = ({
  open,
  onOpenChange,
  items,
  selectedIds,
  disabled = false,
  triggerClassName,
  onToggleItem,
}) => (
  <Popover open={open} onOpenChange={(open) => onOpenChange(open)}>
    <PopoverTrigger
      render={
        <Button
          type="button"
          variant="quiet"
          aria-label="Select project context"
          disabled={disabled || items.length === 0}
          size="md"
          className={triggerClassName}
        >
          <FileText className="h-3.5 w-3.5" />
          Context
          {selectedIds.length > 0 ? (
            <Badge shape="count">{selectedIds.length}</Badge>
          ) : null}
        </Button>
      }
    />
    <PopoverContent
      aria-label="Project context"
      align="start"
      className={cn('w-105', pickPopover)}
    >
      <div className="border-b border-line-soft p-3">
        <p className="text-sm font-semibold">Project context</p>
        <p className="text-xs text-ink-muted">
          Attach reusable project notes to the next session.
        </p>
      </div>

      <div className="max-h-80 overflow-y-auto p-2">
        <div className="space-y-1">
          {items.map((item) => {
            const selected = selectedIds.includes(item.id)
            return (
              <Card
                key={item.id}
                interactive
                padding="none"
                className={pickRowClass(selected)}
              >
                <CardAction
                  aria-pressed={selected}
                  onClick={() => onToggleItem(item.id)}
                  className={pickRowAction}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {itemLabel(item)}
                      </span>
                      {selected ? (
                        <Check aria-hidden className="size-3.5" />
                      ) : null}
                      {item.reinjectMode === 'every-turn' ? (
                        <Repeat
                          aria-hidden
                          className="size-3.5 shrink-0 text-warning-ink"
                        />
                      ) : null}
                    </span>
                    <span className={pickRowDetail}>
                      {bodyPreview(item.body)}
                    </span>
                    <Badge caps className="mt-2">
                      {item.reinjectMode === 'every-turn'
                        ? 'Every turn'
                        : 'Boot'}
                    </Badge>
                  </span>
                </CardAction>
              </Card>
            )
          })}
        </div>
      </div>
    </PopoverContent>
  </Popover>
)
