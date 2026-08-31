import type { RelayAction, SessionRelay } from '@/entities/session-relay'
import type { SessionCrewGroup } from './session-crew-groups.pure'
import type { SessionCard } from './mission-control.types'

/**
 * Canvas geometry, in the same units React Flow uses.
 *
 * Node width matches the room's grid column so a card reads at the same size
 * whichever view it is in. The gaps are wide enough that a wire bending back
 * for a loop has somewhere to live.
 */
export const CANVAS_NODE_WIDTH = 260
export const CANVAS_NODE_HEIGHT = 108
export const CANVAS_SPAWN_NODE_HEIGHT = 64
const COLUMN_GAP = 120
const ROW_GAP = 40
const CLUSTER_PADDING_X = 20
const CLUSTER_PADDING_TOP = 44
const CLUSTER_PADDING_BOTTOM = 20
const CLUSTER_GAP = 48

/**
 * A spawn wire has no far end until it fires, so the canvas draws the session
 * it promises to open. The prefix keeps those ids from ever colliding with a
 * real session id.
 */
const SPAWN_NODE_ID_PREFIX = 'spawn:'

export function spawnNodeId(relayId: string): string {
  return `${SPAWN_NODE_ID_PREFIX}${relayId}`
}

export interface CanvasSessionNode {
  /** The session id: node identity on the canvas is session identity. */
  id: string
  crewId: string
  card: SessionCard
  /** Absolute canvas position of the node's top-left corner. */
  x: number
  y: number
}

/** The session a spawn wire will open, drawn before it exists. */
export interface CanvasSpawnNode {
  id: string
  relayId: string
  crewId: string
  /** The name the spawned session starts with. */
  name: string
  /** Null when the stored spec is unreadable — the wire is still drawn. */
  providerId: string | null
  model: string | null
  armed: boolean
  x: number
  y: number
}

export interface CanvasEdge {
  id: string
  relayId: string
  crewId: string
  source: string
  /** A session id, or the id of the spawn chip this wire opens. */
  target: string
  armed: boolean
  action: RelayAction
  /**
   * True when the wire points at a column at or left of its own: the loop.
   * Drawn along the underside so it cannot be mistaken for a forward wire.
   */
  back: boolean
}

export interface CanvasCrewCluster {
  crewId: string
  name: string
  emoji: string | null
  accentColor: string | null
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasGraph {
  clusters: CanvasCrewCluster[]
  nodes: CanvasSessionNode[]
  spawnNodes: CanvasSpawnNode[]
  edges: CanvasEdge[]
}

interface FlowWire {
  from: string
  to: string
}

/**
 * How far along the flow each drawn thing sits.
 *
 * Loops are legal here -- A -> B -> A is the review loop -- so this cannot be a
 * plain longest-path walk. It layers outward from the units nothing points at,
 * and a crew that is nothing but a cycle gets its first unit as the root so the
 * drawing still has a left edge. Every tie is broken by the order the units
 * arrived in, which is why the same room always draws the same picture.
 */
export function assignFlowColumns(
  unitIds: readonly string[],
  wires: readonly FlowWire[],
): Map<string, number> {
  const present = new Set(unitIds)
  const columns = new Map<string, number>()
  if (unitIds.length === 0) return columns

  // Only wires with both ends on the canvas can shape the drawing.
  const drawn = wires.filter(
    (wire) => present.has(wire.from) && present.has(wire.to),
  )

  const outgoing = new Map<string, string[]>()
  const indegree = new Map<string, number>(unitIds.map((id) => [id, 0]))
  for (const wire of drawn) {
    const from = outgoing.get(wire.from) ?? []
    from.push(wire.to)
    outgoing.set(wire.from, from)
    indegree.set(wire.to, (indegree.get(wire.to) ?? 0) + 1)
  }

  let frontier = unitIds.filter((id) => (indegree.get(id) ?? 0) === 0)
  // A crew that is one closed loop has no unit without an incoming wire.
  // Rather than refuse to draw it, the first one becomes the left edge.
  if (frontier.length === 0) frontier = [unitIds[0]]

  let column = 0
  for (const id of frontier) columns.set(id, 0)

  while (frontier.length > 0) {
    const next: string[] = []
    column += 1
    for (const id of frontier) {
      for (const target of outgoing.get(id) ?? []) {
        // First layer to reach a unit wins: a wire looping back must never
        // push its target further right on every pass.
        if (columns.has(target)) continue
        columns.set(target, column)
        next.push(target)
      }
    }
    frontier = next
  }

  // A unit reachable only through a loop can still be unplaced. It belongs on
  // the canvas regardless -- it is a member of the crew.
  for (const id of unitIds) {
    if (!columns.has(id)) columns.set(id, 0)
  }

  return columns
}

/**
 * Lays crews out as stacked clusters of left-to-right wires.
 *
 * Positions are computed, never stored: the canvas is read-only in v1, so a
 * layout that is a pure function of the room means two windows showing the same
 * crew always agree, and nothing can drift out of sync with the data.
 *
 * Crews with no visible cards are dropped rather than drawn empty -- an empty
 * box on a canvas reads as a thing that failed to load.
 */
export function buildCanvasGraph(
  groups: readonly SessionCrewGroup[],
  relays: readonly SessionRelay[],
): CanvasGraph {
  const clusters: CanvasCrewCluster[] = []
  const nodes: CanvasSessionNode[] = []
  const spawnNodes: CanvasSpawnNode[] = []
  const edges: CanvasEdge[] = []
  let clusterTop = 0

  for (const group of groups) {
    // The canvas is about flows, so sessions in no crew are not on it.
    if (!group.crew || group.cards.length === 0) continue

    const crew = group.crew
    const drawnSessions = new Set(group.cards.map((card) => card.session.id))
    const crewRelays = relays.filter(
      (relay) =>
        relay.crewId === crew.id && drawnSessions.has(relay.sourceSessionId),
    )

    // A spawn wire draws the session it promises; a hail only draws if the
    // session it points at survived the filter.
    const spawnRelays = crewRelays.filter((relay) => relay.action === 'spawn')
    const hailRelays = crewRelays.filter(
      (relay) =>
        relay.action !== 'spawn' &&
        relay.targetSessionId !== null &&
        drawnSessions.has(relay.targetSessionId),
    )

    const unitIds = [
      ...group.cards.map((card) => card.session.id),
      ...spawnRelays.map((relay) => spawnNodeId(relay.id)),
    ]
    const wires: FlowWire[] = [
      ...hailRelays.map((relay) => ({
        from: relay.sourceSessionId,
        to: relay.targetSessionId as string,
      })),
      ...spawnRelays.map((relay) => ({
        from: relay.sourceSessionId,
        to: spawnNodeId(relay.id),
      })),
    ]

    const columns = assignFlowColumns(unitIds, wires)
    const rowsByColumn = new Map<number, number>()
    let widestColumn = 0
    let tallestColumn = 0

    const place = (id: string): { x: number; y: number } => {
      const column = columns.get(id) ?? 0
      const row = rowsByColumn.get(column) ?? 0
      rowsByColumn.set(column, row + 1)
      widestColumn = Math.max(widestColumn, column)
      tallestColumn = Math.max(tallestColumn, row + 1)
      return {
        x: CLUSTER_PADDING_X + column * (CANVAS_NODE_WIDTH + COLUMN_GAP),
        y:
          clusterTop +
          CLUSTER_PADDING_TOP +
          row * (CANVAS_NODE_HEIGHT + ROW_GAP),
      }
    }

    for (const card of group.cards) {
      nodes.push({
        id: card.session.id,
        crewId: crew.id,
        card,
        ...place(card.session.id),
      })
    }

    for (const relay of spawnRelays) {
      const spec = relay.spawnSpec
      spawnNodes.push({
        id: spawnNodeId(relay.id),
        relayId: relay.id,
        crewId: crew.id,
        // A spec written by another build can be unreadable. The wire is still
        // real, so it is still drawn -- saying so rather than vanishing.
        name: spec?.name ?? 'Unspecified session',
        providerId: spec?.providerId ?? null,
        model: spec?.model ?? null,
        armed: relay.armed,
        ...place(spawnNodeId(relay.id)),
      })
    }

    for (const relay of [...hailRelays, ...spawnRelays]) {
      const target =
        relay.action === 'spawn'
          ? spawnNodeId(relay.id)
          : (relay.targetSessionId as string)
      const sourceColumn = columns.get(relay.sourceSessionId) ?? 0
      const targetColumn = columns.get(target) ?? 0

      edges.push({
        id: relay.id,
        relayId: relay.id,
        crewId: crew.id,
        source: relay.sourceSessionId,
        target,
        armed: relay.armed,
        action: relay.action,
        back: targetColumn <= sourceColumn,
      })
    }

    const width =
      CLUSTER_PADDING_X * 2 +
      (widestColumn + 1) * CANVAS_NODE_WIDTH +
      widestColumn * COLUMN_GAP
    const height =
      CLUSTER_PADDING_TOP +
      CLUSTER_PADDING_BOTTOM +
      tallestColumn * CANVAS_NODE_HEIGHT +
      (tallestColumn - 1) * ROW_GAP

    clusters.push({
      crewId: crew.id,
      name: crew.name,
      emoji: crew.emoji,
      accentColor: crew.accentColor,
      x: 0,
      y: clusterTop,
      width,
      height,
    })

    clusterTop += height + CLUSTER_GAP
  }

  return { clusters, nodes, spawnNodes, edges }
}

/**
 * The Flow strip's colour language, in the values a stroke needs.
 *
 * A crew that chose an accent lends it to its live wires, so a canvas holding
 * several crews reads as several flows rather than one green mesh. Crews with
 * no accent fall back to the strip's emerald, and a disarmed wire is always
 * grey -- "switched off" must never be mistakable for "this crew is grey".
 */
export const ARMED_WIRE_FALLBACK_COLOR = '#34d399'

/**
 * Theme-aware on purpose. This was a flat white, which is a wire you cannot see
 * at all on a light canvas -- the room has a light mode and a switched-off wire
 * still has to be findable in it.
 */
export const DISARMED_WIRE_COLOR =
  'color-mix(in srgb, var(--muted-foreground) 70%, transparent)'

export function resolveWireColor(
  edge: Pick<CanvasEdge, 'armed' | 'crewId'>,
  clusters: readonly Pick<CanvasCrewCluster, 'crewId' | 'accentColor'>[],
): string {
  if (!edge.armed) return DISARMED_WIRE_COLOR
  const cluster = clusters.find((entry) => entry.crewId === edge.crewId)
  return cluster?.accentColor ?? ARMED_WIRE_FALLBACK_COLOR
}

/** The chip's own line: what kind of session this wire opens. */
export function formatSpawnNodeSpec(
  node: Pick<CanvasSpawnNode, 'providerId' | 'model'>,
): string {
  if (!node.providerId) return 'spec unreadable'
  return node.model ? `${node.providerId} · ${node.model}` : node.providerId
}

/** What the canvas says when the room has crews but none of them are drawable. */
export const EMPTY_CANVAS_MESSAGE =
  'No crewed sessions to draw. The canvas shows crews and the wires between them — put sessions in a crew to see them here.'
