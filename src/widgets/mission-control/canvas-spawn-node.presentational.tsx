import type { FC } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Sparkles } from 'lucide-react'
import {
  CANVAS_NODE_WIDTH,
  CANVAS_SPAWN_NODE_HEIGHT,
  formatSpawnNodeSpec,
} from '@/features/mission-control'
import { cn } from '@/shared/lib/cn.pure'
import { CANVAS_HANDLE } from './session-canvas.types'
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
    <div
      data-canvas-spawn-node={spawn.relayId}
      style={{ width: CANVAS_NODE_WIDTH, height: CANVAS_SPAWN_NODE_HEIGHT }}
      className={cn(
        'flex flex-col justify-center gap-0.5 rounded-lg border border-dashed px-3 py-2',
        spawn.armed
          ? 'border-emerald-500/40 bg-emerald-500/[0.04]'
          : 'border-border bg-foreground/[0.03] opacity-70',
      )}
    >
      <Handle
        id={CANVAS_HANDLE.in}
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!size-0 !min-h-0 !min-w-0 !border-0 !bg-transparent"
      />

      <div className="flex items-center gap-1.5">
        <Sparkles
          aria-hidden
          className={cn(
            'size-3 shrink-0',
            spawn.armed ? 'text-emerald-400/80' : 'text-muted-foreground',
          )}
        />
        <span className="truncate text-xs font-medium text-foreground">
          {spawn.name}
        </span>
      </div>

      <p className="truncate pl-[18px] text-[11px] text-muted-foreground">
        starts a new session · {formatSpawnNodeSpec(spawn)}
      </p>
    </div>
  )
}
