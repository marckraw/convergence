import type { FC } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  CANVAS_CHAIR_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  CHAIR_NODE_EMOJI,
  CHAIR_NODE_LABEL,
} from '@/features/mission-control'
import { Button, cn } from '@convergence/ui'
import { CANVAS_HIDDEN_HANDLE } from './session-canvas.styles'
import { CANVAS_HANDLE, CANVAS_SIDE_HANDLE } from './session-canvas.types'
import type { CanvasChairNodeData } from './session-canvas.types'

/**
 * Marcin's chair: where every route that ends at a human ends.
 *
 * A node rather than an absence, so the diagram answers "what can happen after
 * this station" completely — including "it stops and waits for you". Present
 * from the moment a crew has one conditioned wire, dark until something parks
 * there, and lit with the reason when something does. It is deliberately not a
 * session: nothing runs here, and drawing it like one would promise a station
 * that could take work.
 */
export const CanvasChairNode: FC<NodeProps> = ({ data }) => {
  const chair = data as unknown as CanvasChairNodeData

  return (
    <div
      data-canvas-chair={chair.crewId}
      data-chair-lit={chair.lit ? 'true' : 'false'}
      style={{ width: CANVAS_NODE_WIDTH, height: CANVAS_CHAIR_NODE_HEIGHT }}
      className={cn(
        'flex flex-col justify-center gap-0.5 rounded-lg border px-3 py-2',
        // Lit, it waits on you: the warning tone (R1), its edge at the
        // solid so the one node that needs a human reads from across the room.
        chair.lit
          ? 'border-warning-solid/70 bg-warning-soft'
          : 'border-line bg-fill-quiet',
      )}
    >
      <Handle
        id={CANVAS_HANDLE.in}
        type="target"
        position={Position.Left}
        isConnectable={false}
        className={CANVAS_HIDDEN_HANDLE}
      />
      <Handle
        id={CANVAS_HANDLE.loopIn}
        type="target"
        position={Position.Bottom}
        isConnectable={false}
        className={CANVAS_HIDDEN_HANDLE}
      />
      {/* The other two sides, so a chair a route approaches from the right or
          from above is entered by the side it actually faces (R11). */}
      <Handle
        id={CANVAS_SIDE_HANDLE.target.right}
        type="target"
        position={Position.Right}
        isConnectable={false}
        className={CANVAS_HIDDEN_HANDLE}
      />
      <Handle
        id={CANVAS_SIDE_HANDLE.target.top}
        type="target"
        position={Position.Top}
        isConnectable={false}
        className={CANVAS_HIDDEN_HANDLE}
      />

      <div className="flex items-center gap-1.5">
        <span aria-hidden className="text-sm leading-none">
          {CHAIR_NODE_EMOJI}
        </span>
        <span
          className={cn(
            'truncate text-xs font-medium',
            chair.lit ? 'text-warning-ink' : 'text-ink',
          )}
        >
          {CHAIR_NODE_LABEL}
        </span>

        {chair.lit ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={`Answer the hails for this crew`}
            onClick={() => chair.onAcknowledge(chair.crewId)}
            className="ml-auto shrink-0 text-warning-ink hover:text-warning-ink"
          >
            Seen
          </Button>
        ) : null}
      </div>

      <p
        className={cn(
          'truncate text-2xs',
          chair.lit ? 'text-warning-ink' : 'text-ink-muted',
        )}
      >
        {chair.detail ?? 'nothing is waiting on you here'}
      </p>
    </div>
  )
}
