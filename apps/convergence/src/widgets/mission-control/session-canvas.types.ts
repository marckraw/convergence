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
 * What each canvas node carries.
 *
 * React Flow hands node data back untyped, so these shapes exist to name what
 * the custom node components may rely on. They stay in the widget layer with
 * the library itself: nothing below `widgets` knows the canvas is React Flow.
 */
export interface CanvasSessionNodeData {
  card: SessionCard
  onOpen: (card: SessionCard) => void
}

export type CanvasCrewClusterData = Omit<CanvasCrewCluster, 'x' | 'y'>

export type CanvasSpawnNodeData = Omit<CanvasSpawnNode, 'x' | 'y'>

export type CanvasChairNodeData = Omit<CanvasChairNode, 'x' | 'y'> & {
  /** Answers every call this crew is making. Absent while it is making none. */
  onAcknowledge: (crewId: string) => void
}
