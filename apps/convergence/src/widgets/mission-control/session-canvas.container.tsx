import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FC, MouseEvent } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
} from '@xyflow/react'
import type { Edge, Node } from '@xyflow/react'
import { Waypoints } from 'lucide-react'
import {
  CANVAS_CHAIR_NODE_HEIGHT,
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  CANVAS_SPAWN_NODE_HEIGHT,
  EMPTY_CANVAS_MESSAGE,
  WIRE_PULSE_MS,
  buildCanvasGraph,
  buildRelayHopLine,
  buildRelaySentence,
  buildWirePulses,
  collectNewHops,
  crewLocalPosition,
  pulseWireColor,
  pulseWireWidth,
  resolveWireColor,
} from '@/features/mission-control'
import type {
  SessionCard,
  SessionCrewGroup,
  WirePulse,
} from '@/features/mission-control'
import {
  selectHopsForCrew,
  useSessionRelayStore,
} from '@/entities/session-relay'
import { useCrewHailStore } from '@/entities/crew-hail'
import { CanvasChairNode } from './canvas-chair-node.presentational'
import { CanvasRoutedEdge } from './canvas-routed-edge.presentational'
import { CanvasCrewCluster } from './canvas-crew-cluster.presentational'
import { CanvasSessionNode } from './canvas-session-node.presentational'
import { CanvasSpawnNode } from './canvas-spawn-node.presentational'
import { CanvasWirePopover } from './canvas-wire-popover.presentational'
import { CANVAS_THEME_VARS } from './session-canvas.styles'
import { CANVAS_HANDLE } from './session-canvas.types'
import { useCanvasColorMode } from './use-canvas-color-mode'

import '@xyflow/react/dist/style.css'

/**
 * Defined once at module scope. React Flow warns loudly and remounts every node
 * if this object changes identity between renders.
 */
const NODE_TYPES = {
  crewCluster: CanvasCrewCluster,
  session: CanvasSessionNode,
  spawn: CanvasSpawnNode,
  chair: CanvasChairNode,
}

/**
 * Defined once at module scope, for the same reason `NODE_TYPES` is: React
 * Flow remounts every edge if this object changes identity between renders.
 */
const EDGE_TYPES = {
  routed: CanvasRoutedEdge,
}

/** Matches the popover's own `w-80`, plus room to breathe at the edges. */
const POPOVER_WIDTH = 320
const POPOVER_MAX_HEIGHT = 260
const POPOVER_EDGE_GAP = 8

/** The popover is a glance; the crew's trail is where the full ledger lives. */
const POPOVER_HOP_LIMIT = 5

/**
 * How near a handle a release has to land for the drag to take (R10).
 *
 * Generous on purpose: a port you have to hit exactly is a port most people
 * give up on, and the cost of being wrong is an inspector opening on a pair
 * you did not mean — which cancels with Esc and sends nothing.
 */
const CONNECTION_RADIUS = 40

/** The unsaved draft's colour: not the crew's, because it is not a wire yet. */
const DRAFT_EDGE_COLOR = '#38bdf8'

/**
 * What a wire looks like while a run is being replayed on it.
 *
 * Keyed by the history TONE rather than the outcome word, so a word added to
 * the vocabulary lands on a colour somebody already chose instead of on
 * nothing. An unrecognised tone falls to the quiet grey below -- red is for
 * what this build understands to be wrong.
 */
const REPLAY_TONE_COLOR: Record<string, string> = {
  delivered: '#34d399',
  alarm: '#f87171',
  terminal: '#fbbf24',
  held: 'color-mix(in srgb, var(--muted-foreground) 70%, transparent)',
}

/**
 * Fitting leaves room at the edges, so a card at the boundary is not flush
 * against the frame with its route squeezed against the clip.
 */
const FIT_VIEW_OPTIONS = { padding: 0.15 }

/** A wire the selected run never used. */
const REPLAY_QUIET_COLOR =
  'color-mix(in srgb, var(--muted-foreground) 45%, transparent)'

function clamp(
  value: number,
  gap: number,
  extent: number | undefined,
  size: number,
): number {
  if (!extent) return value
  return Math.max(gap, Math.min(value, extent - size - gap))
}

/**
 * Everything the canvas needs to be authored, or nothing at all.
 *
 * One optional object rather than a dozen optional props, so a caller either
 * hands the canvas an authoring surface or does not: a canvas half-wired for
 * drawing is a canvas where some gestures work and the rest fail quietly.
 */
export interface SessionCanvasAuthoring {
  /** The crew the toolbar and panel are about; only its cards can be drawn. */
  crewId: string
  /** A drag between two handles landed, or a Connect-mode pair completed. */
  onConnect: (input: {
    sourceSessionId: string
    targetSessionId: string
  }) => void
  /**
   * A card was dropped, in coordinates relative to its own crew's frame.
   *
   * The canvas converts rather than the caller, because the canvas is the
   * only place that knows where each frame starts: clusters stack down the
   * page, so an absolute y is meaningless the moment a crew is added above.
   */
  onMove: (input: { sessionId: string; x: number; y: number }) => void
  /** True while Connect mode is armed. */
  connecting: boolean
  /** The source half of a Connect-mode pick, or null. */
  connectSourceId: string | null
  /** Picking a card while Connect is armed. */
  onPick: (sessionId: string) => void
  /** A stored connection was clicked: open it in the inspector. */
  onSelectRelay: (relayId: string) => void
  /** The connection the inspector currently holds, or null. */
  selectedRelayId: string | null
  /** A drawn-but-unsaved connection, drawn dashed and blue. */
  draftEdge: { sourceSessionId: string; targetSessionId: string } | null
  /** The footer sentence for Connect mode, or null. */
  hint: string | null
  /**
   * A selected run's outcomes, keyed by relay id, or null when none is.
   *
   * These are TODAY's wires wearing YESTERDAY's outcomes, which is why the
   * banner says so out loud (promise 6): the canvas cannot reconstruct the
   * topology a run had, and pretending otherwise would invent a diagram.
   * Every wire the run did not use reads "No event in this run".
   */
  runHighlight: Map<string, { tone: string; label: string }> | null
  /** "RUN FROM 14:32 · SHOWN ON CURRENT CREW LAYOUT", or null. */
  runBanner: string | null
}

interface SessionCanvasProps {
  groups: readonly SessionCrewGroup[]
  onOpen: (card: SessionCard) => void
  /** Absent on a read-only canvas — the shape every caller had before R10. */
  authoring?: SessionCanvasAuthoring
}

/**
 * The room drawn as its flows: crews as boxes, sessions as nodes inside them.
 *
 * Authorable from R10 (RUN45), and only where a caller hands it an
 * `authoring` surface: without one it is exactly the read-only diagram it has
 * always been. With one, cards drag and remember, edge handles draw, and a
 * click on a stored wire opens it.
 *
 * Nothing here sends a message. Dragging stores a position, drawing opens a
 * draft, clicking a wire opens a panel — the engine is the only thing that
 * ever delivers, and only when a source session actually finishes.
 */
export const SessionCanvas: FC<SessionCanvasProps> = ({
  groups,
  onOpen,
  authoring,
}) => {
  // Subscribed to the stable list and narrowed below: selecting inside the
  // subscription hands zustand a fresh array every render and spins it.
  const relays = useSessionRelayStore((state) => state.relays)
  const hopsByCrewId = useSessionRelayStore((state) => state.hopsByCrewId)
  const loadHops = useSessionRelayStore((state) => state.loadHops)
  const hails = useCrewHailStore((state) => state.hails)
  const acknowledgeCrew = useCrewHailStore((state) => state.acknowledgeCrew)
  const canvasRef = useRef<HTMLDivElement>(null)
  const colorMode = useCanvasColorMode()

  const graph = useMemo(
    () => buildCanvasGraph(groups, relays, hails),
    [groups, relays, hails],
  )

  const crewIds = useMemo(
    () => graph.clusters.map((cluster) => cluster.crewId).join(','),
    [graph],
  )

  /**
   * The canvas loads its own trails.
   *
   * Live hops are only kept for crews that already have one -- the store drops
   * a hop for a crew nobody is watching -- and the crew containers that
   * normally ask are not mounted in this view. Without this the wires would
   * never light.
   */
  useEffect(() => {
    for (const crewId of crewIds.split(',').filter(Boolean)) {
      void loadHops(crewId)
    }
  }, [crewIds, loadHops])

  const hops = useMemo(
    () =>
      graph.clusters.flatMap((cluster) =>
        selectHopsForCrew({ hopsByCrewId }, cluster.crewId),
      ),
    [graph, hopsByCrewId],
  )

  const [pulses, setPulses] = useState<Record<string, WirePulse>>({})
  const seenHopIds = useRef<Set<string> | null>(null)

  useEffect(() => {
    // The first look is memory, not electricity: whatever the ledger already
    // held when this canvas opened is history, and history does not flash.
    if (seenHopIds.current === null) {
      seenHopIds.current = new Set(hops.map((hop) => hop.id))
      return
    }

    const fresh = collectNewHops(hops, seenHopIds.current)
    if (fresh.length === 0) return
    for (const hop of fresh) seenHopIds.current.add(hop.id)

    const lit = buildWirePulses(fresh)
    setPulses((current) => {
      const next = { ...current }
      for (const pulse of lit) next[pulse.relayId] = pulse
      return next
    })

    const timer = setTimeout(() => {
      setPulses((current) => {
        const next = { ...current }
        for (const pulse of lit) {
          // Only clear the pulse we lit: a wire that fired again while this
          // one was fading keeps its newer flash for the full duration.
          if (next[pulse.relayId]?.hopId === pulse.hopId) {
            delete next[pulse.relayId]
          }
        }
        return next
      })
    }, WIRE_PULSE_MS)

    return () => clearTimeout(timer)
  }, [hops])

  /**
   * Who is on the canvas, as one string.
   *
   * Remounting the flow is how `fitView` is re-run, and it must happen when
   * the CAST changes and not when a position does: re-fitting mid-drag would
   * move the ground under the pointer.
   */
  const castKey = useMemo(
    () =>
      [
        ...graph.nodes.map((node) => node.id),
        ...graph.spawnNodes.map((node) => node.id),
        ...graph.chairs.map((chair) => chair.id),
      ]
        .sort()
        .join(','),
    [graph],
  )

  const nodes = useMemo<Node[]>(() => {
    // Every size is declared rather than measured. The layout already knows how
    // big each node is, so telling React Flow up front lets it route wires and
    // fit the view on the first paint instead of after a measuring pass.
    const clusterNodes: Node[] = graph.clusters.map((cluster) => ({
      id: `crew:${cluster.crewId}`,
      type: 'crewCluster',
      position: { x: cluster.x, y: cluster.y },
      data: { ...cluster },
      width: cluster.width,
      height: cluster.height,
      draggable: false,
      selectable: false,
      // Below the sessions it contains.
      zIndex: 0,
    }))

    const sessionNodes: Node[] = graph.nodes.map((node) => ({
      id: node.id,
      type: 'session',
      position: { x: node.x, y: node.y },
      data: {
        card: node.card,
        crewId: node.crewId,
        onOpen,
        // Only the crew the panel is about can be authored. A canvas holding
        // three crews would otherwise offer ports on all of them and let
        // somebody draw a wire between two crews, which is not a thing a
        // relay can be: a wire belongs to one crew.
        authoring: authoring?.crewId === node.crewId,
        connecting:
          Boolean(authoring?.connecting) && authoring?.crewId === node.crewId,
        connectSource: authoring?.connectSourceId === node.id,
        onPick: authoring?.onPick,
      },
      width: CANVAS_NODE_WIDTH,
      height: CANVAS_NODE_HEIGHT,
      draggable: authoring?.crewId === node.crewId,
      zIndex: 1,
    }))

    const spawnChips: Node[] = graph.spawnNodes.map((node) => ({
      id: node.id,
      type: 'spawn',
      position: { x: node.x, y: node.y },
      data: { ...node },
      width: CANVAS_NODE_WIDTH,
      height: CANVAS_SPAWN_NODE_HEIGHT,
      draggable: false,
      selectable: false,
      zIndex: 1,
    }))

    const chairNodes: Node[] = graph.chairs.map((chair) => ({
      id: chair.id,
      type: 'chair',
      position: { x: chair.x, y: chair.y },
      data: {
        ...chair,
        onAcknowledge: (crewId: string) => {
          void acknowledgeCrew(crewId)
        },
      },
      width: CANVAS_NODE_WIDTH,
      height: CANVAS_CHAIR_NODE_HEIGHT,
      draggable: false,
      selectable: false,
      zIndex: 1,
    }))

    return [...clusterNodes, ...sessionNodes, ...spawnChips, ...chairNodes]
  }, [graph, onOpen, acknowledgeCrew, authoring])

  const edges = useMemo<Edge[]>(() => {
    const stored = graph.edges.map((edge) => {
      // Only a stored wire can pulse: a hop names the relay it fired on, and
      // the drawn consequences have no relay to be named by.
      const pulse = edge.relayId === null ? undefined : pulses[edge.relayId]
      const base = resolveWireColor(edge, graph.clusters)
      const color = pulse ? pulseWireColor(pulse.tone, base) : base

      // A safety net is a consequence, not a wire somebody drew, so it is
      // drawn as one: dashed, dim, never pulsing, and unopenable.
      const isSafety = edge.kind === 'safety'
      // The wire the inspector holds reads as selected, so "which one am I
      // editing" is answerable on the diagram rather than only in the panel.
      const selected = authoring?.selectedRelayId === edge.relayId
      // While a run is selected the diagram is about THAT run: the wires it
      // used wear its outcomes and everything else fades to "nothing happened
      // here", so the picture cannot be misread as current traffic.
      const replay =
        edge.relayId === null
          ? undefined
          : authoring?.runHighlight?.get(edge.relayId)
      const replaying = Boolean(authoring?.runHighlight)

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: replaying
          ? (replay?.label ?? 'No event in this run')
          : (edge.label ?? undefined),
        labelShowBg: true,
        // The ports React Flow measures from. Which SIDE the drawn route
        // actually uses is chosen inside the edge component from where the two
        // cards are (R11) — cards move now, so a layout column stopped
        // describing the picture the moment somebody dragged one. These stay
        // as the attachment React Flow reports, and the route overrides the
        // geometry between them.
        sourceHandle: CANVAS_HANDLE.out,
        targetHandle: CANVAS_HANDLE.in,
        type: 'routed',
        // A lit wire marches while it carries something, so a hop reads as
        // movement along the wire rather than a colour change in place.
        animated: Boolean(pulse),
        // A disarmed wire is drawn but visibly not live: grey and dashed.
        style: {
          stroke: replaying
            ? (REPLAY_TONE_COLOR[replay?.tone ?? ''] ?? REPLAY_QUIET_COLOR)
            : selected
              ? DRAFT_EDGE_COLOR
              : color,
          strokeWidth: pulse
            ? pulseWireWidth(pulse.tone)
            : selected
              ? 2.5
              : isSafety
                ? 1.5
                : edge.armed
                  ? 2
                  : 1.5,
          // Dashed for two different reasons that read the same on purpose:
          // a switched-off wire and a safety net are both "this is not the
          // ordinary path".
          strokeDasharray:
            (replaying && !replay) ||
            isSafety ||
            (!edge.armed && pulse === undefined)
              ? '5 4'
              : undefined,
          opacity: isSafety ? 0.55 : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: replaying
            ? (REPLAY_TONE_COLOR[replay?.tone ?? ''] ?? REPLAY_QUIET_COLOR)
            : selected
              ? DRAFT_EDGE_COLOR
              : color,
          width: 18,
          height: 18,
        },
        focusable: false,
        selectable: false,
        zIndex: 2,
      }
    })

    // The unsaved draft (frame 02): dashed, blue, labelled, and NOT a row.
    // Drawn from the same graph so it lands on the same handles as the wire
    // it will become, which is what makes "save" look like nothing moved.
    if (!authoring?.draftEdge) return stored
    return [
      ...stored,
      {
        id: 'draft:new-connection',
        source: authoring.draftEdge.sourceSessionId,
        target: authoring.draftEdge.targetSessionId,
        label: 'New connection',
        labelShowBg: true,
        sourceHandle: CANVAS_HANDLE.out,
        targetHandle: CANVAS_HANDLE.in,
        // The draft routes like any other wire, so saving it looks like
        // nothing moved.
        type: 'routed',
        animated: false,
        style: {
          stroke: DRAFT_EDGE_COLOR,
          strokeWidth: 2,
          strokeDasharray: '5 4',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: DRAFT_EDGE_COLOR,
          width: 18,
          height: 18,
        },
        focusable: false,
        selectable: false,
        zIndex: 3,
      },
    ]
  }, [graph, pulses, authoring])

  /**
   * Every session the canvas can name, including ones a wire points at that the
   * filter removed -- a popover that said "a session that is gone" about a
   * session sitting one crew over would be lying about why it cannot show it.
   */
  const resolveName = useCallback(
    (sessionId: string): string | null =>
      groups
        .flatMap((group) => group.cards)
        .find((card) => card.session.id === sessionId)?.session.name ?? null,
    [groups],
  )

  const [openWire, setOpenWire] = useState<{
    relayId: string
    x: number
    y: number
  } | null>(null)

  const relayEdgeIds = useMemo(
    () =>
      new Set(
        graph.edges
          .filter((edge) => edge.kind === 'relay')
          .map((edge) => edge.id),
      ),
    [graph],
  )

  /**
   * A drag between two handles landed.
   *
   * It opens a DRAFT and nothing else: no row is written, no message is sent,
   * and Esc or Cancel leaves the canvas exactly as it was. Saving on connect
   * would make an accidental drag a stored wire, and a stored wire that is
   * armed is one settle away from spending somebody's provider quota.
   */
  const handleConnect = useCallback(
    (connection: { source: string | null; target: string | null }) => {
      if (!authoring) return
      const { source, target } = connection
      if (!source || !target || source === target) return
      authoring.onConnect({
        sourceSessionId: source,
        targetSessionId: target,
      })
    },
    [authoring],
  )

  /**
   * A card was dropped. The position stored is the node's own, so what is
   * remembered is where it was left rather than where the pointer was.
   */
  const handleNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      if (!authoring) return
      const cluster = graph.clusters.find(
        (entry) => entry.crewId === authoring.crewId,
      )
      // No frame, no arrangement to store. A crew whose cluster is not on the
      // canvas cannot have had a card dragged inside it, so this is a guard
      // against a stale graph rather than an expected path.
      if (!cluster) return
      authoring.onMove({
        sessionId: node.id,
        ...crewLocalPosition(
          { x: node.position.x, y: node.position.y },
          cluster,
        ),
      })
    },
    [authoring, graph],
  )

  const handleEdgeClick = useCallback(
    (event: MouseEvent, edge: Edge) => {
      // Only a stored wire has anything to open. A terminal route and the safety
      // net are drawn consequences with no row behind them, and a popover that
      // hunted for a relay by their id would find nothing and open blank.
      if (!relayEdgeIds.has(edge.id)) return
      // With a panel to open into, a wire click OPENS it: the popover was the
      // read-only view's only way to say anything about a wire, and two
      // surfaces answering the same click is one surface too many.
      if (authoring) {
        authoring.onSelectRelay(edge.id)
        return
      }
      const bounds = canvasRef.current?.getBoundingClientRect()
      const localX = event.clientX - (bounds?.left ?? 0)
      const localY = event.clientY - (bounds?.top ?? 0)

      // Kept inside the canvas: a popover opened on a wire near the right edge
      // would otherwise hang off the side where it cannot be read.
      setOpenWire({
        relayId: edge.id,
        x: clamp(localX, POPOVER_EDGE_GAP, bounds?.width, POPOVER_WIDTH),
        y: clamp(localY, POPOVER_EDGE_GAP, bounds?.height, POPOVER_MAX_HEIGHT),
      })
    },
    [relayEdgeIds, authoring],
  )

  const closeWire = useCallback(() => setOpenWire(null), [])

  const openRelay = openWire
    ? relays.find((relay) => relay.id === openWire.relayId)
    : undefined

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Waypoints className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">Nothing wired to draw yet</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {EMPTY_CANVAS_MESSAGE}
        </p>
      </div>
    )
  }

  return (
    <div
      ref={canvasRef}
      data-session-canvas
      data-canvas-color-mode={colorMode}
      style={CANVAS_THEME_VARS}
      // Clipped (R11): a route near the edge of a rearranged canvas would
      // otherwise be painted across the panel beside it and the app chrome
      // above it. The diagram lives inside its own frame.
      className="relative size-full overflow-hidden"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        // Follows the titlebar toggle live, rather than assuming the room is
        // dark: the library picks light by default and looked pasted on.
        colorMode={colorMode}
        fitView
        // Re-fits when the CAST changes, so a conversation just added to the
        // crew is on screen rather than somewhere off the edge the person has
        // to hunt for. Keyed by the node ids rather than by the nodes, so a
        // drag — which changes positions, not membership — does not yank the
        // viewport out from under the hand doing the dragging.
        fitViewOptions={FIT_VIEW_OPTIONS}
        key={castKey}
        minZoom={0.2}
        maxZoom={1.5}
        // Authoring is granted by the caller, never assumed: without an
        // `authoring` surface this is the read-only diagram it always was.
        nodesConnectable={Boolean(authoring)}
        nodesDraggable={Boolean(authoring)}
        connectionRadius={CONNECTION_RADIUS}
        edgesFocusable={false}
        onConnect={handleConnect}
        onNodeDragStop={handleNodeDragStop}
        onEdgeClick={handleEdgeClick}
        onPaneClick={closeWire}
        proOptions={{ hideAttribution: false }}
        className="bg-transparent"
      >
        {/* The dot colour is themed by CANVAS_THEME_VARS, so no opacity is
            layered on top -- in light mode that made the grid disappear. */}
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls
          showInteractive={false}
          className="!bottom-4 !left-4 overflow-hidden !rounded-md !border !border-border !shadow-none"
        />
      </ReactFlow>

      {authoring?.runBanner ? (
        <p
          data-run-banner
          className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-md border border-white/10 bg-background/90 px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground shadow-sm"
        >
          {authoring.runBanner}
        </p>
      ) : null}

      {authoring?.hint ? (
        <p
          data-connect-hint
          role="status"
          className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-fit rounded-md border border-white/10 bg-background/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm"
        >
          {authoring.hint}
        </p>
      ) : null}

      {openWire && openRelay ? (
        <div
          style={{ left: openWire.x, top: openWire.y }}
          className="absolute z-10"
        >
          <CanvasWirePopover
            sentence={buildRelaySentence(openRelay, resolveName)}
            armed={openRelay.armed}
            hopLines={hops
              .filter((hop) => hop.relayId === openRelay.id)
              .slice(0, POPOVER_HOP_LIMIT)
              .map((hop) => buildRelayHopLine(hop, resolveName, new Date()))}
            onClose={closeWire}
          />
        </div>
      ) : null}
    </div>
  )
}
