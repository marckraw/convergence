import { describe, expect, it } from 'vitest'
import {
  ROUTE_CLEARANCE,
  chooseRouteSides,
  rectCenter,
  routeAround,
  routeEntersRect,
  routeLabelPoint,
  routePath,
  segmentHitsRect,
  sidePoint,
  simplify,
} from './canvas-route.pure'
import type { RouteRect } from './canvas-route.pure'

const CARD_WIDTH = 260
const CARD_HEIGHT = 108

function card(id: string, x: number, y: number): RouteRect {
  return { id, x, y, width: CARD_WIDTH, height: CARD_HEIGHT }
}

/**
 * The stress fixture the bound names: six cards, a return route, mixed sides,
 * and a card sitting between two others that a naive straight line would go
 * straight through.
 *
 *     fable        blocker       opus
 *                  middle
 *     marcin       sol           astra
 */
const STRESS: RouteRect[] = [
  card('fable', 0, 0),
  card('blocker', 400, 0),
  card('opus', 800, 0),
  card('marcin', 0, 300),
  card('sol', 400, 300),
  card('astra', 800, 300),
]

describe('chooseRouteSides', () => {
  /**
   * Position, not column (R10 changed the premise): a card that has been
   * dragged left of its source has to be entered from the RIGHT, or the wire
   * leaves the wrong edge and reads as a mistake.
   *
   * Mutation that reds it: choose sides from the layout column again.
   */
  it('leaves and enters by the sides the two cards actually face', () => {
    expect(chooseRouteSides(card('a', 0, 0), card('b', 500, 0))).toEqual({
      sourceSide: 'right',
      targetSide: 'left',
    })
    // The same pair, dragged the other way round.
    expect(chooseRouteSides(card('a', 500, 0), card('b', 0, 0))).toEqual({
      sourceSide: 'left',
      targetSide: 'right',
    })
    expect(chooseRouteSides(card('a', 0, 0), card('b', 0, 500))).toEqual({
      sourceSide: 'bottom',
      targetSide: 'top',
    })
    expect(chooseRouteSides(card('a', 0, 500), card('b', 0, 0))).toEqual({
      sourceSide: 'top',
      targetSide: 'bottom',
    })
  })

  it('follows the bigger gap when a pair is diagonal', () => {
    // Mostly across.
    expect(
      chooseRouteSides(card('a', 0, 0), card('b', 900, 120)).sourceSide,
    ).toBe('right')
    // Mostly down.
    expect(
      chooseRouteSides(card('a', 0, 0), card('b', 60, 900)).sourceSide,
    ).toBe('bottom')
  })

  it('puts the attachment point on the middle of the side it named', () => {
    const rect = card('a', 100, 200)
    expect(sidePoint(rect, 'right')).toEqual({
      x: 100 + CARD_WIDTH,
      y: 200 + CARD_HEIGHT / 2,
    })
    expect(sidePoint(rect, 'top')).toEqual({
      x: 100 + CARD_WIDTH / 2,
      y: 200,
    })
    expect(rectCenter(rect)).toEqual({
      x: 100 + CARD_WIDTH / 2,
      y: 200 + CARD_HEIGHT / 2,
    })
  })
})

describe('segmentHitsRect', () => {
  it('sees a crossing and ignores a pass', () => {
    const rect = card('x', 100, 100)
    expect(segmentHitsRect({ x: 0, y: 150 }, { x: 500, y: 150 }, rect)).toBe(
      true,
    )
    // Above it.
    expect(segmentHitsRect({ x: 0, y: 50 }, { x: 500, y: 50 }, rect)).toBe(
      false,
    )
    // Ending exactly on the edge is a touch, not a crossing — otherwise every
    // route would report hitting the card it is attached to.
    expect(segmentHitsRect({ x: 0, y: 150 }, { x: 100, y: 150 }, rect)).toBe(
      false,
    )
  })
})

describe('routeAround', () => {
  /**
   * THE clearance canary, on the stress fixture the bound names. A route from
   * `fable` to `opus` has `blocker` sitting exactly between them, so the
   * one-bend answer is not available and the search has to go round.
   *
   * Mutation that reds it: pass an empty `obstacles` list (or drop the
   * `segmentHitsRect` guard in the step loop) — the route runs straight
   * through the card in the middle.
   */
  it('keeps every segment clear of the cards it is not attached to', () => {
    const source = STRESS[0]
    const target = STRESS[2]
    const sides = chooseRouteSides(source, target)

    const route = routeAround({
      source,
      target,
      ...sides,
      obstacles: STRESS,
    })

    expect(route).not.toBeNull()
    for (const rect of STRESS) {
      if (rect.id === source.id || rect.id === target.id) continue
      expect(routeEntersRect(route as never, rect)).toBe(false)
    }
  })

  it('leaves breathing room rather than grazing a card', () => {
    const source = STRESS[0]
    const target = STRESS[2]
    const route = routeAround({
      source,
      target,
      ...chooseRouteSides(source, target),
      obstacles: STRESS,
    })

    // The clearance is what stops a route reading as though it were touching
    // the card it passes.
    const grown = {
      ...STRESS[1],
      x: STRESS[1].x - ROUTE_CLEARANCE + 1,
      y: STRESS[1].y - ROUTE_CLEARANCE + 1,
      width: STRESS[1].width + (ROUTE_CLEARANCE - 1) * 2,
      height: STRESS[1].height + (ROUTE_CLEARANCE - 1) * 2,
    }
    expect(routeEntersRect(route as never, grown)).toBe(false)
  })

  /**
   * THE determinism canary. A route that changed between renders would make
   * the canvas twitch on every unrelated state change, and the fix would be
   * invisible from a screenshot.
   *
   * Mutation that reds it: make the router order-sensitive — resolve a
   * blocked step against `blockers[0]` alone instead of asking whether ANY
   * rectangle blocks it.
   */
  it('returns the identical route for the same cards in any order', () => {
    const source = STRESS[0]
    const target = STRESS[2]
    const sides = chooseRouteSides(source, target)

    const first = routeAround({ source, target, ...sides, obstacles: STRESS })
    const again = routeAround({ source, target, ...sides, obstacles: STRESS })
    const shuffled = routeAround({
      source,
      target,
      ...sides,
      obstacles: [...STRESS].reverse(),
    })

    expect(again).toEqual(first)
    expect(shuffled).toEqual(first)
  })

  /**
   * A moved card is a different picture, and the route has to follow it — and
   * still start and end ON the two cards, which is what "no detached
   * endpoint" means. The rendering half (no cache keyed by edge id) lives in
   * `canvas-routed-edge.presentational.tsx`, which recomputes from the
   * current nodes; this pins the half that can be reasoned about.
   *
   * Mutation that reds it: compute an attachment point from the rectangle's
   * origin instead of its chosen side — both ends detach from their cards.
   */
  it('re-routes when a card moves, staying attached at both ends', () => {
    const source = STRESS[0]
    const before = routeAround({
      source,
      target: STRESS[2],
      ...chooseRouteSides(source, STRESS[2]),
      obstacles: STRESS,
    }) as { x: number; y: number }[]

    const moved = card('opus', 800, 600)
    const after = routeAround({
      source,
      target: moved,
      ...chooseRouteSides(source, moved),
      obstacles: [...STRESS.slice(0, 2), moved, ...STRESS.slice(3)],
    }) as { x: number; y: number }[]

    expect(after).not.toEqual(before)
    // Both ends sit exactly on their card's chosen side — asserted as LITERAL
    // coordinates, not by calling `sidePoint` again. An assertion that reuses
    // the function under test agrees with its own mutation and proves nothing.
    // `fable` is at (0,0) and `opus` has moved to (800,600); the pair is wider
    // than it is tall, so the route leaves fable's right edge and enters
    // opus's left one, each at the card's vertical middle.
    expect(after[0]).toEqual({ x: CARD_WIDTH, y: CARD_HEIGHT / 2 })
    expect(after[after.length - 1]).toEqual({
      x: 800,
      y: 600 + CARD_HEIGHT / 2,
    })
  })

  it('takes the straight answer when nothing is in the way', () => {
    const source = card('a', 0, 0)
    const target = card('b', 600, 0)
    const route = routeAround({
      source,
      target,
      ...chooseRouteSides(source, target),
      obstacles: [source, target],
    })

    // Two attachment points and the stubs between them: no detour invented
    // where none was needed.
    expect(route).not.toBeNull()
    expect((route as unknown[]).length).toBeLessThanOrEqual(4)
  })

  /**
   * A real answer, not a crash: when the router cannot get through, the
   * caller falls back to the plain curve rather than drawing a line through a
   * card.
   */
  it('says null rather than forcing a route it could not find', () => {
    // The direct one-bend answer is blocked, so the search has to run — and
    // the budget stops it before it finds anything. Null is a real answer:
    // the caller falls back to the plain curve rather than drawing a line
    // through a card.
    const source = STRESS[0]
    const target = STRESS[2]
    const route = routeAround({
      source,
      target,
      ...chooseRouteSides(source, target),
      obstacles: STRESS,
      maxNodes: 2,
    })

    expect(route).toBeNull()
  })

  it('routes a return leg back the way it came without going through anyone', () => {
    // The review loop: opus back to fable, with the blocker between them.
    const source = STRESS[2]
    const target = STRESS[0]
    const route = routeAround({
      source,
      target,
      ...chooseRouteSides(source, target),
      obstacles: STRESS,
    })

    expect(route).not.toBeNull()
    expect(routeEntersRect(route as never, STRESS[1])).toBe(false)
  })
})

describe('simplify', () => {
  it('keeps the turns and drops the walk between them', () => {
    expect(
      simplify([
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 20 },
        { x: 40, y: 40 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
    ])
  })

  it('leaves a two-point line alone', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]
    expect(simplify(line)).toEqual(line)
  })
})

describe('routePath', () => {
  /**
   * Mutation that reds it: drop the `Math.min(radius, …)` cap — on a segment
   * shorter than the radius the rounding runs PAST the neighbouring point and
   * the drawn line visibly leaves its own path.
   */
  it('rounds a corner without overshooting the segments beside it', () => {
    // Segments of 4 against a radius of 8: uncapped, the curve would start
    // before the previous point and end after the next one.
    const path = routePath(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
      ],
      8,
    )

    expect(path).toBe('M 0,0 L 2,0 Q 4,0 4,2 L 4,4')
    expect(path).not.toContain('-')
    expect(path).not.toContain('NaN')
  })

  it('draws a straight line as a straight line', () => {
    expect(
      routePath([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ).toBe('M 0,0 L 100,0')
  })

  it('says nothing about nothing', () => {
    expect(routePath([])).toBe('')
  })
})

describe('routeLabelPoint', () => {
  it('sits in the middle of the longest straight run, never on a corner', () => {
    expect(
      routeLabelPoint([
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 400 },
      ]),
    ).toEqual({ x: 20, y: 200 })
  })
})
