import { useMemo } from 'react'
import type { FC } from 'react'
import {
  BaseEdge,
  getSmoothStepPath,
  Position,
  EdgeLabelRenderer,
  useNodes,
  type EdgeProps,
} from '@xyflow/react'
import {
  chooseRouteSides,
  ROUTE_GRID,
  routeCanvasEdge,
  routeLabelLayout,
  sidePoint,
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
 * side-selected smoothstep between the two attachment points.
 */
export const CanvasRoutedEdge: FC<EdgeProps> = ({
  id,
  source,
  target,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
  label,
  style,
  markerEnd,
}) => {
  const nodes = useNodes()

  const opposed = data?.opposed === true
  const { path, labelPoint, labelTranslate } = useMemo(() => {
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

    const sides =
      sourceRect && targetRect ? chooseRouteSides(sourceRect, targetRect) : null
    const sourcePoint =
      sourceRect && sides
        ? sidePoint(sourceRect, sides.sourceSide)
        : { x: sourceX, y: sourceY }
    const targetPoint =
      targetRect && sides
        ? sidePoint(targetRect, sides.targetSide)
        : { x: targetX, y: targetY }
    const positions = {
      left: Position.Left,
      right: Position.Right,
      top: Position.Top,
      bottom: Position.Bottom,
    }
    const route =
      sourceRect && targetRect
        ? routeCanvasEdge({
            source: sourceRect,
            target: targetRect,
            obstacles: rects,
            opposed,
          })
        : null
    if (!route) {
      const sourceSide = sides ? positions[sides.sourceSide] : sourcePosition
      const vertical =
        sourceSide === Position.Top || sourceSide === Position.Bottom
      const dx = targetPoint.x - sourcePoint.x,
        dy = targetPoint.y - sourcePoint.y
      const lane = opposed ? ROUTE_GRID / 2 : 0
      const centerX = vertical
        ? undefined
        : (sourcePoint.x + targetPoint.x) / 2 -
          lane * (Math.sign(dy) || (source < target ? 1 : -1))
      const centerY = vertical
        ? (sourcePoint.y + targetPoint.y) / 2 +
          lane * (Math.sign(dx) || (source < target ? 1 : -1))
        : undefined
      if (vertical) {
        const shift = sourceSide === Position.Bottom ? -lane : lane
        sourcePoint.x += shift
        targetPoint.x += shift
      } else {
        const shift = sourceSide === Position.Right ? lane : -lane
        sourcePoint.y += shift
        targetPoint.y += shift
      }
      const [path, x, y] = getSmoothStepPath({
        centerX,
        centerY,
        sourceX: sourcePoint.x,
        sourceY: sourcePoint.y,
        targetX: targetPoint.x,
        targetY: targetPoint.y,
        sourcePosition: sides ? positions[sides.sourceSide] : sourcePosition,
        targetPosition: sides ? positions[sides.targetSide] : targetPosition,
      })
      const layout = routeLabelLayout([sourcePoint, targetPoint], opposed)
      return {
        path,
        labelPoint: {
          x: x + layout.point.x - (sourcePoint.x + targetPoint.x) / 2,
          y: y + layout.point.y - (sourcePoint.y + targetPoint.y) / 2,
        },
        labelTranslate: layout.translate,
      }
    }
    const layout = routeLabelLayout(
      route.points,
      opposed,
      route.shared ? (source > target ? 'reverse' : 'forward') : undefined,
    )
    return {
      path: routePath(route.points),
      labelPoint: layout.point,
      labelTranslate: layout.translate,
    }
  }, [
    nodes,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    opposed,
  ])

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
              transform: `translate(${labelTranslate}) translate(${labelPoint.x}px, ${labelPoint.y}px)`,
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
