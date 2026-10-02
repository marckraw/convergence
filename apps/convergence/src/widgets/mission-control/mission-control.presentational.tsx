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
import {
  Button,
  cn,
  EmptyState,
  SearchField,
  SegmentedControl,
  SegmentedControlItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@convergence/ui'
import { ROOM_COLUMN_CLASS } from './session-canvas.styles'

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
  // Crews retired into the Canvas (R13), which holds every capability it had.
  const modes: { value: MissionControlViewMode; label: string }[] = [
    { value: 'flat', label: 'Flat' },
    { value: 'canvas', label: 'Canvas' },
  ]

  return (
    <div className={ROOM_COLUMN_CLASS}>
      {/* The room's top strip drags the window (NAV-4): `app-drag` on the
          strip, and every control in it is a part that carries `app-no-drag`
          itself (SegmentedControl, SearchField, SelectTrigger, Toggle,
          Button, Combobox), so each still takes its click. */}
      <div
        data-mission-control-header
        className="app-drag flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3"
      >
        <div className="flex items-baseline gap-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Satellite className="size-4" />
            Mission Control
          </h1>
          <p className="text-xs text-ink-muted">
            {totalCount === 0
              ? 'no sessions'
              : `${totalCount} session${totalCount === 1 ? '' : 's'} · ${attentionCount} need${attentionCount === 1 ? 's' : ''} you · ${runningCount} running`}
          </p>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <SegmentedControl
            aria-label="Mission Control layout"
            size="sm"
            value={mode}
            onValueChange={(value) =>
              onModeChange(value as MissionControlViewMode)
            }
          >
            {modes.map((entry) => (
              <SegmentedControlItem key={entry.value} value={entry.value}>
                {entry.label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>

          <>
            <SearchField
              size="md"
              value={query}
              placeholder="Search cards by name, project, provider, model, status…"
              aria-label="Search session cards"
              className="w-full max-w-xs"
              onChange={(event) => onQueryChange(event.target.value)}
              onClear={() => onQueryChange('')}
            />

            <Select
              items={Object.fromEntries(
                SESSION_CARD_ORDER_PRESETS.map((preset) => [
                  preset,
                  formatSessionCardOrderPreset(preset),
                ]),
              )}
              value={order}
              onValueChange={(value) =>
                onOrderChange(value as SessionCardOrderPreset)
              }
            >
              <SelectTrigger
                size="md"
                aria-label="Order session cards"
                className="gap-1.5 text-xs"
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
          </>
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
        {mode === 'canvas' && totalCount === 0 ? (
          children
        ) : totalCount === 0 ? (
          <EmptyState
            variant="plain"
            layout="centred"
            icon={Satellite}
            title="No sessions yet"
            detail="Start a session in any project and its card will appear here, live."
          />
        ) : visibleCount === 0 ? (
          <EmptyState
            variant="plain"
            layout="centred"
            icon={SearchX}
            title={
              query.trim()
                ? `No cards match “${query}”`
                : 'No cards in the states you picked'
            }
            detail="Card search covers name, project, provider, model, status and activity — not conversation content."
            action={
              filterIsEmpty ? null : (
                <Button
                  type="button"
                  variant="link"
                  onClick={onClearFilter}
                  className="text-xs text-ink-muted hover:text-ink"
                >
                  Show the whole room
                </Button>
              )
            }
          />
        ) : (
          children
        )}
      </div>
    </div>
  )
}
