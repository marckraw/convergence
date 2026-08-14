import type { FC, ReactNode } from 'react'
import { ArrowDownWideNarrow, Satellite, SearchX } from 'lucide-react'
import {
  SESSION_CARD_ORDER_PRESETS,
  formatSessionCardOrderPreset,
} from '@/features/mission-control'
import type { SessionCardOrderPreset } from '@/features/mission-control'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'

interface MissionControlViewProps {
  totalCount: number
  visibleCount: number
  attentionCount: number
  runningCount: number
  query: string
  onQueryChange: (query: string) => void
  order: SessionCardOrderPreset
  onOrderChange: (order: SessionCardOrderPreset) => void
  /** The state chips, composed by the container. */
  chips: ReactNode
  /** True when nothing is narrowed — drives the empty-room copy. */
  filterIsEmpty: boolean
  onClearFilter: () => void
  children: ReactNode
}

export const MissionControlView: FC<MissionControlViewProps> = ({
  totalCount,
  visibleCount,
  attentionCount,
  runningCount,
  query,
  onQueryChange,
  order,
  onOrderChange,
  chips,
  filterIsEmpty,
  onClearFilter,
  children,
}) => {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Satellite className="size-4" />
            Mission Control
          </h1>
          <p className="text-xs text-muted-foreground">
            {totalCount === 0
              ? 'no sessions'
              : `${totalCount} session${totalCount === 1 ? '' : 's'} · ${attentionCount} need${attentionCount === 1 ? 's' : ''} you · ${runningCount} running`}
          </p>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <Input
            type="search"
            value={query}
            placeholder="Search cards by name, project, provider, model, status…"
            aria-label="Search session cards"
            className="h-8 w-full max-w-xs text-xs"
            onChange={(event) => onQueryChange(event.target.value)}
          />

          <Select
            value={order}
            onValueChange={(value) =>
              onOrderChange(value as SessionCardOrderPreset)
            }
          >
            <SelectTrigger
              size="sm"
              aria-label="Order session cards"
              className="h-8 gap-1.5 text-xs"
            >
              <ArrowDownWideNarrow className="size-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {SESSION_CARD_ORDER_PRESETS.map((preset) => (
                <SelectItem key={preset} value={preset} className="text-xs">
                  {formatSessionCardOrderPreset(preset)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full">{chips}</div>
      </div>

      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {totalCount === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Satellite className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">No sessions yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Start a session in any project and its card will appear here,
              live.
            </p>
          </div>
        ) : visibleCount === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <SearchX className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">
              {query.trim()
                ? `No cards match “${query}”`
                : 'No cards in the states you picked'}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Card search covers name, project, provider, model, status and
              activity — not conversation content.
            </p>
            {filterIsEmpty ? null : (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={onClearFilter}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                Show the whole room
              </Button>
            )}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
