import { useMemo } from 'react'
import type { FC } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  useNodes,
  type EdgeProps,
} from '@xyflow/react'
import {
  chooseRouteSides,
  routeAround,
  routeLabelPoint,
  routePath,
} from '@/features/mission-control'
import type { RouteRect } from '@/features/mission-control'

/**
 * A wire drawn as a rounded orthogonal route that stays clear of the cards it
 * is not attached to (R11).
 *
 * A CONTAINER, not a presentational file, and the subscription below is why:
 * it reads the node positions from React Flow rather than taking them as
 * props, which is what makes a drag re-route: the nodes change, this
 * re-renders, and the route is recomputed from the CURRENT rectangles. There
 * is deliberately no cache keyed by edge id — a cached route survives the move
 * that invalidated it and leaves the line hanging where the card used to be.
 *
 * Handing the rectangles down through edge `data` instead would move the
 * subscription rather than remove it: the container that builds the edges
 * sits OUTSIDE the flow's own store and holds only the stored, pre-drag
 * positions, so a route built from them would let go of its card the moment
 * the card started moving. Only a component rendered inside the flow can see
 * where the cards are right now, so this is a component with state wiring in
 * it, and it is named for what it is.
 *
 * The geometry itself lives in `canvas-route.pure.ts`, where "deterministic"
 * and "clear of the cards" are provable without a browser. This component is
 * the part that cannot be: reading the canvas and painting the path.
 *
 * When the router cannot get through it returns null, and this falls back to
 * the straight run between the two attachment points — a plain line the
 * reader can follow beats a clever one drawn through a card.
 */
export const CanvasRoutedEdge: FC<EdgeProps> = ({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  label,
  style,
  markerEnd,
}) => {
  const nodes = useNodes()

  const { path, labelPoint } = useMemo(() => {
    const rects: RouteRect[] = []
    let sourceRect: RouteRect | null = null
    let targetRect: RouteRect | null = null

    for (const node of nodes) {
      // The crew frame is scenery, not an obstacle: every wire in the crew
      // lives inside it, so treating it as a blocker would make every route
      // impossible.
      if (node.type === 'crewCluster') continue
      const width = node.width ?? node.measured?.width ?? 0
      const height = node.height ?? node.measured?.height ?? 0
      if (width === 0 || height === 0) continue
      const rect: RouteRect = {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width,
        height,
      }
      rects.push(rect)
      if (node.id === source) sourceRect = rect
      if (node.id === target) targetRect = rect
    }

    // Before React Flow has measured, or for an edge whose ends are not on
    // the canvas: the straight run is the honest answer, not a guess.
    if (!sourceRect || !targetRect) {
      return {
        path: `M ${sourceX},${sourceY} L ${targetX},${targetY}`,
        labelPoint: {
          x: (sourceX + targetX) / 2,
          y: (sourceY + targetY) / 2,
        },
      }
    }

    const sides = chooseRouteSides(sourceRect, targetRect)
    const route = routeAround({
      source: sourceRect,
      target: targetRect,
      ...sides,
      obstacles: rects,
    })

    if (!route) {
      return {
        path: `M ${sourceX},${sourceY} L ${targetX},${targetY}`,
        labelPoint: {
          x: (sourceX + targetX) / 2,
          y: (sourceY + targetY) / 2,
        },
      }
    }

    return { path: routePath(route), labelPoint: routeLabelPoint(route) }
  }, [nodes, source, target, sourceX, sourceY, targetX, targetY])

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            data-canvas-edge-label={id}
            style={{
              // On the longest straight run rather than at the path's
              // midpoint: a label at the midpoint lands wherever the path
              // happens to be bending.
              transform: `translate(-50%, -50%) translate(${labelPoint.x}px, ${labelPoint.y}px)`,
            }}
            className="pointer-events-none absolute rounded bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
