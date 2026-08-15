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
  pulseWireColor,
  pulseWireWidth,
  resolveWireColor,
} from '@/features/mission-control'
import type {
  SessionCard,
  SessionCrewGroup,
  WirePulse,
} from '@/features/mission-control'
import { useSessionRelayStore } from '@/entities/session-relay'
import { CanvasCrewCluster } from './canvas-crew-cluster.presentational'
import { CanvasSessionNode } from './canvas-session-node.presentational'
import { CanvasSpawnNode } from './canvas-spawn-node.presentational'
import { CanvasWirePopover } from './canvas-wire-popover.presentational'
import { CANVAS_HANDLE } from './session-canvas.types'

import '@xyflow/react/dist/style.css'

/**
 * Defined once at module scope. React Flow warns loudly and remounts every node
 * if this object changes identity between renders.
 */
const NODE_TYPES = {
  crewCluster: CanvasCrewCluster,
  session: CanvasSessionNode,
  spawn: CanvasSpawnNode,
}

/** Matches the popover's own `w-80`, plus room to breathe at the edges. */
const POPOVER_WIDTH = 320
const POPOVER_MAX_HEIGHT = 260
const POPOVER_EDGE_GAP = 8

/** The popover is a glance; the crew's trail is where the full ledger lives. */
const POPOVER_HOP_LIMIT = 5

function clamp(
  value: number,
  gap: number,
  extent: number | undefined,
  size: number,
): number {
  if (!extent) return value
  return Math.max(gap, Math.min(value, extent - size - gap))
}

interface SessionCanvasProps {
  groups: readonly SessionCrewGroup[]
  onOpen: (card: SessionCard) => void
}

/**
 * The room drawn as its flows: crews as boxes, sessions as nodes inside them.
 *
 * Read-only by ruling. Panning and zooming are how you read a big diagram, so
 * they are on; dragging a node is off, because positions are computed from the
 * data rather than stored, and a node that sprang back to its computed spot the
 * moment anything else changed would feel broken rather than fixed. Positions
 * arrive when authoring does.
 */
export const SessionCanvas: FC<SessionCanvasProps> = ({ groups, onOpen }) => {
  // Subscribed to the stable list and narrowed below: selecting inside the
  // subscription hands zustand a fresh array every render and spins it.
  const relays = useSessionRelayStore((state) => state.relays)
  const hopsByCrewId = useSessionRelayStore((state) => state.hopsByCrewId)
  const loadHops = useSessionRelayStore((state) => state.loadHops)
  const canvasRef = useRef<HTMLDivElement>(null)

  const graph = useMemo(
    () => buildCanvasGraph(groups, relays),
    [groups, relays],
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
      graph.clusters.flatMap((cluster) => hopsByCrewId[cluster.crewId] ?? []),
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
      data: { card: node.card, onOpen },
      width: CANVAS_NODE_WIDTH,
      height: CANVAS_NODE_HEIGHT,
      draggable: false,
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

    return [...clusterNodes, ...sessionNodes, ...spawnChips]
  }, [graph, onOpen])

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((edge) => {
        const pulse = pulses[edge.relayId]
        const base = resolveWireColor(edge, graph.clusters)
        const color = pulse ? pulseWireColor(pulse.tone, base) : base

        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          // Back wires leave and arrive underneath, so the returning half of a
          // loop cannot hide beneath the wire it answers.
          sourceHandle: edge.back ? CANVAS_HANDLE.loopOut : CANVAS_HANDLE.out,
          targetHandle: edge.back ? CANVAS_HANDLE.loopIn : CANVAS_HANDLE.in,
          type: edge.back ? 'smoothstep' : 'default',
          // A lit wire marches while it carries something, so a hop reads as
          // movement along the wire rather than a colour change in place.
          animated: Boolean(pulse),
          // A disarmed wire is drawn but visibly not live: grey and dashed.
          style: {
            stroke: color,
            strokeWidth: pulse
              ? pulseWireWidth(pulse.tone)
              : edge.armed
                ? 2
                : 1.5,
            strokeDasharray:
              edge.armed || pulse !== undefined ? undefined : '5 4',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 18,
            height: 18,
          },
          focusable: false,
          selectable: false,
          zIndex: 2,
        }
      }),
    [graph, pulses],
  )

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

  const handleEdgeClick = useCallback((event: MouseEvent, edge: Edge) => {
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
  }, [])

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
    <div ref={canvasRef} data-session-canvas className="relative size-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
        // Every gesture that would author something is off: this view reads.
        nodesConnectable={false}
        nodesDraggable={false}
        edgesFocusable={false}
        onEdgeClick={handleEdgeClick}
        onPaneClick={closeWire}
        proOptions={{ hideAttribution: false }}
        className="bg-transparent"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          className="opacity-40"
        />
        <Controls
          showInteractive={false}
          className="!bottom-4 !left-4 !shadow-none"
        />
      </ReactFlow>

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
