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
  const accentStyle: CSSProperties | undefined = cluster.accentColor
    ? { borderColor: cluster.accentColor }
    : undefined

  return (
    <div
      data-canvas-crew={cluster.crewId}
      style={{ width: cluster.width, height: cluster.height, ...accentStyle }}
      className={cn(
        'rounded-xl border border-border bg-foreground/[0.03]',
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
