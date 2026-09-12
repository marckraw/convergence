import type { FC, ReactNode } from 'react'
import { Link2, Plus, Settings2, History } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'

interface CanvasToolbarProps {
  importCrew: ReactNode
  hasCrew?: boolean
  crewName: string
  /** "4 connections · off", or the empty crew's "0 conversations · 0 …". */
  summary: string
  /** True while Connect mode is armed, so the button reads as a mode. */
  connecting: boolean
  /** False when the crew has fewer than two conversations to join. */
  canConnect: boolean
  /** Open calls waiting on this crew, shown on History. Zero hides the count. */
  waitingCount: number
  onAddConversation: () => void
  onToggleConnect: () => void
  onCrewSettings: () => void
  onHistory: () => void
}

/**
 * The row above the crew frame: Add conversation, Import crew, Connect,
 * Crew settings and History. Import remains available before a crew exists.
 *
 * Every capability the retired Crews view had is reachable from here or from
 * the panel one of these buttons opens (R13) — membership, wire authoring,
 * baton names, limits, and the calls waiting for a human. The buttons are
 * verbs rather than a menu because a canvas with a hidden menu is a canvas
 * where nobody finds the authoring.
 */
export const CanvasToolbar: FC<CanvasToolbarProps> = ({
  importCrew,
  hasCrew = true,
  crewName,
  summary,
  connecting,
  canConnect,
  waitingCount,
  onAddConversation,
  onToggleConnect,
  onCrewSettings,
  onHistory,
}) => (
  <div
    data-canvas-toolbar
    className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-2"
  >
    <h2 className="text-sm font-medium">{crewName}</h2>
    <p className="text-[11px] text-muted-foreground">{summary}</p>

    <div className="ml-auto flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!hasCrew}
        onClick={onAddConversation}
        className="h-7 gap-1 px-2 text-[11px]"
      >
        <Plus className="size-3" />
        Add conversation
      </Button>
      {importCrew}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={connecting}
        disabled={!canConnect}
        title={
          canConnect
            ? undefined
            : 'Add a second conversation to this crew before connecting.'
        }
        onClick={onToggleConnect}
        className={cn(
          'h-7 gap-1 px-2 text-[11px]',
          connecting && 'bg-white/10 text-foreground',
        )}
      >
        <Link2 className="size-3" />
        Connect
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!hasCrew}
        onClick={onCrewSettings}
        className="h-7 gap-1 px-2 text-[11px]"
      >
        <Settings2 className="size-3" />
        Crew settings
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!hasCrew}
        onClick={onHistory}
        className="h-7 gap-1 px-2 text-[11px]"
      >
        <History className="size-3" />
        History
        {waitingCount > 0 ? (
          <span className="tabular-nums text-amber-400">· {waitingCount}</span>
        ) : null}
      </Button>
    </div>
  </div>
)
