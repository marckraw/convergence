export const MIN_CARD_GAP = 64
const DROP_GRID = 20

interface CardRect {
  id: string
  x: number
  y: number
  width: number
  height: number
}

/** Nearest free grid point at/below the slot floor; ties favor down, then right. */
export function resolveCardDrop(
  dragged: CardRect,
  obstacles: readonly CardRect[],
  minimumY = 0,
): { x: number; y: number } {
  const free = (x: number, y: number) =>
    y >= minimumY &&
    obstacles.every(
      (other) =>
        other.id === dragged.id ||
        x + dragged.width <= other.x - MIN_CARD_GAP ||
        x >= other.x + other.width + MIN_CARD_GAP ||
        y + dragged.height <= other.y - MIN_CARD_GAP ||
        y >= other.y + other.height + MIN_CARD_GAP,
    )
  if (free(dragged.x, dragged.y)) return { x: dragged.x, y: dragged.y }

  let best: { x: number; y: number; distance: number } | undefined
  const consider = (dx: number, dy: number) => {
    const x = dragged.x + dx * DROP_GRID
    const y = dragged.y + dy * DROP_GRID
    const distance = (dx * dx + dy * dy) * DROP_GRID * DROP_GRID
    if (
      free(x, y) &&
      (!best ||
        distance < best.distance ||
        (distance === best.distance &&
          (y > best.y || (y === best.y && x > best.x))))
    )
      best = { x, y, distance }
  }
  // Search complete square rings. Once the next ring's closest possible point
  // is farther than the best candidate, no unvisited point can beat it.
  for (let ring = 1; ; ring += 1) {
    for (let offset = -ring; offset <= ring; offset += 1) {
      consider(offset, -ring)
      consider(offset, ring)
      if (Math.abs(offset) < ring) {
        consider(-ring, offset)
        consider(ring, offset)
      }
    }
    if (best && ((ring + 1) * DROP_GRID) ** 2 > best.distance)
      return { x: best.x, y: best.y }
  }
}
