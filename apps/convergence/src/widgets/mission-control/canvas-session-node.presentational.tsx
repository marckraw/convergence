import type { FC } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { formatSessionAttentionLabel } from '@/entities/session'
import {
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  CARD_ATTENTION_STYLES,
  STATUS_DOT_STYLES,
} from '@/features/mission-control'
import { cn } from '@/shared/lib/cn.pure'
import { SessionBadge } from '@/shared/ui/session-badge.presentational'
import { CANVAS_HANDLE } from './session-canvas.types'
import type { CanvasSessionNodeData } from './session-canvas.types'

/** Wires attach here, but a canvas you cannot draw on must never show ports. */
const HIDDEN_HANDLE = '!size-0 !min-h-0 !min-w-0 !border-0 !bg-transparent'

/**
 * A session as it appears on the canvas: a compact face of the Session Card.
 *
 * It wears the card's own attention colours and status dot so one session reads
 * the same in every view, but drops the Hail and the crew picker. Those are
 * gestures aimed at one session, and the canvas is for reading how sessions are
 * wired to each other -- the card grid is still one click away for operating
 * them. The body click navigates, exactly like the card's.
 */
export const CanvasSessionNode: FC<NodeProps> = ({ data }) => {
  const { card, onOpen } = data as unknown as CanvasSessionNodeData
  const { session } = card
  const running = session.status === 'running'
  const needsYou = session.attention !== 'none'

  return (
    <div
      data-canvas-session-node={session.id}
      style={{ width: CANVAS_NODE_WIDTH, height: CANVAS_NODE_HEIGHT }}
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-card/90 backdrop-blur-sm transition-colors',
        CARD_ATTENTION_STYLES[session.attention],
      )}
    >
      <Handle
        id={CANVAS_HANDLE.in}
        type="target"
        position={Position.Left}
        isConnectable={false}
        className={HIDDEN_HANDLE}
      />

      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${session.name}`}
        className="flex flex-1 cursor-pointer flex-col gap-1.5 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => onOpen(card)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen(card)
          }
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {session.name}
          </span>
          {needsYou ? (
            <span
              className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
              title={formatSessionAttentionLabel(session)}
            >
              <SessionBadge attention={session.attention} />
            </span>
          ) : (
            <span
              aria-hidden
              className={cn(
                'mt-1 size-2 shrink-0 rounded-full',
                STATUS_DOT_STYLES[session.status],
                running && 'animate-pulse',
              )}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
          <span className="truncate font-medium">{card.projectName}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{card.providerLabel}</span>
        </div>

        <p className="mt-auto truncate text-[11px] text-muted-foreground">
          {card.activityLabel}
        </p>
      </div>

      <Handle
        id={CANVAS_HANDLE.out}
        type="source"
        position={Position.Right}
        isConnectable={false}
        className={HIDDEN_HANDLE}
      />

      {/* The underside pair, used only by wires that point back at an earlier
          column -- the returning half of a review loop. */}
      <Handle
        id={CANVAS_HANDLE.loopOut}
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className={HIDDEN_HANDLE}
      />
      <Handle
        id={CANVAS_HANDLE.loopIn}
        type="target"
        position={Position.Bottom}
        isConnectable={false}
        className={HIDDEN_HANDLE}
      />
    </div>
  )
}
