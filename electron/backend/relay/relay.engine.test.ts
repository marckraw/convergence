import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import type { SessionStatus } from '../provider/provider.types'
import type { SessionSettledEvent } from '../session/session.types'
import { RelayEngine, type RelaySessionGateway } from './relay.engine'
import type { AutomaticTurnAccount } from '../provider-account/provider-account-automatic-turn.pure'
import { MAX_AUTOMATIC_HOPS_PER_FLOW_RUN } from './relay.pure'
import { RelayService } from './relay.service'
import type { RelayHop } from './relay.types'

/**
 * The engine is the one thing in the app that spends provider quota without a
 * human pressing anything, so every test here drives a fake gateway. Nothing
 * in this file may reach a real session, a real provider, or a real process.
 */
/** What a send or start carried, so tests can assert the account too. */
interface RecordedTurn {
  sessionId: string
  text: string
  providerAccountId: string | null | undefined
}

interface FakeGateway extends RelaySessionGateway {
  sent: RecordedTurn[]
  created: Array<Record<string, unknown>>
  started: RecordedTurn[]
}

function createGateway(overrides: {
  lastMessages?: Record<string, string | null>
  statuses?: Record<string, SessionStatus>
  missing?: string[]
  providerIds?: Record<string, string>
  executionHosts?: Record<string, string>
  lastTurnAccounts?: Record<string, string | null>
  sendMessage?: (sessionId: string, input: { text: string }) => Promise<void>
  create?: () => { id: string }
  start?: (sessionId: string) => Promise<void>
}): FakeGateway {
  const sent: RecordedTurn[] = []
  const created: Array<Record<string, unknown>> = []
  const started: RecordedTurn[] = []
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
            providerId: overrides.providerIds?.[sessionId] ?? 'codex',
            executionHost: overrides.executionHosts?.[sessionId] ?? 'local',
          },
    getLastTurnProviderAccountId: (sessionId) =>
      overrides.lastTurnAccounts?.[sessionId] ?? null,
    getLastAssistantMessageText: (sessionId) =>
      overrides.lastMessages && sessionId in overrides.lastMessages
        ? overrides.lastMessages[sessionId]
        : 'Done. Ready for review.',
    sendMessage: async (sessionId, input) => {
      if (overrides.sendMessage) {
        await overrides.sendMessage(sessionId, input)
      }
      sent.push({
        sessionId,
        text: input.text,
        providerAccountId: input.providerAccountId,
      })
    },
    create: (input) => {
      created.push(input as unknown as Record<string, unknown>)
      return overrides.create ? overrides.create() : { id: 'spawned-1' }
    },
    start: async (sessionId, input) => {
      if (overrides.start) await overrides.start(sessionId)
      started.push({
        sessionId,
        text: input.text,
        providerAccountId: input.providerAccountId,
      })
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
  /** Enrolled accounts per provider. Empty by default: ambient, as before. */
  let accountsByProvider: Record<string, AutomaticTurnAccount[]>

  beforeEach(() => {
    accountsByProvider = {}
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
      accounts: {
        listByProvider: (providerId) => accountsByProvider[providerId] ?? [],
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
      providerAccountId: string | null
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
        providerAccountId: null,
        ...spec,
      },
    })
  }

  function wire(
    source = 's1',
    target = 's2',
    armed = true,
    instruction: string | null = null,
  ): ReturnType<RelayService['create']> {
    return relays.create({
      crewId: 'c1',
      sourceSessionId: source,
      action: 'hail',
      targetSessionId: target,
      instruction,
      armed,
    })
  }

  describe('provider accounts', () => {
    const WORK: AutomaticTurnAccount = {
      id: 'work',
      isDefault: false,
      status: 'connected',
    }
    const DEFAULT_ACCOUNT: AutomaticTurnAccount = {
      id: 'personal',
      isDefault: true,
      status: 'connected',
    }

    it('hops onto the account the target session last rode', async () => {
      wire()
      accountsByProvider.codex = [WORK, DEFAULT_ACCOUNT]
      const gateway = createGateway({ lastTurnAccounts: { s2: 'work' } })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent[0].providerAccountId).toBe('work')
    })

    /**
     * The bug this ticket exists for: with no inherited account the hop used to
     * run on whichever credential happened to be signed in on the machine.
     */
    it('falls back to the enrolled default when the target has no turns', async () => {
      wire()
      accountsByProvider.codex = [WORK, DEFAULT_ACCOUNT]
      const gateway = createGateway({})

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent[0].providerAccountId).toBe('personal')
    })

    it('stays on ambient when nothing is enrolled, exactly as before', async () => {
      wire()
      const gateway = createGateway({})

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent[0].providerAccountId).toBeNull()
    })

    it('reads the accounts of the target’s provider, not the source’s', async () => {
      wire()
      accountsByProvider.codex = [WORK]
      accountsByProvider['claude-code'] = [DEFAULT_ACCOUNT]
      const gateway = createGateway({
        providerIds: { s1: 'codex', s2: 'claude-code' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent[0].providerAccountId).toBe('personal')
    })

    /** A local account id on a remote host trips the PA10 guard and fails. */
    it('sends a remote target to ambient rather than breaking the wire', async () => {
      wire()
      accountsByProvider.codex = [DEFAULT_ACCOUNT]
      const gateway = createGateway({
        executionHosts: { s2: 'remote' },
        lastTurnAccounts: { s2: 'work' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent[0].providerAccountId).toBeNull()
      expect(relays.listHops('c1')[0].outcome).toBe('delivered')
    })

    it('starts a spawn on the account its wire named', async () => {
      spawnWire('s1', { providerAccountId: 'work' })
      accountsByProvider.codex = [WORK, DEFAULT_ACCOUNT]
      const gateway = createGateway({})

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.started[0].providerAccountId).toBe('work')
    })

    /**
     * Codex fixes a session's credential at its first turn and refuses to
     * change it, so a spawn that came up on ambient could never be corrected.
     */
    it('starts an unspecified spawn on the enrolled default', async () => {
      spawnWire()
      accountsByProvider.codex = [WORK, DEFAULT_ACCOUNT]
      const gateway = createGateway({})

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.started[0].providerAccountId).toBe('personal')
    })

    it('resolves a spawn against the provider the spec names', async () => {
      spawnWire('s1', { providerId: 'claude-code' })
      accountsByProvider.codex = [WORK]
      accountsByProvider['claude-code'] = [DEFAULT_ACCOUNT]
      const gateway = createGateway({})

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.started[0].providerAccountId).toBe('personal')
    })
  })

  it('carries the last assistant message to the target and records a delivery', async () => {
    const relay = wire()
    const gateway = createGateway({
      lastMessages: { s1: 'Review this branch, please.' },
      statuses: { s2: 'completed' },
    })

    await createEngine(gateway).handleSettle(settled('s1'))

    expect(gateway.sent).toEqual([
      {
        sessionId: 's2',
        text: 'Review this branch, please.',
        providerAccountId: null,
      },
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

  it('stays completely silent for a disarmed wire', async () => {
    wire('s1', 's2', false)
    const gateway = createGateway({})

    await createEngine(gateway).handleSettle(settled('s1'))

    expect(gateway.sent).toEqual([])
    // A switch at rest is not a firing: no ledger row, and nothing broadcast
    // to the windows watching the trail.
    expect(relays.listHops('c1')).toEqual([])
    expect(hops).toEqual([])
  })

  it('still fires the armed wires leaving a session with a disarmed one', async () => {
    wire('s1', 's2', false)
    wire('s1', 's3')
    const gateway = createGateway({})

    await createEngine(gateway).handleSettle(settled('s1'))

    expect(gateway.sent).toEqual([
      {
        sessionId: 's3',
        text: 'Done. Ready for review.',
        providerAccountId: null,
      },
    ])
    const written = relays.listHops('c1')
    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({
      outcome: 'delivered',
      targetSessionId: 's3',
    })
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

  /**
   * The loop law. Loops are wanted -- A -> B -> A is our own review loop --
   * but a chain that has been all the way round has finished, and before this
   * the only thing that stopped it was twenty real provider turns.
   */
  describe('the loop law: once per flow run', () => {
    it('ends a ping-pong at two real hops with both wires still armed', async () => {
      const there = wire('s1', 's2')
      const back = wire('s2', 's1')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      // s1 finishes, hails s2; s2 finishes, hails s1 back; s1 finishes again
      // -- and that third settle is where the chain has to end.
      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settled('s2'))
      await engine.handleSettle(settled('s1'))

      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual(['s2', 's1'])

      const trail = relays.listHops('c1', 100)
      expect(trail).toHaveLength(3)
      const runIds = new Set(trail.map((hop) => hop.flowRunId))
      expect(runIds.size).toBe(1)

      const newest = trail[0]
      expect(newest.outcome).toBe('skipped-already-fired')
      expect(newest.relayId).toBe(there.id)
      expect(newest.error).toContain('already fired in this run')

      // Nothing was disarmed and nothing went red: the law is a pause, not a
      // failure, and the next run must find both wires live.
      expect(relays.getById(there.id)!.armed).toBe(true)
      expect(relays.getById(back.id)!.armed).toBe(true)
      expect(relaysChanged).toBe(0)
      expect(trail.some((hop) => hop.outcome === 'skipped-budget')).toBe(false)
    })

    it('lets each wire of a three-node chain fire once, then stops', async () => {
      wire('s1', 's2')
      wire('s2', 's3')
      wire('s3', 's1')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settled('s2'))
      await engine.handleSettle(settled('s3'))
      await engine.handleSettle(settled('s1'))

      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual([
        's2',
        's3',
        's1',
      ])
      const outcomes = relays.listHops('c1', 100).map((hop) => hop.outcome)
      expect(outcomes).toEqual([
        'skipped-already-fired',
        'delivered',
        'delivered',
        'delivered',
      ])
    })

    /**
     * THE regression this design exists for. Before the baton, ancestry was
     * inferred from the newest hop that ever landed in a session, with no time
     * bound -- so a hail typed by hand tomorrow would inherit today's finished
     * run and find every wire "already fired". Dead forever, from a switch the
     * user can see is armed.
     */
    it('fires again when the same session is driven by hand after the chain ended', async () => {
      wire('s1', 's2')
      wire('s2', 's1')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settled('s2'))
      await engine.handleSettle(settled('s1'))
      const afterChain = relays.listHops('c1', 100).length

      // A human hails s1 and it settles again. No baton, so a fresh run.
      await engine.handleSettle(settled('s1'))

      const trail = relays.listHops('c1', 100)
      expect(trail).toHaveLength(afterChain + 1)
      expect(trail[0].outcome).toBe('delivered')
      expect(trail[0].targetSessionId).toBe('s2')
      expect(new Set(trail.map((hop) => hop.flowRunId)).size).toBe(2)
      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual([
        's2',
        's1',
        's2',
      ])
    })

    it('spends a baton exactly once, so a chain never re-enters an old run', async () => {
      wire('s1', 's2')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      const deliveredRun = relays.listHops('c1')[0].flowRunId

      // s2 settles twice. The first settle takes the baton, the second finds
      // none and must start a run of its own rather than re-reading the old.
      wire('s2', 's3')
      await engine.handleSettle(settled('s2'))
      await engine.handleSettle(settled('s2'))

      const trail = relays.listHops('c1', 100)
      expect(trail).toHaveLength(3)
      const [newest, middle] = trail
      expect(middle.flowRunId).toBe(deliveredRun)
      expect(newest.flowRunId).not.toBe(deliveredRun)
      expect(newest.outcome).toBe('delivered')
    })

    it('hands the baton to a session it spawned', async () => {
      spawnWire('s1')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      const spawnRun = relays.listHops('c1')[0].flowRunId

      // The spawned session is now wired onward; its settle continues the run
      // it was born into rather than opening a second one.
      wire('spawned-1', 's3')
      await engine.handleSettle(settled('spawned-1'))

      const trail = relays.listHops('c1', 100)
      expect(trail).toHaveLength(2)
      expect(trail[0].flowRunId).toBe(spawnRun)
    })

    /**
     * A quiet row is still a row. The engine may decline to act, but it may
     * never decline silently -- "my wire did not fire" always has an answer.
     */
    it('broadcasts the quiet row like any other hop', async () => {
      wire('s1', 's2')
      wire('s2', 's1')
      const engine = createEngine(createGateway({}))

      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settled('s2'))
      await engine.handleSettle(settled('s1'))

      expect(hops).toHaveLength(3)
      expect(hops[2].outcome).toBe('skipped-already-fired')
    })

    it('carries nothing and touches no session when it declines', async () => {
      wire('s1', 's2')
      wire('s2', 's1')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settled('s2'))
      const sentBefore = gateway.sent.length
      await engine.handleSettle(settled('s1'))

      expect(gateway.sent).toHaveLength(sentBefore)
      expect(gateway.created).toEqual([])
      expect(relays.listHops('c1')[0].payloadPreview).toBeNull()
    })

    /** A failed source is a truer answer than "you already fired". */
    it('still names a failed source ahead of the loop law', async () => {
      wire('s1', 's2')
      wire('s2', 's1')
      const engine = createEngine(createGateway({}))

      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settled('s2'))
      await engine.handleSettle(settled('s1', 'failed'))

      expect(relays.listHops('c1')[0].outcome).toBe('skipped-failed')
    })
  })

  /**
   * The budget is the backstop behind the loop law, so these tests can no
   * longer reach it by ping-ponging two wires -- that chain now ends at two
   * hops. They fill a run the way a wide crew would: with hops from wires
   * this test is not watching, all landing in the run the engine is really
   * using. Run ids are minted inside the engine, so the run is read off the
   * first real hop rather than invented here.
   */
  function burnFlowRunBudget(flowRunId: string): void {
    while (
      relays.countBudgetedHops(flowRunId) < MAX_AUTOMATIC_HOPS_PER_FLOW_RUN
    ) {
      relays.appendHop({
        relayId: 'a-wire-this-test-is-not-watching',
        crewId: 'c1',
        flowRunId,
        sourceSessionId: 's3',
        targetSessionId: 's3',
        triggerStatus: 'completed',
        outcome: 'delivered',
      })
    }
  }

  it('disarms loudly when a flow run burns its budget', async () => {
    wire('s1', 's2')
    const relay = wire('s2', 's1')
    const gateway = createGateway({})
    const engine = createEngine(gateway)

    // One real hop puts s2 in the run and hands it the baton; the rest of the
    // run's budget is spent by other wires before s2 gets to answer.
    await engine.handleSettle(settled('s1'))
    const flowRunId = relays.listHops('c1')[0].flowRunId
    burnFlowRunBudget(flowRunId)
    const sentBefore = gateway.sent.length

    await engine.handleSettle(settled('s2'))

    expect(gateway.sent).toHaveLength(sentBefore)
    const newest = relays.listHops('c1')[0]
    expect(newest.outcome).toBe('skipped-budget')
    expect(newest.flowRunId).toBe(flowRunId)
    expect(newest.error).toContain(String(MAX_AUTOMATIC_HOPS_PER_FLOW_RUN))
    expect(relays.getById(relay.id)!.armed).toBe(false)
    expect(relaysChanged).toBe(1)
  })

  it('lets a chain of distinct wires run right up to the budget', async () => {
    // A relay chain long enough to outrun the budget on its own: n0 -> n1 ->
    // ... Each wire fires once, so only the length of the chain can exhaust
    // the run -- which is exactly the case the backstop still exists for.
    const nodes = Array.from(
      { length: MAX_AUTOMATIC_HOPS_PER_FLOW_RUN + 2 },
      (_, index) => `n${index}`,
    )
    for (let index = 0; index < nodes.length - 1; index += 1) {
      wire(nodes[index], nodes[index + 1])
    }
    const engine = createEngine(createGateway({}))

    for (const node of nodes) {
      await engine.handleSettle(settled(node))
    }

    const trail = relays.listHops('c1', 1000)
    const budgeted = trail.filter(
      (hop) => hop.outcome === 'delivered' || hop.outcome === 'queued',
    )
    expect(budgeted).toHaveLength(MAX_AUTOMATIC_HOPS_PER_FLOW_RUN)
    expect(trail.some((hop) => hop.outcome === 'skipped-budget')).toBe(true)
    expect(new Set(trail.map((hop) => hop.flowRunId)).size).toBe(1)
    // Only the wire that tried to overspend is switched off; the loop law
    // never disarms anything, so the rest of the chain stays live.
    expect(relays.list().filter((relay) => !relay.armed)).toHaveLength(1)
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
        {
          sessionId: 'spawned-1',
          text: 'Review this branch, please.',
          providerAccountId: null,
        },
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
        accounts: {
          listByProvider: (providerId) => accountsByProvider[providerId] ?? [],
        },
        onHopAppended: (hop) => hops.push(hop),
      })

      await engine.handleSettle(settled('s1'))

      expect(relays.listHops('c1')[0].outcome).toBe('spawned')
    })

    it('charges the flow run budget for a spawn', async () => {
      wire('s1', 's2')
      const relay = spawnWire('s2')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      burnFlowRunBudget(relays.listHops('c1')[0].flowRunId)

      await engine.handleSettle(settled('s2'))

      expect(gateway.created).toEqual([])
      expect(relays.listHops('c1')[0].outcome).toBe('skipped-budget')
      expect(relays.getById(relay.id)!.armed).toBe(false)
    })
  })

  /**
   * A wire may carry a standing brief above the message it was written about.
   * The blank line between them is the MAR-2280 law; `relay.pure.test.ts` and
   * `relay-payload.render.test.ts` own the format itself, so these tests only
   * prove the engine actually sends the compiled thing -- and records it.
   */
  describe('instructions on the wire', () => {
    const BRIEF = 'Review this and push back where it is thin.'

    it('sends the brief above the message on a hail', async () => {
      wire('s1', 's2', true, BRIEF)
      const gateway = createGateway({
        lastMessages: { s1: 'Branch is green.' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent[0].text).toBe(`${BRIEF}\n\nBranch is green.`)
    })

    it('sends the brief above the message on a spawn', async () => {
      relays.create({
        crewId: 'c1',
        sourceSessionId: 's1',
        action: 'spawn',
        instruction: BRIEF,
        spawnSpec: {
          projectId: 'p1',
          providerId: 'codex',
          model: null,
          effort: null,
          name: 'Reviewer',
          providerAccountId: null,
        },
      })
      const gateway = createGateway({
        lastMessages: { s1: 'Branch is green.' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.started[0].text).toBe(`${BRIEF}\n\nBranch is green.`)
    })

    it('records what was actually sent, not what the session said', async () => {
      // The ledger is the honest account of the wire. A preview showing only
      // the source's words would hide the brief the target really received.
      wire('s1', 's2', true, BRIEF)
      const gateway = createGateway({
        lastMessages: { s1: 'Branch is green.' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      const preview = relays.listHops('c1')[0].payloadPreview
      expect(preview).toBe(`${BRIEF} Branch is green.`)
    })

    it('carries the message alone when the wire has no brief', async () => {
      wire('s1', 's2')
      const gateway = createGateway({
        lastMessages: { s1: 'Branch is green.' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      // Byte-identical to what this wire sent before instructions existed.
      expect(gateway.sent[0].text).toBe('Branch is green.')
      expect(relays.listHops('c1')[0].payloadPreview).toBe('Branch is green.')
    })

    it('briefs each wire on its own terms', async () => {
      wire('s1', 's2', true, 'Wire one says this.')
      wire('s1', 's3', true, 'Wire two says something else.')
      const gateway = createGateway({ lastMessages: { s1: 'Done.' } })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent.map((turn) => turn.text)).toEqual([
        'Wire one says this.\n\nDone.',
        'Wire two says something else.\n\nDone.',
      ])
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
