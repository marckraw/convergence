import type {
  CanvasChairNode,
  CanvasCrewCluster,
  CanvasSpawnNode,
  SessionCard,
} from '@/features/mission-control'

/**
 * Where a wire attaches.
 *
 * Forward wires run right-to-left across the columns. A wire pointing back at
 * an earlier column leaves and arrives underneath instead, so the returning
 * half of a review loop reads as a loop rather than hiding beneath the wire it
 * answers.
 */
export const CANVAS_HANDLE = {
  in: 'in',
  out: 'out',
  loopIn: 'loop-in',
  loopOut: 'loop-out',
} as const

/**
 * A handle per side, for each role (R11).
 *
 * Four was enough while the LAYOUT chose the geometry — forward wires ran
 * right-to-left and a return wire went underneath. Cards move now (R10), so
 * "which side faces the other card" is a question about POSITIONS, and
 * answering it needs somewhere to attach on every side.
 *
 * The four original ids are reused rather than replaced: `out`/`loop-out` ARE
 * the right and bottom of the source row, and `in`/`loop-in` the left and
 * bottom of the target row. A second name for the same port would be a second
 * thing to keep in step.
 */
export const CANVAS_SIDE_HANDLE = {
  source: {
    left: 'source-left',
    right: CANVAS_HANDLE.out,
    top: 'source-top',
    bottom: CANVAS_HANDLE.loopOut,
  },
  target: {
    left: CANVAS_HANDLE.in,
    right: 'target-right',
    top: 'target-top',
    bottom: CANVAS_HANDLE.loopIn,
  },
} as const

export type CanvasHandleSide = 'left' | 'right' | 'top' | 'bottom'

/**
 * What each canvas node carries.
 *
 * React Flow hands node data back untyped, so these shapes exist to name what
 * the custom node components may rely on. They stay in the widget layer with
 * the library itself: nothing below `widgets` knows the canvas is React Flow.
 */
export interface CanvasSessionNodeData {
  card: SessionCard
  /**
   * Which crew this card is drawn inside. A session can belong to several
   * crews and is drawn once per crew, so the card alone cannot answer it —
   * the graph node can, and the toolbar needs to know which crew a click
   * selected.
   */
  crewId: string
  onOpen: (card: SessionCard) => void
  /**
   * True while the canvas can be authored: handles become visible and
   * connectable, and the card answers Enter with "pick me" instead of "open
   * me". Absent on a read-only canvas, which is what every caller before
   * authoring had.
   */
  authoring?: boolean
  /** Armed Connect mode: the card is a target for the next pick. */
  connecting?: boolean
  /** True when this card is the source half of a pick in progress. */
  connectSource?: boolean
  /**
   * Picking this card, by click or by Enter. Only called while `connecting`;
   * a card outside Connect mode still navigates.
   */
  onPick?: (sessionId: string) => void
}

export type CanvasCrewClusterData = Omit<CanvasCrewCluster, 'x' | 'y'>

export type CanvasSpawnNodeData = Omit<CanvasSpawnNode, 'x' | 'y'>

export type CanvasChairNodeData = Omit<CanvasChairNode, 'x' | 'y'> & {
  /** Answers every call this crew is making. Absent while it is making none. */
  onAcknowledge: (crewId: string) => void
}
