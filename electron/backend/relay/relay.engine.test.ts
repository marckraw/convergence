import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import type { SessionStatus } from '../provider/provider.types'
import type { SessionSettledEvent } from '../session/session.types'
import { RelayEngine, type RelaySessionGateway } from './relay.engine'
import { MAX_AUTOMATIC_HOPS_PER_FLOW_RUN } from './relay.pure'
import { RelayService } from './relay.service'
import type { RelayHop } from './relay.types'

/**
 * The engine is the one thing in the app that spends provider quota without a
 * human pressing anything, so every test here drives a fake gateway. Nothing
 * in this file may reach a real session, a real provider, or a real process.
 */
interface FakeGateway extends RelaySessionGateway {
  sent: Array<{ sessionId: string; text: string }>
  created: Array<Record<string, unknown>>
  started: Array<{ sessionId: string; text: string }>
}

function createGateway(overrides: {
  lastMessages?: Record<string, string | null>
  statuses?: Record<string, SessionStatus>
  missing?: string[]
  sendMessage?: (sessionId: string, input: { text: string }) => Promise<void>
  create?: () => { id: string }
  start?: (sessionId: string) => Promise<void>
}): FakeGateway {
  const sent: Array<{ sessionId: string; text: string }> = []
  const created: Array<Record<string, unknown>> = []
  const started: Array<{ sessionId: string; text: string }> = []
  const missing = new Set(overrides.missing ?? [])

  return {
    sent,
    created,
    started,
    getById: (sessionId) =>
      missing.has(sessionId)
        ? null
        : {
            id: sessionId,
            status: overrides.statuses?.[sessionId] ?? 'completed',
          },
    getLastAssistantMessageText: (sessionId) =>
      overrides.lastMessages && sessionId in overrides.lastMessages
        ? overrides.lastMessages[sessionId]
        : 'Done. Ready for review.',
    sendMessage: async (sessionId, input) => {
      if (overrides.sendMessage) {
        await overrides.sendMessage(sessionId, input)
      }
      sent.push({ sessionId, text: input.text })
    },
    create: (input) => {
      created.push(input as unknown as Record<string, unknown>)
      return overrides.create ? overrides.create() : { id: 'spawned-1' }
    },
    start: async (sessionId, input) => {
      if (overrides.start) await overrides.start(sessionId)
      started.push({ sessionId, text: input.text })
    },
  }
}

function settled(
  sessionId: string,
  status: SessionSettledEvent['status'] = 'completed',
): SessionSettledEvent {
  return { sessionId, status, settledAt: '2026-08-15T10:00:00.000Z' }
}

describe('RelayEngine', () => {
  let db: Database.Database
  let relays: RelayService
  let hops: RelayHop[]
  let relaysChanged: number
  let crewsChanged: number
  let crewAdditions: Array<{ crewId: string; sessionId: string }>

  beforeEach(() => {
    db = getDatabase()
    relays = new RelayService(db)
    hops = []
    relaysChanged = 0
    crewsChanged = 0
    crewAdditions = []

    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'p1', '/tmp/p1')",
    ).run()
    for (const id of ['s1', 's2', 's3']) {
      db.prepare(
        `INSERT INTO sessions (id, project_id, provider_id, name, working_directory)
         VALUES (?, 'p1', 'codex', ?, '/tmp/p1')`,
      ).run(id, id)
    }
    db.prepare(
      "INSERT INTO session_crews (id, name) VALUES ('c1', 'Review loop')",
    ).run()
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  function createEngine(gateway: RelaySessionGateway): RelayEngine {
    return new RelayEngine({
      relays,
      sessions: gateway,
      crews: {
        addMember: (crewId, sessionId) => {
          crewAdditions.push({ crewId, sessionId })
        },
      },
      onHopAppended: (hop) => hops.push(hop),
      onRelaysChanged: () => {
        relaysChanged += 1
      },
      onCrewsChanged: () => {
        crewsChanged += 1
      },
    })
  }

  function spawnWire(
    source = 's1',
    spec: Partial<{
      projectId: string | null
      providerId: string
      model: string | null
      effort: string | null
      name: string
    }> = {},
  ) {
    return relays.create({
      crewId: 'c1',
      sourceSessionId: source,
      action: 'spawn',
      spawnSpec: {
        projectId: 'p1',
        providerId: 'codex',
        model: 'gpt-5.6',
        effort: null,
        name: 'Reviewer',
        ...spec,
      },
    })
  }

  function wire(
    source = 's1',
    target = 's2',
    armed = true,
  ): ReturnType<RelayService['create']> {
    return relays.create({
      crewId: 'c1',
      sourceSessionId: source,
      action: 'hail',
      targetSessionId: target,
      armed,
    })
  }

  it('carries the last assistant message to the target and records a delivery', async () => {
    const relay = wire()
    const gateway = createGateway({
      lastMessages: { s1: 'Review this branch, please.' },
      statuses: { s2: 'completed' },
    })

    await createEngine(gateway).handleSettle(settled('s1'))

    expect(gateway.sent).toEqual([
      { sessionId: 's2', text: 'Review this branch, please.' },
    ])
    expect(relays.listHops('c1')).toHaveLength(1)
    expect(relays.listHops('c1')[0]).toMatchObject({
      relayId: relay.id,
      sourceSessionId: 's1',
      targetSessionId: 's2',
      triggerStatus: 'completed',
      outcome: 'delivered',
      payloadPreview: 'Review this branch, please.',
      error: null,
    })
    expect(hops).toHaveLength(1)
  })

  it('records a queue when the target was already running', async () => {
    wire()
    const gateway = createGateway({ statuses: { s2: 'running' } })

    await createEngine(gateway).handleSettle(settled('s1'))

    expect(gateway.sent).toHaveLength(1)
    expect(relays.listHops('c1')[0].outcome).toBe('queued')
  })

  it('does nothing at all when no wire leaves the session', async () => {
    const gateway = createGateway({})

    await createEngine(gateway).handleSettle(settled('s3'))

    expect(gateway.sent).toEqual([])
    expect(relays.listHops('c1')).toEqual([])
  })

  it('writes a visible skip instead of firing on a failed settle', async () => {
    wire()
    const gateway = createGateway({})

    await createEngine(gateway).handleSettle(settled('s1', 'failed'))

    expect(gateway.sent).toEqual([])
    expect(relays.listHops('c1')[0]).toMatchObject({
      outcome: 'skipped-failed',
      triggerStatus: 'failed',
    })
    expect(relays.listHops('c1')[0].error).toContain('failed')
  })

  it('writes a visible skip for a disarmed wire rather than staying silent', async () => {
    wire('s1', 's2', false)
    const gateway = createGateway({})

    await createEngine(gateway).handleSettle(settled('s1'))

    expect(gateway.sent).toEqual([])
    expect(relays.listHops('c1')[0].outcome).toBe('skipped-disarmed')
  })

  it('records an error when the session finished with nothing to carry', async () => {
    wire()
    const gateway = createGateway({ lastMessages: { s1: null } })

    await createEngine(gateway).handleSettle(settled('s1'))

    expect(gateway.sent).toEqual([])
    expect(relays.listHops('c1')[0]).toMatchObject({
      outcome: 'error',
      payloadPreview: null,
    })
    expect(relays.listHops('c1')[0].error).toContain('without an assistant')
  })

  it('records an error when the target session is gone', async () => {
    wire()
    const gateway = createGateway({ missing: ['s2'] })

    await createEngine(gateway).handleSettle(settled('s1'))

    expect(gateway.sent).toEqual([])
    expect(relays.listHops('c1')[0]).toMatchObject({
      outcome: 'error',
      targetSessionId: 's2',
    })
    expect(relays.listHops('c1')[0].error).toContain('no longer exists')
  })

  it('records the provider error text when the send is refused', async () => {
    wire()
    const gateway = createGateway({
      sendMessage: async () => {
        throw new Error('Session uses the shell provider')
      },
    })

    await createEngine(gateway).handleSettle(settled('s1'))

    expect(relays.listHops('c1')[0]).toMatchObject({ outcome: 'error' })
    expect(relays.listHops('c1')[0].error).toBe(
      'Session uses the shell provider',
    )
  })

  it('fires every wire leaving the session and one failure does not stop the rest', async () => {
    wire('s1', 's2')
    wire('s1', 's3')
    const gateway = createGateway({
      sendMessage: async (sessionId) => {
        if (sessionId === 's2') throw new Error('nope')
      },
    })

    await createEngine(gateway).handleSettle(settled('s1'))

    expect(gateway.sent.map((s) => s.sessionId)).toEqual(['s3'])
    const outcomes = relays
      .listHops('c1')
      .map((hop) => hop.outcome)
      .sort()
    expect(outcomes).toEqual(['delivered', 'error'])
  })

  it('puts every wire off one settle on the same flow run', async () => {
    wire('s1', 's2')
    wire('s1', 's3')

    await createEngine(createGateway({})).handleSettle(settled('s1'))

    const runIds = new Set(relays.listHops('c1').map((hop) => hop.flowRunId))
    expect(runIds.size).toBe(1)
  })

  it('keeps a loop on one flow run as it goes round', async () => {
    wire('s1', 's2')
    wire('s2', 's1')
    const engine = createEngine(createGateway({}))

    await engine.handleSettle(settled('s1'))
    await engine.handleSettle(settled('s2'))

    const trail = relays.listHops('c1')
    expect(trail).toHaveLength(2)
    expect(trail[0].flowRunId).toBe(trail[1].flowRunId)
  })

  it('starts a new flow run for a session nothing relayed into', async () => {
    wire('s1', 's2')
    wire('s3', 's2')
    const engine = createEngine(createGateway({}))

    await engine.handleSettle(settled('s1'))
    await engine.handleSettle(settled('s3'))

    const runIds = new Set(relays.listHops('c1').map((hop) => hop.flowRunId))
    expect(runIds.size).toBe(2)
  })

  it('disarms loudly when a flow run burns its budget', async () => {
    // s2 is the far end of a hot run: twenty hops have already landed in it,
    // and its own wire back is what tries to fire next.
    const relay = wire('s2', 's1')
    for (let index = 0; index < MAX_AUTOMATIC_HOPS_PER_FLOW_RUN; index += 1) {
      relays.appendHop({
        relayId: relay.id,
        crewId: 'c1',
        flowRunId: 'run-hot',
        sourceSessionId: 's1',
        targetSessionId: 's2',
        triggerStatus: 'completed',
        outcome: 'delivered',
      })
    }
    const gateway = createGateway({})

    await createEngine(gateway).handleSettle(settled('s2'))

    expect(gateway.sent).toEqual([])
    const newest = relays.listHops('c1')[0]
    expect(newest.outcome).toBe('skipped-budget')
    expect(newest.flowRunId).toBe('run-hot')
    expect(newest.error).toContain(String(MAX_AUTOMATIC_HOPS_PER_FLOW_RUN))
    expect(relays.getById(relay.id)!.armed).toBe(false)
    expect(relaysChanged).toBe(1)
  })

  it('lets a loop run right up to the budget before tripping', async () => {
    wire('s1', 's2')
    wire('s2', 's1')
    const engine = createEngine(createGateway({}))

    // Ping-pong until the guard trips, with a hard stop well above the budget
    // so a broken guard fails this test instead of hanging the suite.
    let next = 's1'
    for (let index = 0; index < MAX_AUTOMATIC_HOPS_PER_FLOW_RUN * 2; index++) {
      await engine.handleSettle(settled(next))
      next = next === 's1' ? 's2' : 's1'
    }

    const trail = relays.listHops('c1', 1000)
    const budgeted = trail.filter(
      (hop) => hop.outcome === 'delivered' || hop.outcome === 'queued',
    )
    expect(budgeted).toHaveLength(MAX_AUTOMATIC_HOPS_PER_FLOW_RUN)
    expect(trail.some((hop) => hop.outcome === 'skipped-budget')).toBe(true)
    expect(relays.list().every((relay) => !relay.armed)).toBe(true)
  })

  describe('the spawn action', () => {
    it('opens a session on the spec and starts it on the payload', async () => {
      const relay = spawnWire()
      const gateway = createGateway({
        lastMessages: { s1: 'Review this branch, please.' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.created).toEqual([
        {
          contextKind: 'project',
          projectId: 'p1',
          workspaceId: null,
          providerId: 'codex',
          model: 'gpt-5.6',
          effort: null,
          name: 'Reviewer',
        },
      ])
      expect(gateway.started).toEqual([
        { sessionId: 'spawned-1', text: 'Review this branch, please.' },
      ])
      expect(gateway.sent).toEqual([])

      const hop = relays.listHops('c1')[0]
      expect(hop).toMatchObject({
        relayId: relay.id,
        outcome: 'spawned',
        spawnedSessionId: 'spawned-1',
        targetSessionId: null,
        payloadPreview: 'Review this branch, please.',
        error: null,
      })
    })

    it('puts the session it opened into the crew that asked for it', async () => {
      spawnWire()

      await createEngine(createGateway({})).handleSettle(settled('s1'))

      expect(crewAdditions).toEqual([{ crewId: 'c1', sessionId: 'spawned-1' }])
      expect(crewsChanged).toBe(1)
    })

    it('opens a global session when the spec names no project', async () => {
      spawnWire('s1', { projectId: null })

      const gateway = createGateway({})
      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.created[0]).toEqual({
        contextKind: 'global',
        providerId: 'codex',
        model: 'gpt-5.6',
        effort: null,
        name: 'Reviewer',
      })
    })

    it('records the failure and starts nothing when the session cannot be opened', async () => {
      spawnWire()
      const gateway = createGateway({
        create: () => {
          throw new Error('Project not found: p1')
        },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.started).toEqual([])
      const hop = relays.listHops('c1')[0]
      expect(hop.outcome).toBe('error')
      expect(hop.error).toContain('Project not found: p1')
      expect(hop.spawnedSessionId).toBeNull()
    })

    it('names the session it opened even when starting it failed', async () => {
      spawnWire()
      const gateway = createGateway({
        start: async () => {
          throw new Error('codex is not on PATH')
        },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      const hop = relays.listHops('c1')[0]
      expect(hop.outcome).toBe('error')
      // The session exists and is sitting in the room; the ledger must say so.
      expect(hop.spawnedSessionId).toBe('spawned-1')
      expect(hop.error).toContain('could not start it')
      expect(hop.error).toContain('codex is not on PATH')
    })

    it('still spawns when the crew refuses the new member', async () => {
      spawnWire()
      const engine = new RelayEngine({
        relays,
        sessions: createGateway({}),
        crews: {
          addMember: () => {
            throw new Error('crew is gone')
          },
        },
        onHopAppended: (hop) => hops.push(hop),
      })

      await engine.handleSettle(settled('s1'))

      expect(relays.listHops('c1')[0].outcome).toBe('spawned')
    })

    it('charges the flow run budget for a spawn', async () => {
      const relay = spawnWire('s1')
      for (let index = 0; index < MAX_AUTOMATIC_HOPS_PER_FLOW_RUN; index += 1) {
        relays.appendHop({
          relayId: relay.id,
          crewId: 'c1',
          flowRunId: 'run-hot',
          sourceSessionId: 'x',
          spawnedSessionId: 's1',
          triggerStatus: 'completed',
          outcome: 'spawned',
        })
      }
      const gateway = createGateway({})

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.created).toEqual([])
      expect(relays.listHops('c1')[0].outcome).toBe('skipped-budget')
      expect(relays.getById(relay.id)!.armed).toBe(false)
    })
  })

  it('never rejects, even when the ledger itself breaks', async () => {
    wire()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(relays, 'listForSourceSession').mockImplementation(() => {
      throw new Error('database is closed')
    })

    await expect(
      createEngine(createGateway({})).handleSettle(settled('s1')),
    ).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
    vi.restoreAllMocks()
  })
})
