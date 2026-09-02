import type { FC } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  CANVAS_CHAIR_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  CHAIR_NODE_EMOJI,
  CHAIR_NODE_LABEL,
} from '@/features/mission-control'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { CANVAS_HANDLE } from './session-canvas.types'
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
        chair.lit
          ? 'border-amber-400/70 bg-amber-400/[0.10]'
          : 'border-border bg-foreground/[0.03]',
      )}
    >
      <Handle
        id={CANVAS_HANDLE.in}
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!size-0 !min-h-0 !min-w-0 !border-0 !bg-transparent"
      />
      <Handle
        id={CANVAS_HANDLE.loopIn}
        type="target"
        position={Position.Bottom}
        isConnectable={false}
        className="!size-0 !min-h-0 !min-w-0 !border-0 !bg-transparent"
      />

      <div className="flex items-center gap-1.5">
        <span aria-hidden className="text-sm leading-none">
          {CHAIR_NODE_EMOJI}
        </span>
        <span
          className={cn(
            'truncate text-xs font-medium',
            chair.lit ? 'text-amber-200' : 'text-foreground',
          )}
        >
          {CHAIR_NODE_LABEL}
        </span>

        {chair.lit ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Answer the hails for this crew`}
            onClick={() => chair.onAcknowledge(chair.crewId)}
            className="ml-auto h-5 shrink-0 px-1.5 text-[10px] text-amber-200/80 hover:text-amber-100"
          >
            Seen
          </Button>
        ) : null}
      </div>

      <p
        className={cn(
          'truncate text-[11px]',
          chair.lit ? 'text-amber-200/80' : 'text-muted-foreground',
        )}
      >
        {chair.detail ?? 'nothing is waiting on you here'}
      </p>
    </div>
  )
}
