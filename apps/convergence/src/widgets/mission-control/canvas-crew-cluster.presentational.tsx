import type { CSSProperties, FC } from 'react'
import type { NodeProps } from '@xyflow/react'
import { CrewMark, crewColor } from '@/features/mission-control'
import { cn } from '@convergence/ui'
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
  // The warning outranks the crew's own accent, deliberately: a parked loop is
  // the one thing on this frame that needs a human, and a colour the user
  // chose for decoration must not be able to hide it.
  const accent = cluster.parked ? null : crewColor(cluster.accentColor)
  const accentStyle: CSSProperties | undefined = accent
    ? { borderColor: accent }
    : undefined

  return (
    <div
      data-canvas-crew={cluster.crewId}
      data-canvas-crew-id={cluster.crewId}
      data-crew-parked={cluster.parked ? 'true' : 'false'}
      style={{ width: cluster.width, height: cluster.height, ...accentStyle }}
      className={cn(
        'rounded-xl border bg-fill-quiet',
        // Parked waits on you: the warning tone (R1), its edge at the solid.
        cluster.parked
          ? 'border-warning-solid/70 bg-warning-soft'
          : 'border-line',
        'pointer-events-none',
      )}
    >
      <div className="pointer-events-auto flex items-center gap-2 px-4 py-3">
        <CrewMark
          crew={cluster}
          variant="glyph"
          className={cluster.emoji ? 'text-sm' : 'size-3.5 text-ink-muted'}
        />
        <CrewMark crew={cluster} variant="dot" />
        <h2 className="truncate text-xs font-medium">{cluster.name}</h2>
      </div>
    </div>
  )
}
