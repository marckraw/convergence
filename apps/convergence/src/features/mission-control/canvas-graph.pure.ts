import type { CrewHail } from '@/entities/crew-hail'
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

/**
 * Marcin's chair: the one terminal a baton crew always has.
 *
 * Auto-present rather than drawn by hand, and not a session. Every route that
 * ends at a human ends here, so `BATON: marcin` is a REAL arrow on the diagram
 * instead of an absence, and the three safety nets have somewhere visible to
 * point. A glance at a crew must show what can happen after each station --
 * including "it stops and waits for you".
 */
const CHAIR_NODE_ID_PREFIX = 'chair:'

export function chairNodeId(crewId: string): string {
  return `${CHAIR_NODE_ID_PREFIX}${crewId}`
}

export const CHAIR_NODE_LABEL = 'Marcin'
export const CHAIR_NODE_EMOJI = '🪑'
export const CANVAS_CHAIR_NODE_HEIGHT = 64

/** What the one dashed edge from a crew's frame to its chair is called. */
export const SAFETY_EDGE_LABEL = 'otherwise · budget · stall'

/** The label a drawn terminal route wears. */
export const TERMINAL_EDGE_LABEL = '⚡ marcin'

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

/**
 * What a drawn edge IS, which decides how it may be read and clicked.
 *
 * `relay` is a wire the user drew and can open. `terminal` and `safety` are
 * drawn consequences of the crew's shape -- there is no stored row behind
 * either, so neither has a relay to open, and `relayId` is null on both. The
 * kind is carried rather than inferred from a null id, because "this edge has
 * no relay" and "this edge is a safety net" are different facts and only one
 * of them decides how it is drawn.
 */
export type CanvasEdgeKind = 'relay' | 'terminal' | 'safety'

export interface CanvasEdge {
  id: string
  kind: CanvasEdgeKind
  /** Null on every edge that is not a stored wire. */
  relayId: string | null
  crewId: string
  source: string
  /** A session id, a spawn chip's id, or the crew's chair. */
  target: string
  armed: boolean
  action: RelayAction
  /** The condition or consequence this edge carries, in words, or null. */
  label: string | null
  /**
   * True when the wire points at a column at or left of its own: the loop.
   * Drawn along the underside so it cannot be mistaken for a forward wire.
   */
  back: boolean
}

/** The chair: a crew's one terminal, drawn rather than owned by anybody. */
export interface CanvasChairNode {
  id: string
  crewId: string
  /** Lit when this crew is asking for him. */
  lit: boolean
  /** What it is asking, in one sentence, or null when it is not. */
  detail: string | null
  x: number
  y: number
}

export interface CanvasCrewCluster {
  crewId: string
  name: string
  emoji: string | null
  accentColor: string | null
  /** This crew's loop is stopped and asking for him: the frame goes amber. */
  parked: boolean
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasGraph {
  clusters: CanvasCrewCluster[]
  nodes: CanvasSessionNode[]
  spawnNodes: CanvasSpawnNode[]
  chairs: CanvasChairNode[]
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
  /**
   * The calls still open, so a parked crew can say so on the diagram. Optional
   * because every existing caller drew a room that had no hails in it, and a
   * room with none looks exactly as it always did.
   */
  hails: readonly CrewHail[] = [],
): CanvasGraph {
  const clusters: CanvasCrewCluster[] = []
  const nodes: CanvasSessionNode[] = []
  const spawnNodes: CanvasSpawnNode[] = []
  const chairs: CanvasChairNode[] = []
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

    // A crew with at least one conditioned wire is a baton crew, and a baton
    // crew always has a chair: `BATON: marcin` can be declared by any station
    // in it, so the terminal must be on the diagram whether or not anybody has
    // used it yet.
    const batonSources = crewRelays.filter(
      (relay) => relay.conditionToken !== null,
    )
    const hasChair = batonSources.length > 0
    const chairId = chairNodeId(crew.id)
    const openHails = hails.filter((hail) => hail.crewId === crew.id)

    const unitIds = [
      ...group.cards.map((card) => card.session.id),
      ...spawnRelays.map((relay) => spawnNodeId(relay.id)),
      ...(hasChair ? [chairId] : []),
    ]
    // Every station that can declare a route can declare the reserved one, so
    // each gets one drawn arrow to the chair. Deduped: two conditioned wires
    // leaving one station are still one way of reaching him.
    const terminalSourceIds = hasChair
      ? [...new Set(batonSources.map((relay) => relay.sourceSessionId))].filter(
          (sessionId) => drawnSessions.has(sessionId),
        )
      : []

    const wires: FlowWire[] = [
      ...hailRelays.map((relay) => ({
        from: relay.sourceSessionId,
        to: relay.targetSessionId as string,
      })),
      ...spawnRelays.map((relay) => ({
        from: relay.sourceSessionId,
        to: spawnNodeId(relay.id),
      })),
      // The chair is laid out by the same walk as everything else, so it lands
      // to the right of the stations that can reach it rather than in a corner
      // somebody has to hunt for.
      ...terminalSourceIds.map((sessionId) => ({
        from: sessionId,
        to: chairId,
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

    if (hasChair) {
      chairs.push({
        id: chairId,
        crewId: crew.id,
        lit: openHails.length > 0,
        // The newest call is the one the chair speaks for; the rest are in the
        // crew's own list. A node that tried to say four things says none.
        detail: openHails[0]?.detail ?? null,
        ...place(chairId),
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
        kind: 'relay',
        relayId: relay.id,
        crewId: crew.id,
        source: relay.sourceSessionId,
        target,
        armed: relay.armed,
        action: relay.action,
        // The condition IS the label: one wire, one arrow, one route. A
        // diagram that showed the wires but not what they wait for would make
        // every conditioned crew look like it fires on everything.
        label: relay.conditionToken,
        back: targetColumn <= sourceColumn,
      })
    }

    for (const sessionId of terminalSourceIds) {
      const sourceColumn = columns.get(sessionId) ?? 0
      const targetColumn = columns.get(chairId) ?? 0
      edges.push({
        id: `terminal:${crew.id}:${sessionId}`,
        kind: 'terminal',
        relayId: null,
        crewId: crew.id,
        source: sessionId,
        target: chairId,
        // A terminal route is always live: it is the one hand-off no switch
        // can disarm, which is precisely why it is the safe default.
        armed: true,
        action: 'hail',
        label: TERMINAL_EDGE_LABEL,
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
      parked: openHails.length > 0,
      x: 0,
      y: clusterTop,
      width,
      height,
    })

    // ONE dashed edge for all three safety nets, from the frame rather than
    // from any station: unrouted, the round cap and a stall are things that
    // happen to the CREW, and three separate arrows out of three separate
    // sessions would draw a machine nobody built.
    if (hasChair) {
      edges.push({
        id: `safety:${crew.id}`,
        kind: 'safety',
        relayId: null,
        crewId: crew.id,
        source: `crew:${crew.id}`,
        target: chairId,
        armed: true,
        action: 'hail',
        label: SAFETY_EDGE_LABEL,
        back: false,
      })
    }

    clusterTop += height + CLUSTER_GAP
  }

  return { clusters, nodes, spawnNodes, chairs, edges }
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
