import { describe, expect, it } from 'vitest'
import type { SessionRelay } from '@/entities/session-relay'
import type { SessionCrew } from '@/entities/session-crew'
import {
  ARMED_WIRE_FALLBACK_COLOR,
  assignFlowColumns,
  buildCanvasGraph,
  CANVAS_NODE_WIDTH,
  DISARMED_WIRE_COLOR,
  formatSpawnNodeSpec,
  resolveWireColor,
  spawnNodeId,
} from './canvas-graph.pure'
import type { SessionCrewGroup } from './session-crew-groups.pure'
import type { SessionCard } from './mission-control.types'

function card(id: string): SessionCard {
  return {
    session: {
      id,
      name: id,
      status: 'completed',
      attention: 'none',
    } as SessionCard['session'],
    projectName: 'convergence',
    providerLabel: 'Codex',
    activityLabel: 'idle',
    crews: [],
    searchText: id,
  }
}

function crew(id: string, overrides: Partial<SessionCrew> = {}): SessionCrew {
  return {
    id,
    name: `Crew ${id}`,
    emoji: null,
    accentColor: null,
    position: 0,
    sessionIds: [],
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  } as SessionCrew
}

function wire(
  source: string,
  target: string,
  crewId = 'c1',
  armed = true,
): SessionRelay {
  return {
    id: `${source}->${target}`,
    crewId,
    sourceSessionId: source,
    trigger: 'settled',
    action: 'hail',
    targetSessionId: target,
    spawnSpec: null,
    armed,
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  }
}

function spawnWire(
  source: string,
  overrides: Partial<SessionRelay> = {},
): SessionRelay {
  return {
    id: `${source}-spawns`,
    crewId: 'c1',
    sourceSessionId: source,
    trigger: 'settled',
    action: 'spawn',
    targetSessionId: null,
    spawnSpec: {
      projectId: 'p1',
      providerId: 'codex',
      model: 'gpt-5.6',
      effort: null,
      name: 'Reviewer',
    },
    armed: true,
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  }
}

/** The column walker takes plain units now; these keep the tests readable. */
function ids(...values: string[]): string[] {
  return values
}

function link(from: string, to: string): { from: string; to: string } {
  return { from, to }
}

function group(crewValue: SessionCrew | null, ids: string[]): SessionCrewGroup {
  return {
    crew: crewValue,
    cards: ids.map(card),
    memberCount: ids.length,
  }
}

describe('assignFlowColumns', () => {
  it('walks a chain left to right', () => {
    const columns = assignFlowColumns(ids('a', 'b', 'c'), [
      link('a', 'b'),
      link('b', 'c'),
    ])

    expect(columns.get('a')).toBe(0)
    expect(columns.get('b')).toBe(1)
    expect(columns.get('c')).toBe(2)
  })

  it('puts unwired sessions at the left edge', () => {
    const columns = assignFlowColumns(ids('a', 'b'), [])

    expect(columns.get('a')).toBe(0)
    expect(columns.get('b')).toBe(0)
  })

  /**
   * The review loop is the whole point of relays, so the layout has to survive
   * one. A naive longest-path walk would never terminate here.
   */
  it('terminates on a loop and never pushes a session rightward twice', () => {
    const columns = assignFlowColumns(ids('a', 'b'), [
      link('a', 'b'),
      link('b', 'a'),
    ])

    expect(columns.get('a')).toBe(0)
    expect(columns.get('b')).toBe(1)
  })

  it('still draws a crew that is nothing but a closed loop', () => {
    // Every session has an incoming wire, so there is no natural root.
    const columns = assignFlowColumns(ids('a', 'b', 'c'), [
      link('a', 'b'),
      link('b', 'c'),
      link('c', 'a'),
    ])

    expect(columns.get('a')).toBe(0)
    expect(columns.get('b')).toBe(1)
    expect(columns.get('c')).toBe(2)
  })

  it('ignores wires whose far end is not on the canvas', () => {
    const columns = assignFlowColumns(ids('a', 'b'), [
      link('a', 'gone'),
      link('a', 'b'),
    ])

    expect(columns.get('a')).toBe(0)
    expect(columns.get('b')).toBe(1)
  })

  it('is stable: the same room always draws the same picture', () => {
    const units = ids('a', 'b', 'c')
    const wires = [link('a', 'b'), link('a', 'c')]

    expect([...assignFlowColumns(units, wires)]).toEqual([
      ...assignFlowColumns(units, wires),
    ])
  })
})

describe('buildCanvasGraph', () => {
  it('places a chain in columns and boxes the crew around it', () => {
    const graph = buildCanvasGraph(
      [group(crew('c1', { name: 'Review loop', emoji: '🛠' }), ['a', 'b'])],
      [wire('a', 'b')],
    )

    expect(graph.nodes.map((node) => node.id)).toEqual(['a', 'b'])
    expect(graph.nodes[1].x).toBeGreaterThan(
      graph.nodes[0].x + CANVAS_NODE_WIDTH,
    )
    expect(graph.nodes[0].y).toBe(graph.nodes[1].y)

    expect(graph.clusters).toHaveLength(1)
    expect(graph.clusters[0]).toMatchObject({
      crewId: 'c1',
      name: 'Review loop',
      emoji: '🛠',
    })
  })

  it('stacks sessions sharing a column and keeps them inside the cluster', () => {
    const graph = buildCanvasGraph(
      [group(crew('c1'), ['a', 'b', 'c'])],
      [wire('a', 'b'), wire('a', 'c')],
    )

    const [a, b, c] = graph.nodes
    expect(b.x).toBe(c.x)
    expect(c.y).toBeGreaterThan(b.y)

    const cluster = graph.clusters[0]
    for (const node of [a, b, c]) {
      expect(node.x).toBeGreaterThanOrEqual(cluster.x)
      expect(node.y).toBeGreaterThanOrEqual(cluster.y)
      expect(node.x + CANVAS_NODE_WIDTH).toBeLessThanOrEqual(
        cluster.x + cluster.width,
      )
    }
  })

  it('stacks crews without overlapping them', () => {
    const graph = buildCanvasGraph(
      [group(crew('c1'), ['a']), group(crew('c2'), ['b'])],
      [],
    )

    const [first, second] = graph.clusters
    expect(second.y).toBeGreaterThan(first.y + first.height)
  })

  it('leaves sessions in no crew off the canvas entirely', () => {
    const graph = buildCanvasGraph(
      [group(crew('c1'), ['a']), group(null, ['loose'])],
      [],
    )

    expect(graph.nodes.map((node) => node.id)).toEqual(['a'])
    expect(graph.clusters).toHaveLength(1)
  })

  it('drops a crew the filter emptied rather than drawing a blank box', () => {
    const graph = buildCanvasGraph([group(crew('c1'), [])], [])

    expect(graph.clusters).toEqual([])
    expect(graph.nodes).toEqual([])
  })

  it('keeps one crew’s wires from shaping another crew', () => {
    // Same session ids in both crews would collide if crewId were ignored.
    const graph = buildCanvasGraph(
      [group(crew('c1'), ['a', 'b']), group(crew('c2'), ['a', 'b'])],
      [wire('a', 'b', 'c1')],
    )

    const [c1a, c1b, c2a, c2b] = graph.nodes
    expect(c1b.x).toBeGreaterThan(c1a.x)
    // c2 has no wires of its own, so both of its sessions sit at the left edge.
    expect(c2b.x).toBe(c2a.x)
  })
})

describe('buildCanvasGraph — wires', () => {
  it('draws a hail as one edge from source to target', () => {
    const graph = buildCanvasGraph(
      [group(crew('c1'), ['a', 'b'])],
      [wire('a', 'b')],
    )

    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0]).toMatchObject({
      source: 'a',
      target: 'b',
      armed: true,
      action: 'hail',
      back: false,
    })
  })

  it('carries the armed switch onto the wire', () => {
    const graph = buildCanvasGraph(
      [group(crew('c1'), ['a', 'b'])],
      [wire('a', 'b', 'c1', false)],
    )

    expect(graph.edges[0].armed).toBe(false)
  })

  /** The back half of a loop must be drawn differently or it hides underneath. */
  it('marks the returning half of a loop as a back wire', () => {
    const graph = buildCanvasGraph(
      [group(crew('c1'), ['a', 'b'])],
      [wire('a', 'b'), wire('b', 'a')],
    )

    const forward = graph.edges.find((edge) => edge.source === 'a')
    const backward = graph.edges.find((edge) => edge.source === 'b')
    expect(forward?.back).toBe(false)
    expect(backward?.back).toBe(true)
  })

  it('drops a hail whose target the filter removed, keeping the source drawn', () => {
    const graph = buildCanvasGraph(
      [group(crew('c1'), ['a'])],
      [wire('a', 'filtered-out')],
    )

    expect(graph.nodes.map((node) => node.id)).toEqual(['a'])
    expect(graph.edges).toEqual([])
  })

  it('ignores a wire whose source is not drawn at all', () => {
    const graph = buildCanvasGraph(
      [group(crew('c1'), ['b'])],
      [wire('gone', 'b')],
    )

    expect(graph.edges).toEqual([])
  })
})

describe('buildCanvasGraph — spawn chips', () => {
  it('draws the session a spawn wire promises, from the spec', () => {
    const graph = buildCanvasGraph([group(crew('c1'), ['a'])], [spawnWire('a')])

    expect(graph.spawnNodes).toHaveLength(1)
    expect(graph.spawnNodes[0]).toMatchObject({
      relayId: 'a-spawns',
      name: 'Reviewer',
      providerId: 'codex',
      model: 'gpt-5.6',
      armed: true,
    })

    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0]).toMatchObject({
      source: 'a',
      target: spawnNodeId('a-spawns'),
      action: 'spawn',
    })
  })

  it('puts the chip in the column after its source', () => {
    const graph = buildCanvasGraph([group(crew('c1'), ['a'])], [spawnWire('a')])

    expect(graph.spawnNodes[0].x).toBeGreaterThan(
      graph.nodes[0].x + CANVAS_NODE_WIDTH,
    )
  })

  it('widens the crew box to hold the chip it drew', () => {
    const withChip = buildCanvasGraph(
      [group(crew('c1'), ['a'])],
      [spawnWire('a')],
    )
    const without = buildCanvasGraph([group(crew('c1'), ['a'])], [])

    expect(withChip.clusters[0].width).toBeGreaterThan(
      without.clusters[0].width,
    )
    expect(withChip.spawnNodes[0].x + CANVAS_NODE_WIDTH).toBeLessThanOrEqual(
      withChip.clusters[0].x + withChip.clusters[0].width,
    )
  })

  /**
   * A spec written by another build can come back unreadable. The wire is real
   * either way, and a wire that silently vanished would be the worst outcome.
   */
  it('still draws a spawn whose spec could not be read', () => {
    const graph = buildCanvasGraph(
      [group(crew('c1'), ['a'])],
      [spawnWire('a', { spawnSpec: null })],
    )

    expect(graph.spawnNodes[0]).toMatchObject({
      name: 'Unspecified session',
      providerId: null,
    })
    expect(graph.edges).toHaveLength(1)
  })

  it('gives each spawn wire its own chip', () => {
    const graph = buildCanvasGraph(
      [group(crew('c1'), ['a'])],
      [spawnWire('a', { id: 'r1' }), spawnWire('a', { id: 'r2' })],
    )

    expect(graph.spawnNodes.map((node) => node.id)).toEqual([
      spawnNodeId('r1'),
      spawnNodeId('r2'),
    ])
    expect(graph.edges).toHaveLength(2)
  })
})

/**
 * The wire's own look. Tested here rather than through the canvas because
 * React Flow computes edge geometry from measured handle positions, which jsdom
 * has none of -- the drawing itself is Marcin's eyes to judge, but which colour
 * and which dash a wire asks for is decidable, so it is decided here.
 */
describe('resolveWireColor', () => {
  const clusters = [
    { crewId: 'c1', accentColor: '#7c3aed' },
    { crewId: 'c2', accentColor: null },
  ]

  it('lends a crew its accent for live wires', () => {
    expect(resolveWireColor({ armed: true, crewId: 'c1' }, clusters)).toBe(
      '#7c3aed',
    )
  })

  it('falls back to the Flow strip emerald when a crew has no accent', () => {
    expect(resolveWireColor({ armed: true, crewId: 'c2' }, clusters)).toBe(
      ARMED_WIRE_FALLBACK_COLOR,
    )
  })

  it('greys every disarmed wire, accent or not', () => {
    // Otherwise a slate-accented crew's live wires would read as switched off.
    expect(resolveWireColor({ armed: false, crewId: 'c1' }, clusters)).toBe(
      DISARMED_WIRE_COLOR,
    )
    expect(resolveWireColor({ armed: false, crewId: 'c2' }, clusters)).toBe(
      DISARMED_WIRE_COLOR,
    )
  })

  it('does not fail on a wire whose crew is not drawn', () => {
    expect(resolveWireColor({ armed: true, crewId: 'gone' }, clusters)).toBe(
      ARMED_WIRE_FALLBACK_COLOR,
    )
  })

  /**
   * The room has a light mode. A flat white wire is invisible on it, so the
   * disarmed colour has to resolve against the theme rather than assume dark.
   */
  it('gives the disarmed wire a colour that survives both themes', () => {
    expect(DISARMED_WIRE_COLOR).toContain('var(--muted-foreground)')
    expect(DISARMED_WIRE_COLOR).not.toMatch(/#|rgba?\(/)
  })
})

describe('formatSpawnNodeSpec', () => {
  it('names the provider and model it will open', () => {
    expect(formatSpawnNodeSpec({ providerId: 'codex', model: 'gpt-5.6' })).toBe(
      'codex · gpt-5.6',
    )
  })

  it('falls back to the provider alone', () => {
    expect(formatSpawnNodeSpec({ providerId: 'codex', model: null })).toBe(
      'codex',
    )
  })

  it('says so when the spec is unreadable', () => {
    expect(formatSpawnNodeSpec({ providerId: null, model: null })).toBe(
      'spec unreadable',
    )
  })
})
