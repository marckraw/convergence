import type { FC } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Sparkles } from 'lucide-react'
import {
  CANVAS_NODE_WIDTH,
  CANVAS_SPAWN_NODE_HEIGHT,
  formatSpawnNodeSpec,
} from '@/features/mission-control'
import { Card, cn } from '@convergence/ui'
import {
  CANVAS_HIDDEN_HANDLE,
  CANVAS_NODE_BODY_CLASS,
} from './session-canvas.styles'
import { CANVAS_HANDLE, CANVAS_SIDE_HANDLE } from './session-canvas.types'
import type { CanvasSpawnNodeData } from './session-canvas.types'

/**
 * The session a spawn wire will open, drawn before it exists.
 *
 * Deliberately unlike a session node: dashed, dimmer, and captioned with what
 * it will be rather than what it is doing. A wire has to end somewhere, and
 * ending it in thin air would read as a broken drawing -- but drawing this as
 * an ordinary node would claim a session exists that does not. Once the wire
 * fires for real, the session it made appears as its own node in the crew.
 */
export const CanvasSpawnNode: FC<NodeProps> = ({ data }) => {
  const spawn = data as unknown as CanvasSpawnNodeData

  return (
    <Card
      data-canvas-spawn-node={spawn.relayId}
      style={{ width: CANVAS_NODE_WIDTH, height: CANVAS_SPAWN_NODE_HEIGHT }}
      // A place held for a session that isn't there yet: the dashed Card.
      // Armed, it will open one: the success tone, as a delivered hop wears
      // it (R1); unarmed, dimmer.
      surface="dashed"
      tone={spawn.armed ? 'success' : undefined}
      padding="none"
      className={cn(CANVAS_NODE_BODY_CLASS, !spawn.armed && 'opacity-70')}
    >
      <Handle
        id={CANVAS_HANDLE.in}
        type="target"
        position={Position.Left}
        isConnectable={false}
        className={CANVAS_HIDDEN_HANDLE}
      />
      {/* The other three sides (R11): a spawned session a route reaches
          from above or below is entered there, not dragged round to the left. */}
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
      <Handle
        id={CANVAS_SIDE_HANDLE.target.bottom}
        type="target"
        position={Position.Bottom}
        isConnectable={false}
        className={CANVAS_HIDDEN_HANDLE}
      />

      <div className="flex items-center gap-1.5">
        <Sparkles
          aria-hidden
          className={cn(
            'size-3 shrink-0',
            spawn.armed ? 'text-success-ink' : 'text-ink-muted',
          )}
        />
        <span className="truncate text-xs font-medium text-ink">
          {spawn.name}
        </span>
      </div>

      <p className="truncate pl-4.5 text-2xs text-ink-muted">
        starts a new session · {formatSpawnNodeSpec(spawn)}
      </p>
    </Card>
  )
}
