/**
 * Where a route leaves and arrives, and how it gets between the two (R11).
 *
 * Pure, and deliberately ignorant of React Flow: routing is geometry, and
 * geometry is the one part of a canvas that can be reasoned about without a
 * browser. Everything here is a function of rectangles and points, so the
 * hard promises — *deterministic*, *clear of unrelated cards* — are provable
 * without measuring anything.
 */

/** A card, as far as routing is concerned. */
export interface RouteRect {
  /** The node this rectangle belongs to, so a route can ignore its own ends. */
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type RouteSide = 'left' | 'right' | 'top' | 'bottom'

export interface RoutePoint {
  x: number
  y: number
}

/**
 * Which sides a route should use, from where the two cards actually are.
 *
 * Position rather than column, deliberately: cards move now (R10), so a
 * layout column stopped describing the picture the moment somebody dragged
 * one. A wire drawn from a column heuristic on a rearranged canvas leaves the
 * wrong edge and reads as a mistake.
 *
 * The dominant axis wins — the bigger of the horizontal and vertical gaps —
 * because that is the direction the eye already reads the pair in. Ties go to
 * horizontal, which is how this canvas has always laid a flow out.
 */
export function chooseRouteSides(
  source: RouteRect,
  target: RouteRect,
): { sourceSide: RouteSide; targetSide: RouteSide } {
  const sourceCenter = rectCenter(source)
  const targetCenter = rectCenter(target)
  const dx = targetCenter.x - sourceCenter.x
  const dy = targetCenter.y - sourceCenter.y

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceSide: 'right', targetSide: 'left' }
      : { sourceSide: 'left', targetSide: 'right' }
  }
  return dy >= 0
    ? { sourceSide: 'bottom', targetSide: 'top' }
    : { sourceSide: 'top', targetSide: 'bottom' }
}

export function rectCenter(rect: RouteRect): RoutePoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

/** The point on a rectangle's side a route attaches to. */
export function sidePoint(rect: RouteRect, side: RouteSide): RoutePoint {
  const center = rectCenter(rect)
  switch (side) {
    case 'left':
      return { x: rect.x, y: center.y }
    case 'right':
      return { x: rect.x + rect.width, y: center.y }
    case 'top':
      return { x: center.x, y: rect.y }
    case 'bottom':
      return { x: center.x, y: rect.y + rect.height }
  }
}

/**
 * How far a route steps away from a card before it turns.
 *
 * Enough that an arrowhead is legible against the border and two routes
 * leaving the same side do not overlap their first segment.
 */
export const ROUTE_STUB = 24

/**
 * How coarse the router's grid is.
 *
 * Coarse on purpose. A fine grid finds prettier paths and takes long enough
 * on every drag frame to be felt; this is a diagram of at most a few dozen
 * cards, and a route that is clearly clear of the cards beats a route that is
 * two pixels shorter.
 */
export const ROUTE_GRID = 20

/** How much a route is willing to travel to avoid one turn. */
const BEND_PENALTY = 3

/** Breathing room kept around every card the route is not attached to. */
export const ROUTE_CLEARANCE = 12

function expand(rect: RouteRect, by: number): RouteRect {
  return {
    id: rect.id,
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + by * 2,
    height: rect.height + by * 2,
  }
}

function contains(rect: RouteRect, point: RoutePoint): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

/**
 * Whether a straight segment crosses a rectangle.
 *
 * Orthogonal only, which is all this router produces — a general
 * segment/rectangle test would be code answering a question nothing asks.
 */
export function segmentHitsRect(
  from: RoutePoint,
  to: RoutePoint,
  rect: RouteRect,
): boolean {
  const minX = Math.min(from.x, to.x)
  const maxX = Math.max(from.x, to.x)
  const minY = Math.min(from.y, to.y)
  const maxY = Math.max(from.y, to.y)
  return (
    maxX > rect.x &&
    minX < rect.x + rect.width &&
    maxY > rect.y &&
    minY < rect.y + rect.height
  )
}

/**
 * Which way the search is travelling.
 *
 * Its own type rather than `RouteSide`, because a SIDE is a face of a card and
 * a HEADING is a direction of travel; they have four members each and mean
 * different things, and casting one to the other is how a comment ends up
 * lying about what a value is.
 */
type RouteHeading = 'east' | 'south' | 'west' | 'north'

interface GridNode {
  x: number
  y: number
  /** Which way the route was travelling when it arrived, for the bend cost. */
  heading: RouteHeading | null
  cost: number
}

function key(x: number, y: number, heading: RouteHeading | null): string {
  return `${x}:${y}:${heading ?? '-'}`
}

const STEPS: { heading: RouteHeading; dx: number; dy: number }[] = [
  // Iterated in a FIXED order, which is half of what makes the router
  // deterministic: two paths of equal cost are separated by this order and by
  // nothing else, so the same inputs always produce the same route.
  { heading: 'east', dx: 1, dy: 0 },
  { heading: 'south', dx: 0, dy: 1 },
  { heading: 'west', dx: -1, dy: 0 },
  { heading: 'north', dx: 0, dy: -1 },
]

/**
 * An orthogonal route from one card to another that stays clear of the rest.
 *
 * A uniform-cost search over a coarse grid, with a penalty per turn so the
 * result reads as a drawn line rather than a staircase. Returns the corner
 * points, start and end included; the render step rounds the corners.
 *
 * **Deterministic by construction, not by luck.** The grid is derived from
 * the inputs, the four directions are tried in a fixed order, and the
 * frontier is sorted stably — so two routes of equal cost are separated by
 * something fixed rather than by whatever order a `Map` happened to hold. The
 * obstacle list's order cannot matter either: every use of it asks whether
 * ANY rectangle blocks a step. A route that changed on re-render would make
 * the canvas twitch on every unrelated state change.
 *
 * Returns `null` when it cannot get through, which is a real answer: the
 * caller falls back to the plain side-selected curve rather than drawing a
 * route through a card.
 */
export function routeAround(input: {
  source: RouteRect
  target: RouteRect
  sourceSide: RouteSide
  targetSide: RouteSide
  /** Every card on the canvas; the two endpoints are ignored automatically. */
  obstacles: readonly RouteRect[]
  /** Safety valve: a grid this big means the picture is not worth routing. */
  maxNodes?: number
}): RoutePoint[] | null {
  const start = stubPoint(input.source, input.sourceSide)
  const end = stubPoint(input.target, input.targetSide)

  // Order-insensitive by construction rather than by sorting: every use of
  // this list asks "does ANY of these block me", which is the same answer
  // whatever order they arrive in. An earlier draft sorted them by id to make
  // the router deterministic — the sort turned out to change nothing, and a
  // line whose removal leaves every test green is a line that was decorating
  // the promise instead of keeping it. The promise is kept by the fixed
  // direction order and the stable frontier sort below; the test that hands
  // the same cards in reverse pins that this list's order stays irrelevant.
  const blockers = input.obstacles
    .filter(
      (rect) => rect.id !== input.source.id && rect.id !== input.target.id,
    )
    .map((rect) => expand(rect, ROUTE_CLEARANCE))

  // The straight-ish answer first: if one bend does it, no search is needed
  // and the result is the most readable route there is.
  const direct = orthogonalCandidates(start, end)
  for (const candidate of direct) {
    if (!pathHits(candidate, blockers)) {
      return [
        sidePoint(input.source, input.sourceSide),
        ...candidate,
        sidePoint(input.target, input.targetSide),
      ]
    }
  }

  const bounds = searchBounds([input.source, input.target, ...blockers])
  const maxNodes = input.maxNodes ?? 20_000

  const startCell = snap(start, bounds)
  const endCell = snap(end, bounds)

  const queue: GridNode[] = [{ ...startCell, heading: null, cost: 0 }]
  const seen = new Map<string, number>()
  const cameFrom = new Map<string, GridNode | null>()
  seen.set(key(startCell.x, startCell.y, null), 0)
  cameFrom.set(key(startCell.x, startCell.y, null), null)

  let visited = 0
  while (queue.length > 0) {
    // A sorted frontier rather than a heap: the grid is coarse and the
    // frontier stays small, and a stable sort keeps equal-cost ties resolved
    // by insertion order — which is the determinism promise again.
    queue.sort((a, b) => a.cost - b.cost)
    const current = queue.shift() as GridNode
    visited += 1
    if (visited > maxNodes) return null

    if (current.x === endCell.x && current.y === endCell.y) {
      const corners = reconstruct(current, cameFrom)
      return [
        sidePoint(input.source, input.sourceSide),
        ...corners,
        sidePoint(input.target, input.targetSide),
      ]
    }

    for (const step of STEPS) {
      const next = {
        x: current.x + step.dx * ROUTE_GRID,
        y: current.y + step.dy * ROUTE_GRID,
      }
      if (
        next.x < bounds.minX ||
        next.x > bounds.maxX ||
        next.y < bounds.minY ||
        next.y > bounds.maxY
      ) {
        continue
      }
      if (blockers.some((rect) => segmentHitsRect(current, next, rect))) {
        continue
      }
      const turned =
        current.heading !== null && current.heading !== step.heading
      const cost =
        current.cost + ROUTE_GRID + (turned ? BEND_PENALTY * ROUTE_GRID : 0)
      const nextKey = key(next.x, next.y, step.heading)
      const best = seen.get(nextKey)
      if (best !== undefined && best <= cost) continue
      seen.set(nextKey, cost)
      cameFrom.set(nextKey, current)
      queue.push({ ...next, heading: step.heading, cost })
    }
  }

  return null
}

/** Where a route stands off from the card before it starts turning. */
function stubPoint(rect: RouteRect, side: RouteSide): RoutePoint {
  const point = sidePoint(rect, side)
  switch (side) {
    case 'left':
      return { x: point.x - ROUTE_STUB, y: point.y }
    case 'right':
      return { x: point.x + ROUTE_STUB, y: point.y }
    case 'top':
      return { x: point.x, y: point.y - ROUTE_STUB }
    case 'bottom':
      return { x: point.x, y: point.y + ROUTE_STUB }
  }
}

/** The two one-bend routes between two points, in a fixed order. */
function orthogonalCandidates(
  start: RoutePoint,
  end: RoutePoint,
): RoutePoint[][] {
  if (start.x === end.x || start.y === end.y) return [[start, end]]
  return [
    [start, { x: end.x, y: start.y }, end],
    [start, { x: start.x, y: end.y }, end],
  ]
}

function pathHits(
  path: readonly RoutePoint[],
  blockers: readonly RouteRect[],
): boolean {
  for (let index = 0; index < path.length - 1; index += 1) {
    for (const rect of blockers) {
      if (segmentHitsRect(path[index], path[index + 1], rect)) return true
    }
  }
  return false
}

function searchBounds(rects: readonly RouteRect[]): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} {
  const pad = ROUTE_GRID * 4
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const rect of rects) {
    minX = Math.min(minX, rect.x)
    maxX = Math.max(maxX, rect.x + rect.width)
    minY = Math.min(minY, rect.y)
    maxY = Math.max(maxY, rect.y + rect.height)
  }
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minY: minY - pad,
    maxY: maxY + pad,
  }
}

/** A point on the grid, measured from the search area's own origin. */
function snap(
  point: RoutePoint,
  bounds: { minX: number; minY: number },
): RoutePoint {
  return {
    x:
      bounds.minX +
      Math.round((point.x - bounds.minX) / ROUTE_GRID) * ROUTE_GRID,
    y:
      bounds.minY +
      Math.round((point.y - bounds.minY) / ROUTE_GRID) * ROUTE_GRID,
  }
}

/** The corners of the found path, with the straight runs collapsed. */
function reconstruct(
  end: GridNode,
  cameFrom: Map<string, GridNode | null>,
): RoutePoint[] {
  const points: RoutePoint[] = []
  let node: GridNode | null = end
  while (node) {
    points.unshift({ x: node.x, y: node.y })
    node = cameFrom.get(key(node.x, node.y, node.heading)) ?? null
  }
  return simplify(points)
}

/**
 * Collapses a grid walk into corners.
 *
 * The search returns one point per cell; a line with forty points in it is
 * forty chances for a rounding step to wobble. What a reader sees is the
 * turns.
 */
export function simplify(points: readonly RoutePoint[]): RoutePoint[] {
  if (points.length <= 2) return [...points]
  const corners: RoutePoint[] = [points[0]]
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const next = points[index + 1]
    const straight =
      (previous.x === current.x && current.x === next.x) ||
      (previous.y === current.y && current.y === next.y)
    if (!straight) corners.push(current)
  }
  corners.push(points[points.length - 1])
  return corners
}

/**
 * The SVG path for a set of corners, with the turns rounded.
 *
 * Rounded orthogonal geometry is the shape Marcin picked, and it is a render
 * concern rather than a routing one: the router answers *where*, this answers
 * *how it is drawn*.
 */
export function routePath(points: readonly RoutePoint[], radius = 8): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`

  let path = `M ${points[0].x},${points[0].y}`
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const corner = points[index]
    const next = points[index + 1]
    // Never round more than half a segment, or two close corners eat each
    // other and the line visibly detaches from its own path.
    const inLength = distance(previous, corner)
    const outLength = distance(corner, next)
    const r = Math.min(radius, inLength / 2, outLength / 2)
    const enter = towards(corner, previous, r)
    const leave = towards(corner, next, r)
    path += ` L ${enter.x},${enter.y} Q ${corner.x},${corner.y} ${leave.x},${leave.y}`
  }
  const last = points[points.length - 1]
  path += ` L ${last.x},${last.y}`
  return path
}

function distance(a: RoutePoint, b: RoutePoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function towards(from: RoutePoint, to: RoutePoint, by: number): RoutePoint {
  const total = distance(from, to)
  if (total === 0) return { ...from }
  const ratio = by / total
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  }
}

/**
 * Where a route's label sits: the middle of its longest straight run.
 *
 * A label on a corner is a label on top of the turn it is describing, and a
 * label at the midpoint of the whole path lands wherever the path happens to
 * be bending.
 */
export function routeLabelPoint(points: readonly RoutePoint[]): RoutePoint {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return { ...points[0] }

  let bestIndex = 0
  let bestLength = -1
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = distance(points[index], points[index + 1])
    if (length > bestLength) {
      bestLength = length
      bestIndex = index
    }
  }
  const from = points[bestIndex]
  const to = points[bestIndex + 1]
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
}

/** Whether any point of a route lies inside a rectangle. Test helper shape. */
export function routeEntersRect(
  points: readonly RoutePoint[],
  rect: RouteRect,
): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (segmentHitsRect(points[index], points[index + 1], rect)) return true
  }
  return points.some((point) => contains(rect, point))
}
