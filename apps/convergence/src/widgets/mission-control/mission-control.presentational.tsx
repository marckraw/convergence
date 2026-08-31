import type { FC, ReactNode } from 'react'
import { ArrowDownWideNarrow, Satellite, SearchX } from 'lucide-react'
import {
  SESSION_CARD_ORDER_PRESETS,
  formatSessionCardOrderPreset,
} from '@/features/mission-control'
import type {
  MissionControlViewMode,
  SessionCardOrderPreset,
} from '@/features/mission-control'
import { cn } from '@/shared/lib/cn.pure'
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
  mode: MissionControlViewMode
  onModeChange: (mode: MissionControlViewMode) => void
  /** The filter row — state chips and pickers, composed by the container. */
  filters: ReactNode
  /** True when nothing is narrowed — drives the empty-room copy. */
  filterIsEmpty: boolean
  onClearFilter: () => void
  /**
   * Hands the whole content area to the child, unpadded and unscrolled. The
   * canvas pans and zooms itself, and an outer scrollbar would fight it for
   * the wheel.
   */
  fillsContent?: boolean
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
  mode,
  onModeChange,
  filters,
  filterIsEmpty,
  onClearFilter,
  fillsContent = false,
  children,
}) => {
  const modes: { value: MissionControlViewMode; label: string }[] = [
    { value: 'flat', label: 'Flat' },
    { value: 'crews', label: 'Crews' },
    { value: 'canvas', label: 'Canvas' },
  ]

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
          <div
            role="group"
            aria-label="Mission Control layout"
            className="flex items-center gap-0.5 rounded-full border border-white/10 p-0.5"
          >
            {modes.map((entry) => (
              <Button
                key={entry.value}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={mode === entry.value}
                onClick={() => onModeChange(entry.value)}
                className={cn(
                  'h-7 rounded-full px-3 text-[11px] font-normal',
                  mode === entry.value
                    ? 'bg-white/10 text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {entry.label}
              </Button>
            ))}
          </div>

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

        <div className="flex w-full flex-wrap items-center gap-1.5">
          {filters}
        </div>
      </div>

      <div
        className={cn(
          'min-h-0 flex-1',
          fillsContent
            ? 'overflow-hidden'
            : 'app-scrollbar overflow-y-auto px-5 py-4',
        )}
      >
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
