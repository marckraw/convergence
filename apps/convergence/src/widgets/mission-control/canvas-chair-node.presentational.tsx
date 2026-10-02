import type { FC } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  CANVAS_CHAIR_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  CHAIR_NODE_EMOJI,
  CHAIR_NODE_LABEL,
} from '@/features/mission-control'
import { Button, Card, cn, Tooltip } from '@convergence/ui'
import {
  CANVAS_HIDDEN_HANDLE,
  CANVAS_NODE_BODY_CLASS,
} from './session-canvas.styles'
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
    <Card
      data-canvas-chair={chair.crewId}
      data-chair-lit={chair.lit ? 'true' : 'false'}
      style={{ width: CANVAS_NODE_WIDTH, height: CANVAS_CHAIR_NODE_HEIGHT }}
      // Lit, it waits on you: the Card's warning tone (R1), its edge and its
      // tint, never an alpha typed on the tone (MC-21). Dark, the quiet card.
      tone={chair.lit ? 'warning' : undefined}
      padding="none"
      className={CANVAS_NODE_BODY_CLASS}
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
          // Its word is its name (WCAG 2.5.3, label in name); what it does
          // is its tooltip and description.
          <Tooltip label="Answer the hails for this crew">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => chair.onAcknowledge(chair.crewId)}
              className="ml-auto shrink-0 text-warning-ink hover:text-warning-ink"
            >
              Seen
            </Button>
          </Tooltip>
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
    </Card>
  )
}
