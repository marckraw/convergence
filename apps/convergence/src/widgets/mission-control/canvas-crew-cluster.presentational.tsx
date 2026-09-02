import type { CSSProperties, FC } from 'react'
import { Users } from 'lucide-react'
import type { NodeProps } from '@xyflow/react'
import { cn } from '@/shared/lib/cn.pure'
import type { CanvasCrewClusterData } from './session-canvas.types'

/**
 * The box a crew's sessions sit inside.
 *
 * Drawn as a node rather than a React Flow group so the sessions it contains
 * are not its children: membership on the canvas is the crew's data, and making
 * nodes into children would let a drag reparent a session -- authoring, which
 * this view does not do.
 */
export const CanvasCrewCluster: FC<NodeProps> = ({ data }) => {
  const cluster = data as unknown as CanvasCrewClusterData
  // The amber outranks the crew's own accent, deliberately: a parked loop is
  // the one thing on this frame that needs a human, and a colour the user
  // chose for decoration must not be able to hide it.
  const accentStyle: CSSProperties | undefined =
    cluster.accentColor && !cluster.parked
      ? { borderColor: cluster.accentColor }
      : undefined

  return (
    <div
      data-canvas-crew={cluster.crewId}
      data-crew-parked={cluster.parked ? 'true' : 'false'}
      style={{ width: cluster.width, height: cluster.height, ...accentStyle }}
      className={cn(
        'rounded-xl border bg-foreground/[0.03]',
        cluster.parked
          ? 'border-amber-400/70 bg-amber-400/[0.04]'
          : 'border-border',
        'pointer-events-none',
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        {cluster.emoji ? (
          <span aria-hidden className="text-sm leading-none">
            {cluster.emoji}
          </span>
        ) : (
          <Users aria-hidden className="size-3.5 text-muted-foreground" />
        )}

        {cluster.accentColor ? (
          <span
            aria-hidden
            style={{ backgroundColor: cluster.accentColor }}
            className="size-2 rounded-full"
          />
        ) : null}

        <h2 className="truncate text-xs font-medium">{cluster.name}</h2>
      </div>
    </div>
  )
}
