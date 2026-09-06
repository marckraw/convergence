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
import { CANVAS_HANDLE, CANVAS_SIDE_HANDLE } from './session-canvas.types'
import type { CanvasSessionNodeData } from './session-canvas.types'

/** Wires attach here, but a canvas you cannot draw on must never show ports. */
const HIDDEN_HANDLE = '!size-0 !min-h-0 !min-w-0 !border-0 !bg-transparent'

/**
 * The magnetic edge handle (R10).
 *
 * Visible only while the canvas is authorable, and generous rather than
 * pixel-exact: the canvas sets `connectionRadius` so a release NEAR a handle
 * lands on it, and a port you have to hit precisely is a port most people give
 * up on. It stays under the card's own click target, so dragging from the edge
 * draws while clicking the body still navigates.
 */
const DRAW_HANDLE =
  '!size-2.5 !rounded-full !border !border-background !bg-sky-400 !opacity-80 hover:!opacity-100'

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
  const {
    card,
    crewId,
    onOpen,
    authoring = false,
    connecting = false,
    connectSource = false,
    onPick,
  } = data as unknown as CanvasSessionNodeData
  const { session } = card
  const running = session.status === 'running'
  const needsYou = session.attention !== 'none'
  const handleClass = authoring ? DRAW_HANDLE : HIDDEN_HANDLE

  /**
   * One gesture, two meanings, and the mode decides which -- never the input
   * device. A click and an Enter both PICK while Connect is armed and both
   * OPEN otherwise, which is what makes the keyboard route the same route
   * rather than a second one that can drift.
   */
  const activate = () => {
    if (connecting && onPick) {
      onPick(session.id)
      return
    }
    onOpen(card)
  }

  return (
    <div
      data-canvas-session-node={session.id}
      // Which crew this card is drawn inside, so a click selects it — the
      // toolbar and the right-hand panel have to be about something, and a
      // session in two crews is a different card in each.
      data-canvas-crew-id={crewId}
      style={{ width: CANVAS_NODE_WIDTH, height: CANVAS_NODE_HEIGHT }}
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-card/90 backdrop-blur-sm transition-colors',
        CARD_ATTENTION_STYLES[session.attention],
        // The chosen source is lit, so "which one did I pick" is answerable
        // by looking rather than by remembering.
        connectSource && '!border-sky-400 ring-1 ring-sky-400/40',
      )}
    >
      <Handle
        id={CANVAS_HANDLE.in}
        type="target"
        position={Position.Left}
        isConnectable={authoring}
        className={handleClass}
      />

      <div
        role="button"
        tabIndex={0}
        aria-label={
          connecting
            ? connectSource
              ? `${session.name} is the source — pick a recipient, or pick it again to start over`
              : `Connect to ${session.name}`
            : `Open ${session.name}`
        }
        className="flex flex-1 cursor-pointer flex-col gap-1.5 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={activate}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            activate()
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
        isConnectable={authoring}
        className={handleClass}
      />

      {/* The underside pair, used only by wires that point back at an earlier
          column -- the returning half of a review loop. */}
      {/* The remaining sides (R11). Never connectable, even while authoring:
          which side a wire leaves by is a routing decision the canvas makes
          from where the two cards are, and offering four pairs of ports would
          ask the person to choose the geometry of their own connection. */}
      <Handle
        id={CANVAS_SIDE_HANDLE.source.left}
        type="source"
        position={Position.Left}
        isConnectable={false}
        className={HIDDEN_HANDLE}
      />
      <Handle
        id={CANVAS_SIDE_HANDLE.source.top}
        type="source"
        position={Position.Top}
        isConnectable={false}
        className={HIDDEN_HANDLE}
      />
      <Handle
        id={CANVAS_SIDE_HANDLE.target.right}
        type="target"
        position={Position.Right}
        isConnectable={false}
        className={HIDDEN_HANDLE}
      />
      <Handle
        id={CANVAS_SIDE_HANDLE.target.top}
        type="target"
        position={Position.Top}
        isConnectable={false}
        className={HIDDEN_HANDLE}
      />
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
