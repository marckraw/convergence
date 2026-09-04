import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import type { SessionStatus } from '../provider/provider.types'
import type { SessionSettledEvent } from '../session/session.types'
import { RelayEngine, type RelaySessionGateway } from './relay.engine'
import type { AutomaticTurnAccount } from '../provider-account/provider-account-automatic-turn.pure'
import { CrewHailService } from './crew-hail.service'
import {
  MAX_AUTOMATIC_HOPS_PER_FLOW_RUN,
  TERMINAL_BATON_MESSAGE,
} from './relay.pure'
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
  /** True for the payload that rode behind an opener (F9). */
  queuedBehindOpener?: boolean
  /** The delivery receipt the fake session layer minted for this input. */
  dispatchId: string
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
  sendMessageWithOpener?: (
    sessionId: string,
    input: { opener: string; text: string },
  ) => Promise<void>
  create?: () => { id: string }
  start?: (sessionId: string) => Promise<void>
}): FakeGateway {
  const sent: RecordedTurn[] = []
  const created: Array<Record<string, unknown>> = []
  const started: RecordedTurn[] = []
  const missing = new Set(overrides.missing ?? [])
  // Deterministic receipts, like the real session layer's but readable in a
  // failure message: every accepted input gets exactly one.
  let receiptSeq = 0
  const mintReceipt = () => {
    receiptSeq += 1
    return `receipt-${receiptSeq}`
  }

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
      const dispatchId = mintReceipt()
      sent.push({
        sessionId,
        text: input.text,
        providerAccountId: input.providerAccountId,
        dispatchId,
      })
      return dispatchId
    },
    // `sent` stays the ordered log of everything the target received, so the
    // two beats of an opener firing are provable by index.
    sendMessageWithOpener: async (sessionId, input) => {
      if (overrides.sendMessageWithOpener) {
        await overrides.sendMessageWithOpener(sessionId, input)
      }
      const openerDispatchId = mintReceipt()
      const payloadDispatchId = mintReceipt()
      sent.push({
        sessionId,
        text: input.opener,
        providerAccountId: input.providerAccountId,
        dispatchId: openerDispatchId,
      })
      sent.push({
        sessionId,
        text: input.text,
        providerAccountId: input.providerAccountId,
        queuedBehindOpener: true,
        dispatchId: payloadDispatchId,
      })
      return { openerDispatchId, payloadDispatchId }
    },
    create: (input) => {
      created.push(input as unknown as Record<string, unknown>)
      return overrides.create ? overrides.create() : { id: 'spawned-1' }
    },
    start: async (sessionId, input) => {
      if (overrides.start) await overrides.start(sessionId)
      const dispatchId = mintReceipt()
      started.push({
        sessionId,
        text: input.text,
        providerAccountId: input.providerAccountId,
        dispatchId,
      })
      return dispatchId
    },
  }
}

function settled(
  sessionId: string,
  status: SessionSettledEvent['status'] = 'completed',
  relaysMuted = false,
  /**
   * The receipts this settling turn consumed (MAR-2759). Empty is a purely
   * human turn -- which is what most of these tests mean, because the settle
   * under test is the SOURCE finishing on its own, not a delivery landing.
   */
  dispatchIds: string[] = [],
): SessionSettledEvent {
  return {
    sessionId,
    status,
    // The clock's own now (fake-timer aware): a settle happens when it
    // happens, and the ledger's pre-hop floor rightly refuses one stamped
    // before the work it would answer was even sent.
    settledAt: new Date().toISOString(),
    relaysMuted,
    dispatchIds,
  }
}

/**
 * Every receipt the fake session layer minted for inputs into this station,
 * in order. Tests reach for specific beats by index when a station received
 * more than one (an opener and its payload).
 */
function receiptsFor(gateway: FakeGateway, sessionId: string): string[] {
  return [...gateway.sent, ...gateway.started]
    .filter((turn) => turn.sessionId === sessionId)
    .map((turn) => turn.dispatchId)
}

/**
 * The settle of the work delivered into this station: it names every receipt
 * the station was handed, which is what the real session layer says when the
 * turn that consumed them comes to rest.
 */
function settleCarried(
  gateway: FakeGateway,
  sessionId: string,
  status: SessionSettledEvent['status'] = 'completed',
  relaysMuted = false,
): SessionSettledEvent {
  return settled(
    sessionId,
    status,
    relaysMuted,
    receiptsFor(gateway, sessionId),
  )
}

describe('RelayEngine', () => {
  let db: Database.Database
  let relays: RelayService
  let hops: RelayHop[]
  let relaysChanged: number
  let crewsChanged: number
  let crewAdditions: Array<{ crewId: string; sessionId: string }>
  let hails: CrewHailService
  let hailsChanged: number
  /** Per-crew loop knobs the fake crew gateway answers with. */
  let loopLimits: Record<
    string,
    { roundCap: number | null; stallMinutes: number | null }
  >
  /** Enrolled accounts per provider. Empty by default: ambient, as before. */
  let accountsByProvider: Record<string, AutomaticTurnAccount[]>

  beforeEach(() => {
    accountsByProvider = {}
    db = getDatabase()
    relays = new RelayService(db)
    hails = new CrewHailService(db)
    hailsChanged = 0
    loopLimits = {}
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
      crews: crewGateway(),
      hails,
      accounts: {
        listByProvider: (providerId) => accountsByProvider[providerId] ?? [],
      },
      onHopAppended: (hop) => hops.push(hop),
      onHailsChanged: () => {
        hailsChanged += 1
      },
      onRelaysChanged: () => {
        relaysChanged += 1
      },
      onCrewsChanged: () => {
        crewsChanged += 1
      },
    })
  }

  /**
   * Narrow, and backed by the real membership table for the one question that
   * cannot be faked honestly: a station with no outgoing wire is only part of a
   * flow because it is a MEMBER of one, and inventing that answer would let the
   * unrouted hail pass a test the real app fails.
   */
  function crewGateway() {
    return {
      addMember: (crewId: string, sessionId: string) => {
        crewAdditions.push({ crewId, sessionId })
      },
      crewIdsForSession: (sessionId: string) =>
        (
          db
            .prepare(
              'SELECT crew_id FROM session_crew_members WHERE session_id = ?',
            )
            .all(sessionId) as { crew_id: string }[]
        ).map((row) => row.crew_id),
      getLoopLimits: (crewId: string) => loopLimits[crewId] ?? null,
    }
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
    opener: string | null = null,
  ): ReturnType<RelayService['create']> {
    return relays.create({
      crewId: 'c1',
      sourceSessionId: source,
      action: 'hail',
      targetSessionId: target,
      instruction,
      opener,
      armed,
    })
  }

  /** A wire that only fires when the finishing message declares this route. */
  function batonWire(
    source: string,
    target: string,
    conditionToken: string | null,
    armed = true,
  ): ReturnType<RelayService['create']> {
    return relays.create({
      crewId: 'c1',
      sourceSessionId: source,
      action: 'hail',
      targetSessionId: target,
      conditionToken,
      armed,
    })
  }

  /** A second room. Only a multi-crew topology can ask some of these. */
  function createCrew(crewId: string): void {
    db.prepare('INSERT INTO session_crews (id, name) VALUES (?, ?)').run(
      crewId,
      crewId,
    )
  }

  /** A wire in a named crew, so two crews can share one settling station. */
  function crewWire(
    crewId: string,
    source: string,
    target: string,
    conditionToken: string | null = null,
  ): ReturnType<RelayService['create']> {
    return relays.create({
      crewId,
      sourceSessionId: source,
      action: 'hail',
      targetSessionId: target,
      conditionToken,
    })
  }

  function joinCrew(sessionId: string, crewId = 'c1'): void {
    db.prepare(
      'INSERT INTO session_crew_members (crew_id, session_id) VALUES (?, ?)',
    ).run(crewId, sessionId)
  }

  describe('the baton: a wire fires only on a declared route (MAR-2759)', () => {
    it('fires exactly the wire the message handed the baton to', async () => {
      batonWire('s1', 's2', 'BATON: codex')
      batonWire('s1', 's3', 'BATON: fable')
      const gateway = createGateway({
        lastMessages: { s1: 'Round 1 is in.\n\nBATON: codex' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual(['s2'])
    })

    it('fires nothing when the message declares no baton at all', async () => {
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'Just thinking out loud.' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent).toHaveLength(0)
    })

    it('records the refusal rather than staying silent about it', async () => {
      // The trail is the audit organ: a wire that held must say so, and say
      // which route it was waiting for. An absence is not an answer.
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'Done.\n\nBATON: fable' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      const hop = relays.listHops('c1')[0]
      expect(hop.outcome).toBe('skipped-baton')
      expect(hop.error).toContain('BATON: codex')
      // Every row records what the message said, fired or refused.
      expect(hop.baton).toBe('fable')
    })

    it('leaves a wire with no condition firing exactly as it always did', async () => {
      // Back-compat, and the reason conditions are opt-in: every wire drawn
      // before MAR-2759 must keep working with nothing changed about it.
      wire('s1', 's2')
      const gateway = createGateway({
        lastMessages: { s1: 'No baton anywhere in here.' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual(['s2'])
      expect(relays.listHops('c1')[0].outcome).toBe('delivered')
    })

    it('delivers a baton the formatter bolded (MAR-2815)', async () => {
      // The defect itself, at the layer it was seen: a mastermind that writes
      // markdown ends its verdict in bold, and for a whole day every one of
      // those finishes wrote a held row instead of a hop.
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'Round 1 is in.\n\n**BATON: codex**' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual(['s2'])
      const hop = relays.listHops('c1')[0]
      expect(hop.outcome).toBe('delivered')
      expect(hop.baton).toBe('codex')
    })

    it('stores the raw refused line on the row the trail reads', async () => {
      // The claim is about the `error` column a person actually reads, so it
      // is pinned on the persisted row rather than on the sentence helper.
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'Done.\n\n**BATON: fable**' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      const hop = relays.listHops('c1')[0]
      expect(hop.outcome).toBe('skipped-baton')
      expect(hop.error).toBe(
        'This wire waits for "BATON: codex"; the message\'s last line was "**BATON: fable**", which handed on "fable", so it held.',
      )
      // And it is LOUD: a baton no wire answered to always reaches a human.
      expect(hails.listOpen()).toMatchObject([
        { reason: 'unrouted', crewId: 'c1', baton: 'fable' },
      ])
    })

    it('hails unrouted for a baton bolded INSIDE the declaration', async () => {
      // The silent drop: reading `BATON: **fable**` as "nothing declared"
      // wrote no row and opened no hail, so the loop simply stopped with
      // nobody told -- exactly the failure the unrouted hail exists for.
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'Round 1 is in.\n\nBATON: **fable**' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent).toHaveLength(0)
      expect(hails.listOpen()).toMatchObject([
        { reason: 'unrouted', crewId: 'c1', baton: 'fable' },
      ])
    })

    it('hails unrouted for a declaration that names only marks', async () => {
      // MAR-2815 round 3, at the claim layer: `BATON: **` peels to nothing,
      // and "nothing" opened no hail and wrote no reason -- the loop stopped
      // with nobody told. The attempt is loud again, naming what was written.
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'Round 1 is in.\n\nBATON: **' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent).toHaveLength(0)
      expect(hails.listOpen()).toMatchObject([
        { reason: 'unrouted', crewId: 'c1', baton: '**' },
      ])
    })

    it('hails unrouted for a bare BATON: that names nobody', async () => {
      // MAR-2815 round 4, at the claim layer: the keyword alone read as "no
      // declaration at all", so the loop stopped with no row, no hail and
      // nobody told -- the same silent drop `BATON: **` had, one shape over.
      // The line still attempted a hand-off, so it is loud; there is simply no
      // name to quote, and the sentence says that instead.
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'Round 1 is in.\n\nBATON:' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent).toHaveLength(0)
      expect(hails.listOpen()).toMatchObject([
        { reason: 'unrouted', crewId: 'c1', baton: null },
      ])
      expect(hails.listOpen()[0].detail).toContain('named nobody')
    })

    it('delivers a baton bolded INSIDE the declaration', async () => {
      // The formatter does not decide who gets the work.
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'Round 1 is in.\n\nBATON: **codex**' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual(['s2'])
      const hop = relays.listHops('c1')[0]
      expect(hop.outcome).toBe('delivered')
      expect(hop.baton).toBe('codex')
    })

    it('parks at the chair when the chair is bolded INSIDE', async () => {
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'This one is yours.\n\nBATON: **marcin**' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent).toHaveLength(0)
      const hop = relays.listHops('c1')[0]
      expect(hop.outcome).toBe('skipped-baton')
      expect(hop.error).toBe(TERMINAL_BATON_MESSAGE)
      expect(hails.listOpen()).toMatchObject([
        { reason: 'terminal', crewId: 'c1', baton: 'marcin' },
      ])
    })

    it('parks at the chair when the reserved baton arrives in bold', async () => {
      // The route guaranteed to reach a human is the one a mastermind is most
      // likely to bold, so the strip has to reach the terminal check too.
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'This one is yours.\n\n**BATON: marcin**' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent).toHaveLength(0)
      const hop = relays.listHops('c1')[0]
      expect(hop.outcome).toBe('skipped-baton')
      expect(hop.error).toBe(TERMINAL_BATON_MESSAGE)
      expect(hails.listOpen()).toMatchObject([
        { reason: 'terminal', crewId: 'c1', baton: 'marcin' },
      ])
    })

    it('stamps the round and the baton onto the hop it fires', async () => {
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'Round 1 is in.\n\nBATON: codex' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      const hop = relays.listHops('c1')[0]
      expect(hop.outcome).toBe('delivered')
      expect(hop.baton).toBe('codex')
      expect(hop.roundNumber).toBe(1)
    })
  })

  describe('the hail: a loop that parks is LOUD (MAR-2759)', () => {
    it('parks and hails on the reserved terminal baton', async () => {
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'This one is a judgement call.\n\nBATON: marcin' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent).toHaveLength(0)
      const open = hails.listOpen()
      expect(open).toHaveLength(1)
      expect(open[0]).toMatchObject({
        crewId: 'c1',
        reason: 'terminal',
        sessionId: 's1',
        baton: 'marcin',
      })
      // The message is attached, not referenced: the hail IS the question.
      expect(open[0].message).toContain('judgement call')
      expect(hailsChanged).toBe(1)
    })

    it('parks at the chair beside a wire that fires on everything', async () => {
      // The reserved terminal outranks ROUTING, not just conditions. An
      // unconditional wire answers every message, so without this the one
      // route guaranteed to reach a human delivers onward and the chair
      // never lights -- the loudest possible silence.
      wire('s1', 's2')
      const gateway = createGateway({
        lastMessages: { s1: 'This one is yours.\n\nBATON: marcin' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent).toHaveLength(0)
      const rows = relays.listHops('c1')
      expect(rows).toHaveLength(1)
      expect(rows[0].outcome).toBe('skipped-baton')
      expect(rows[0].error).toContain('marcin')
      expect(hails.listOpen()).toMatchObject([
        { reason: 'terminal', sessionId: 's1', crewId: 'c1' },
      ])
    })

    it('numbers a refusal with the round it would have been', async () => {
      // The trail claims every row carries its round. A refusal computed
      // before the number existed made that claim false on exactly the rows
      // a parked loop is read from.
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'Done.\n\nBATON: fable' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      const hop = relays.listHops('c1')[0]
      expect(hop.outcome).toBe('skipped-baton')
      expect(hop.roundNumber).toBe(1)
    })

    it('hails when a baton nothing answers is handed on', async () => {
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'Done.\n\nBATON: fabel' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      const open = hails.listOpen()
      expect(open).toHaveLength(1)
      expect(open[0].reason).toBe('unrouted')
      expect(open[0].detail).toContain('fabel')
    })

    it('hails when the only wire that answers is switched off', async () => {
      batonWire('s1', 's2', 'BATON: codex', false)
      const gateway = createGateway({
        lastMessages: { s1: 'Done.\n\nBATON: codex' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(hails.listOpen().map((hail) => hail.reason)).toEqual(['unrouted'])
    })

    it('hails for a station that has no outgoing wire at all', async () => {
      // The silent drop in its purest form: a member wired only as a target
      // declares a route, and there is not one wire leaving it to write a row.
      // Without the membership read this settle produces nothing whatsoever.
      wire('s1', 's2')
      joinCrew('s2')
      const gateway = createGateway({
        lastMessages: { s2: 'Reviewed.\n\nBATON: fable' },
      })

      await createEngine(gateway).handleSettle(settled('s2'))

      expect(relays.listHops('c1')).toHaveLength(0)
      expect(hails.listOpen()).toMatchObject([
        { reason: 'unrouted', sessionId: 's2', baton: 'fable' },
      ])
    })

    it('hails the crew nobody answered while its sibling delivers', async () => {
      // One settle, two crews, one boolean between them: c1 matching used to
      // suppress c2's call entirely. A silent drop in a supported topology is
      // exactly the defect this feature exists to remove.
      createCrew('c2')
      batonWire('s1', 's2', 'BATON: codex')
      crewWire('c2', 's1', 's3', 'BATON: fable')
      const gateway = createGateway({
        lastMessages: { s1: 'Round 1 is in.\n\nBATON: codex' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual(['s2'])
      expect(hails.listOpen()).toMatchObject([
        { crewId: 'c2', reason: 'unrouted', baton: 'codex' },
      ])
    })

    it('hails a crew that is only waiting on the station, beside one that answered', async () => {
      // The membership half of the same defect: c2 owns a wire elsewhere and
      // has no wire leaving s1 at all, so it writes no row -- its call is the
      // only thing that can say the baton never reached it.
      createCrew('c2')
      batonWire('s1', 's2', 'BATON: codex')
      crewWire('c2', 's2', 's3')
      joinCrew('s1', 'c2')
      const gateway = createGateway({
        lastMessages: { s1: 'Round 1 is in.\n\nBATON: codex' },
      })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual(['s2'])
      expect(hails.listOpen()).toMatchObject([
        { crewId: 'c2', reason: 'unrouted' },
      ])
    })

    it('says nothing about a session in no crew that has wires', async () => {
      // A session outside every flow can end with whatever words it likes.
      const gateway = createGateway({
        lastMessages: { s3: 'Thinking.\n\nBATON: marcin' },
      })

      await createEngine(gateway).handleSettle(settled('s3'))

      expect(hails.listOpen()).toHaveLength(0)
    })

    it('stays silent when the human asked for quiet', async () => {
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'Done.\n\nBATON: marcin' },
      })

      await createEngine(gateway).handleSettle(settled('s1', 'completed', true))

      expect(hails.listOpen()).toHaveLength(0)
    })

    it('stays silent when the source failed', async () => {
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'Crashed.\n\nBATON: marcin' },
      })

      await createEngine(gateway).handleSettle(settled('s1', 'failed'))

      expect(hails.listOpen()).toHaveLength(0)
      expect(relays.listHops('c1')[0].outcome).toBe('skipped-failed')
    })

    it('calls him when the loop law closes a lap with a baton riding', async () => {
      // D1, ruled: a cyclic crew closes ONE lap per flow run. The chain ends
      // at the wire that already fired -- and a station that handed work on
      // to a wire which cannot carry it has parked, so the closure is LOUD.
      // A silent stop is the defect class, whoever stops it.
      batonWire('s1', 's2', 'BATON: s2')
      batonWire('s2', 's1', 'BATON: s1')
      const gateway = createGateway({
        lastMessages: { s1: 'Go.\n\nBATON: s2', s2: 'Back.\n\nBATON: s1' },
      })
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settleCarried(gateway, 's2'))
      await engine.handleSettle(settleCarried(gateway, 's1'))

      expect(
        relays
          .listHops('c1')
          .some((hop) => hop.outcome === 'skipped-already-fired'),
      ).toBe(true)
      expect(hails.listOpen()).toMatchObject([
        { reason: 'loop-closed', sessionId: 's1', baton: 's2' },
      ])
    })

    it('stays quiet when the loop law ends a chain nobody handed on', async () => {
      // The other half of the same law: unconditional wires carrying an
      // ordinary conversation have no baton riding, so the chain ending is
      // the wire behaving and there is nothing for him to answer.
      wire('s1', 's2')
      wire('s2', 's1')
      const gateway = createGateway({
        lastMessages: { s1: 'Go.', s2: 'Back.' },
      })
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settleCarried(gateway, 's2'))
      await engine.handleSettle(settleCarried(gateway, 's1'))

      expect(
        relays
          .listHops('c1')
          .some((hop) => hop.outcome === 'skipped-already-fired'),
      ).toBe(true)
      expect(hails.listOpen()).toHaveLength(0)
    })

    it('calls again when the station parks a second time', async () => {
      // Keyed by the flow run, not by the station. A settle takes its baton
      // and the next one mints a fresh run, so two finishes are two separate
      // moments he has to know about -- collapsing them would hide the second
      // parked loop behind the first, which is the silence this feature
      // exists to remove. The stall check is where a repeat WOULD be noise,
      // and it is deduped there because it re-reads one unanswered hop.
      batonWire('s1', 's2', 'BATON: codex')
      const gateway = createGateway({
        lastMessages: { s1: 'Done.\n\nBATON: marcin' },
      })
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settled('s1'))

      const open = hails.listOpen()
      expect(open).toHaveLength(2)
      expect(new Set(open.map((hail) => hail.flowRunId)).size).toBe(2)
    })
  })

  describe('the round budget: a long loop asks for a human (MAR-2759)', () => {
    it('holds the wire at the cap, hails, and disarms nothing', async () => {
      loopLimits.c1 = { roundCap: 2, stallMinutes: null }
      // Three wires in one chain so the run reaches a third hop without the
      // loop law ending it first.
      const first = wire('s1', 's2')
      const second = wire('s2', 's3')
      const third = wire('s3', 's1')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settleCarried(gateway, 's2'))
      await engine.handleSettle(settleCarried(gateway, 's3'))

      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual(['s2', 's3'])
      const newest = relays.listHops('c1')[0]
      expect(newest.outcome).toBe('skipped-round-budget')
      expect(newest.error).toContain('2-round cap')
      expect(newest.roundNumber).toBe(3)
      // Unlike the hop budget, the round cap throws no switch: a long loop
      // needs eyes on it, not a wire the user has to find and turn back on.
      for (const relay of [first, second, third]) {
        expect(relays.getById(relay.id)!.armed).toBe(true)
      }
      expect(relaysChanged).toBe(0)
      expect(hails.listOpen()).toMatchObject([{ reason: 'round-budget' }])
    })

    it('spends each crew round meter on that crew own hops', async () => {
      // One session in two crews. The meter used to count the whole flow run,
      // so c1's hop numbered c2's first row "round 2" and spent c2's cap
      // before c2 had carried anything at all.
      createCrew('c2')
      loopLimits.c2 = { roundCap: 1, stallMinutes: null }
      crewWire('c1', 's1', 's2')
      crewWire('c2', 's1', 's3')
      const gateway = createGateway({})

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual(['s2', 's3'])
      expect(relays.listHops('c1')[0].roundNumber).toBe(1)
      expect(relays.listHops('c2')[0].roundNumber).toBe(1)
      expect(hails.listOpen()).toHaveLength(0)
    })

    it('numbers each delivered round in the trail', async () => {
      wire('s1', 's2')
      wire('s2', 's3')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settleCarried(gateway, 's2'))

      expect(
        relays
          .listHops('c1')
          .map((hop) => hop.roundNumber)
          .reverse(),
      ).toEqual([1, 2])
    })
  })

  describe('the stall hail: a station that never comes back (MAR-2759)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    async function landAHop(): Promise<FakeGateway> {
      wire('s1', 's2')
      const gateway = createGateway({})
      await createEngine(gateway).handleSettle(settled('s1'))
      return gateway
    }

    it('names the station once the window has passed', async () => {
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      await landAHop()
      const engine = createEngine(createGateway({}))

      vi.setSystemTime(new Date('2026-09-01T12:31:00.000Z'))
      engine.checkForStalls()

      expect(hails.listOpen()).toMatchObject([
        { reason: 'stall', sessionId: 's2', crewId: 'c1' },
      ])
      expect(hailsChanged).toBe(1)
    })

    it('says nothing while the station is still inside its window', async () => {
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      await landAHop()
      const engine = createEngine(createGateway({}))

      vi.setSystemTime(new Date('2026-09-01T12:29:00.000Z'))
      engine.checkForStalls()

      expect(hails.listOpen()).toHaveLength(0)
    })

    it('honours a crew that shortened its own window', async () => {
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      loopLimits.c1 = { roundCap: null, stallMinutes: 5 }
      await landAHop()
      const engine = createEngine(createGateway({}))

      vi.setSystemTime(new Date('2026-09-01T12:06:00.000Z'))
      engine.checkForStalls()

      expect(hails.listOpen()).toHaveLength(1)
    })

    it('says nothing about a station that came back', async () => {
      // The ordinary A -> B delivery: s2 is a terminal station, so it writes
      // no row when it finishes and the landed hop stays the newest one
      // forever. Read from the clock alone, every such crew false-alarms at
      // the window -- the default path, not an edge.
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      const gateway = await landAHop()
      const engine = createEngine(gateway)
      vi.setSystemTime(new Date('2026-09-01T12:05:00.000Z'))
      await engine.handleSettle(settleCarried(gateway, 's2'))

      vi.setSystemTime(new Date('2026-09-01T12:31:00.000Z'))
      engine.checkForStalls()

      expect(hails.listOpen()).toHaveLength(0)
    })

    it('stays loud about a station that failed after taking the work', async () => {
      // A terminal station that dies writes nothing and parks nothing: the
      // stall call is its only alarm, and suppressing it along with the
      // false ones would trade one silence for another.
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      const gateway = await landAHop()
      const engine = createEngine(gateway)
      vi.setSystemTime(new Date('2026-09-01T12:05:00.000Z'))
      await engine.handleSettle(settleCarried(gateway, 's2', 'failed'))

      vi.setSystemTime(new Date('2026-09-01T12:31:00.000Z'))
      engine.checkForStalls()

      expect(hails.listOpen()).toMatchObject([
        { reason: 'stall', sessionId: 's2' },
      ])
      expect(hails.listOpen()[0].detail).toContain('failed')
    })

    it('stays loud about a failed station buried under its own refusal rows', async () => {
      // The failed nonterminal: s2 took the work and failed, and its own wire
      // to s3 then wrote a `skipped-failed` refusal on top of the trail. The
      // newest row spent nothing -- the debt is s2's, and it stands.
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      wire('s1', 's2')
      wire('s2', 's3')
      const gateway = createGateway({})
      const engine = createEngine(gateway)
      await engine.handleSettle(settled('s1'))
      vi.setSystemTime(new Date('2026-09-01T12:05:00.000Z'))
      await engine.handleSettle(settleCarried(gateway, 's2', 'failed'))

      vi.setSystemTime(new Date('2026-09-01T12:31:00.000Z'))
      engine.checkForStalls()

      expect(hails.listOpen()).toMatchObject([
        { reason: 'stall', sessionId: 's2' },
      ])
      expect(hails.listOpen()[0].detail).toContain('failed')
    })

    it('does not let a healthy sibling hide a hung station in a fan-out', async () => {
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      wire('s1', 's2')
      wire('s1', 's3')
      const gateway = createGateway({})
      const engine = createEngine(gateway)
      await engine.handleSettle(settled('s1'))
      // s3 comes back healthy and writes the newer trail row; s2 hangs.
      vi.setSystemTime(new Date('2026-09-01T12:05:00.000Z'))
      await engine.handleSettle(settleCarried(gateway, 's3'))

      vi.setSystemTime(new Date('2026-09-01T12:31:00.000Z'))
      engine.checkForStalls()

      expect(hails.listOpen()).toMatchObject([
        { reason: 'stall', sessionId: 's2' },
      ])
    })

    it('names every outstanding station in one tick', async () => {
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      wire('s1', 's2')
      wire('s1', 's3')
      const engine = createEngine(createGateway({}))
      await engine.handleSettle(settled('s1'))

      vi.setSystemTime(new Date('2026-09-01T12:31:00.000Z'))
      engine.checkForStalls()

      expect(
        hails
          .listOpen()
          .map((hail) => hail.sessionId)
          .sort(),
      ).toEqual(['s2', 's3'])
    })

    it('leaves the hop owed when a settle names none of its receipts', async () => {
      // A settle that consumed nothing of ours -- however it is timestamped
      // -- cannot answer the delivered work: the hop stays owed and the call
      // still comes.
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      await landAHop()
      const engine = createEngine(createGateway({}))
      await engine.handleSettle({
        ...settled('s2'),
        settledAt: '2026-09-01T11:00:00.000Z',
      })

      vi.setSystemTime(new Date('2026-09-01T12:31:00.000Z'))
      engine.checkForStalls()

      expect(hails.listOpen()).toMatchObject([
        { reason: 'stall', sessionId: 's2' },
      ])
    })

    it('keeps the payload owed when a restart forgets the opener plumbing', async () => {
      // The engine that sent the opener dies before the opener's turn ends.
      // The fresh engine has no in-memory plumbing claim, but the receipt
      // rode on the hop: the opener's settle names the OPENER's id, not the
      // payload's, so it can never stamp the payload -- and a payload that
      // then hangs still gets its alarm.
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      wire('s1', 's2', true, null, '/clear')
      const gateway = createGateway({})
      await createEngine(gateway).handleSettle(settled('s1'))

      const restarted = createEngine(createGateway({}))
      vi.setSystemTime(new Date('2026-09-01T12:01:00.000Z'))
      await restarted.handleSettle(
        settled('s2', 'completed', false, [gateway.sent[0].dispatchId]),
      )

      vi.setSystemTime(new Date('2026-09-01T12:31:00.000Z'))
      restarted.checkForStalls()

      expect(hails.listOpen()).toMatchObject([
        { reason: 'stall', sessionId: 's2' },
      ])
    })

    it('lets the payload settle itself silence the restarted opener case', async () => {
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      wire('s1', 's2', true, null, '/clear')
      const gateway = createGateway({})
      await createEngine(gateway).handleSettle(settled('s1'))

      // The restarted engine treats the opener settle as an ordinary beat --
      // its plumbing claim died with the old engine -- but identity still
      // holds: the queued receipt survives on the hop, and only the settle
      // naming it stamps.
      const restarted = createEngine(createGateway({}))
      vi.setSystemTime(new Date('2026-09-01T12:01:00.000Z'))
      await restarted.handleSettle(
        settled('s2', 'completed', false, [gateway.sent[0].dispatchId]),
      )
      vi.setSystemTime(new Date('2026-09-01T12:05:00.000Z'))
      await restarted.handleSettle(
        settled('s2', 'completed', false, [gateway.sent[1].dispatchId]),
      )

      vi.setSystemTime(new Date('2026-09-01T12:31:00.000Z'))
      restarted.checkForStalls()

      expect(hails.listOpen()).toHaveLength(0)
    })

    it('stays quiet on the ordinary opener path, no restart involved', async () => {
      // The opener's settle names the opener's receipt -- plumbing, skipped
      // -- and the payload's settle names the payload's, which is the one
      // and only stamp. No count to undercount, nothing for a healthy loop
      // to false-alarm on.
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      wire('s1', 's2', true, null, '/clear')
      const gateway = createGateway({})
      const engine = createEngine(gateway)
      await engine.handleSettle(settled('s1'))
      vi.setSystemTime(new Date('2026-09-01T12:01:00.000Z'))
      await engine.handleSettle(
        settled('s2', 'completed', false, [gateway.sent[0].dispatchId]),
      )
      vi.setSystemTime(new Date('2026-09-01T12:05:00.000Z'))
      await engine.handleSettle(
        settled('s2', 'completed', false, [gateway.sent[1].dispatchId]),
      )

      vi.setSystemTime(new Date('2026-09-01T12:31:00.000Z'))
      engine.checkForStalls()

      expect(hails.listOpen()).toHaveLength(0)
    })

    it('keeps the payload owed through the running turn AND the opener beats', async () => {
      // An opener fired at a mid-turn target puts two settles ahead of the
      // payload's own. Neither of them names the payload's receipt, so
      // neither can stamp it "completed" and bury the hang behind it.
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      wire('s1', 's2', true, null, '/clear')
      const gateway = createGateway({ statuses: { s2: 'running' } })
      const engine = createEngine(gateway)
      await engine.handleSettle(settled('s1'))
      // The running turn's settle consumed nothing of ours; then the
      // opener's own settle, naming the opener's receipt. The payload hangs.
      vi.setSystemTime(new Date('2026-09-01T12:02:00.000Z'))
      await engine.handleSettle(settled('s2'))
      vi.setSystemTime(new Date('2026-09-01T12:04:00.000Z'))
      await engine.handleSettle(
        settled('s2', 'completed', false, [gateway.sent[0].dispatchId]),
      )

      vi.setSystemTime(new Date('2026-09-01T12:35:00.000Z'))
      engine.checkForStalls()

      expect(hails.listOpen()).toMatchObject([
        { reason: 'stall', sessionId: 's2' },
      ])
    })

    it('does not let the preceding turn settle a payload queued behind it', async () => {
      // The queued carrier: s2 was mid-turn when the payload queued. That
      // turn's completion names no receipt of ours; a payload that then
      // hangs behind a completed turn still hails.
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      wire('s1', 's2')
      const engine = createEngine(
        createGateway({ statuses: { s2: 'running' } }),
      )
      await engine.handleSettle(settled('s1'))
      vi.setSystemTime(new Date('2026-09-01T12:05:00.000Z'))
      await engine.handleSettle(settled('s2'))

      vi.setSystemTime(new Date('2026-09-01T12:36:00.000Z'))
      engine.checkForStalls()

      expect(hails.listOpen()).toMatchObject([
        { reason: 'stall', sessionId: 's2' },
      ])
    })

    it('stamps the queued payload by its own settle, the second one', async () => {
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      wire('s1', 's2')
      const gateway = createGateway({ statuses: { s2: 'running' } })
      const engine = createEngine(gateway)
      await engine.handleSettle(settled('s1'))
      vi.setSystemTime(new Date('2026-09-01T12:05:00.000Z'))
      await engine.handleSettle(settled('s2'))
      vi.setSystemTime(new Date('2026-09-01T12:10:00.000Z'))
      await engine.handleSettle(settleCarried(gateway, 's2'))

      vi.setSystemTime(new Date('2026-09-01T12:41:00.000Z'))
      engine.checkForStalls()

      expect(hails.listOpen()).toHaveLength(0)
    })

    it('files one call however often the clock ticks', async () => {
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      await landAHop()
      const engine = createEngine(createGateway({}))

      vi.setSystemTime(new Date('2026-09-01T12:31:00.000Z'))
      engine.checkForStalls()
      vi.setSystemTime(new Date('2026-09-01T12:32:00.000Z'))
      engine.checkForStalls()
      vi.setSystemTime(new Date('2026-09-01T12:33:00.000Z'))
      engine.checkForStalls()

      expect(hails.listOpen()).toHaveLength(1)
    })

    it('stays silent for an answered call until a new hop re-arms it', async () => {
      // The frozen rule: a stall hail "re-arms after the next hop", not
      // after the acknowledgment. Answering the call is Marcin saying "I
      // know about THIS debt" -- the timer re-reading the same hop a minute
      // later must stay silent, or the gesture is minute-by-minute nagging.
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      const gateway = await landAHop()
      const engine = createEngine(gateway)

      vi.setSystemTime(new Date('2026-09-01T12:31:00.000Z'))
      engine.checkForStalls()
      const accused = hails.listOpen()
      expect(accused).toHaveLength(1)
      hails.acknowledgeCrew('c1')
      vi.setSystemTime(new Date('2026-09-01T12:32:00.000Z'))
      engine.checkForStalls()

      expect(hails.listOpen()).toHaveLength(0)
    })

    it('re-arms when a NEW hop lands in the acknowledged station', async () => {
      // The other half of the frozen rule: new work is a new debt with a new
      // identity, and it gets its own alarm however the last one ended.
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      const gateway = await landAHop()
      const engine = createEngine(gateway)

      vi.setSystemTime(new Date('2026-09-01T12:31:00.000Z'))
      engine.checkForStalls()
      const first = hails.listOpen()[0]
      hails.acknowledgeCrew('c1')

      // A second wire lands fresh work in s2; it hangs too.
      wire('s3', 's2')
      vi.setSystemTime(new Date('2026-09-01T12:35:00.000Z'))
      await engine.handleSettle(settled('s3'))

      vi.setSystemTime(new Date('2026-09-01T13:06:00.000Z'))
      engine.checkForStalls()

      const reArmed = hails.listOpen()
      expect(reArmed).toMatchObject([{ reason: 'stall', sessionId: 's2' }])
      expect(reArmed[0].hopId).not.toBe(first.hopId)
    })

    it('says nothing when a native follow-up joined the running turn', async () => {
      // The Pi-shaped corner: a payload sent to a running target JOINS that
      // turn, so the turn's settle is the payload's own answer -- and it
      // names the receipt. No count to overcharge, no false hail at the
      // window.
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      wire('s1', 's2')
      const gateway = createGateway({ statuses: { s2: 'running' } })
      const engine = createEngine(gateway)
      await engine.handleSettle(settled('s1'))

      vi.setSystemTime(new Date('2026-09-01T12:05:00.000Z'))
      await engine.handleSettle(settleCarried(gateway, 's2'))

      vi.setSystemTime(new Date('2026-09-01T12:36:00.000Z'))
      engine.checkForStalls()

      expect(hails.listOpen()).toHaveLength(0)
      expect(relays.listHops('c1')[0].settledAt).not.toBeNull()
    })

    it('keeps a second queued payload owed when the first settles', async () => {
      // The queue-depth corner: two payloads behind one running target. The
      // first payload's settle stamps ITS hop alone; the second hanging
      // still hails, and the call names the owed hop.
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      wire('s1', 's2')
      wire('s3', 's2')
      const gateway = createGateway({ statuses: { s2: 'running' } })
      const engine = createEngine(gateway)
      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settled('s3'))

      // The turn that was already running consumed neither payload.
      vi.setSystemTime(new Date('2026-09-01T12:02:00.000Z'))
      await engine.handleSettle(settled('s2'))
      // The first payload's own settle.
      vi.setSystemTime(new Date('2026-09-01T12:05:00.000Z'))
      await engine.handleSettle(
        settled('s2', 'completed', false, [gateway.sent[0].dispatchId]),
      )

      vi.setSystemTime(new Date('2026-09-01T12:36:00.000Z'))
      engine.checkForStalls()

      const open = hails.listOpen()
      expect(open).toMatchObject([{ reason: 'stall', sessionId: 's2' }])
      const owed = relays
        .listHops('c1')
        .find((hop) => hop.dispatchId === gateway.sent[1].dispatchId)
      expect(owed?.settledAt).toBeNull()
      expect(open[0].hopId).toBe(owed?.id)
    })
  })

  describe('a cancelled receipt reaches a terminal (MAR-2759)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    /** What main does with the session layer's dispatch-terminal event. */
    function terminate(
      engine: RelayEngine,
      sessionId: string,
      dispatchIds: string[],
      reason: 'cancelled' | 'abandoned' | 'failed' = 'cancelled',
    ): void {
      engine.handleDispatchTerminal({
        sessionId,
        reason,
        dispatchIds,
        at: new Date().toISOString(),
      })
    }

    it('releases the baton and stamps the hop when its queued input is cancelled', async () => {
      // A cancelled input's settle never comes. Without a terminal its
      // baton, its hop's debt and its run all outlive work the user
      // explicitly ended -- until a restart.
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      wire('s1', 's2')
      const gateway = createGateway({ statuses: { s2: 'running' } })
      const engine = createEngine(gateway)
      await engine.handleSettle(settled('s1'))
      const [receipt] = receiptsFor(gateway, 's2')
      expect(engine.liveFlowRunIds()).toHaveLength(1)

      terminate(engine, 's2', [receipt])

      expect(engine.liveFlowRunIds()).toEqual([])
      expect(relays.listHops('c1')[0]).toMatchObject({
        dispatchId: receipt,
        settledStatus: 'cancelled',
      })
      vi.setSystemTime(new Date('2026-09-01T12:35:00.000Z'))
      engine.checkForStalls()
      expect(hails.listOpen()).toEqual([])
    })

    it('releases every receipt a deleted session held, and nothing more', async () => {
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      wire('s1', 's2')
      wire('s3', 's2')
      // A third run, waiting on a different station, is untouched.
      wire('s1', 's3')
      const gateway = createGateway({ statuses: { s2: 'running' } })
      const engine = createEngine(gateway)
      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settled('s3'))
      const intoS2 = receiptsFor(gateway, 's2')
      expect(intoS2).toHaveLength(2)
      expect(engine.liveFlowRunIds()).toHaveLength(2)

      terminate(engine, 's2', intoS2, 'abandoned')

      const stillLive = engine.liveFlowRunIds()
      expect(stillLive).toHaveLength(1)
      expect(stillLive[0]).toBe(
        relays.listHops('c1').find((hop) => hop.targetSessionId === 's3')
          ?.flowRunId,
      )
      for (const hop of relays.listHops('c1')) {
        expect(hop.settledStatus).toBe(
          hop.targetSessionId === 's2' ? 'abandoned' : null,
        )
      }
      vi.setSystemTime(new Date('2026-09-01T12:35:00.000Z'))
      engine.checkForStalls()
      expect(hails.listOpen()).toMatchObject([{ sessionId: 's3' }])
    })

    it('keeps a sibling receipt in the same session live when one is terminated', async () => {
      // The bound: never a session-keyed eviction. Two receipts queued into
      // one station; ending one leaves the other's baton, debt and run
      // exactly as they were, and its own settle still continues its run.
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      wire('s1', 's2')
      wire('s3', 's2')
      const onward = wire('s2', 's1')
      const gateway = createGateway({ statuses: { s2: 'running' } })
      const engine = createEngine(gateway)
      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settled('s3'))
      const [first, second] = receiptsFor(gateway, 's2')
      const secondRun = relays
        .listHops('c1')
        .find((hop) => hop.dispatchId === second)?.flowRunId

      terminate(engine, 's2', [first])

      expect(engine.liveFlowRunIds()).toEqual([secondRun])
      const owed = relays
        .listHops('c1')
        .find((hop) => hop.dispatchId === second)
      expect(owed?.settledAt).toBeNull()
      vi.setSystemTime(new Date('2026-09-01T12:35:00.000Z'))
      engine.checkForStalls()
      expect(hails.listOpen()).toMatchObject([
        { reason: 'stall', sessionId: 's2', hopId: owed?.id },
      ])

      await engine.handleSettle(settled('s2', 'completed', false, [second]))
      expect(relays.listHops('c1')[0]).toMatchObject({
        relayId: onward.id,
        outcome: 'delivered',
        flowRunId: secondRun,
      })
    })

    it('a failed receipt is loud: released, stamped failed, and hailed without waiting', async () => {
      // The fourth terminal (MAR-2759, design P): the system could not run
      // the dispatch. Nobody chose that, so unlike cancel and delete it is
      // not quiet -- the hop reads `failed` and the stall clock calls it on
      // the next tick rather than after the window.
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
      wire('s1', 's2', true, null, '/clear')
      const gateway = createGateway({ statuses: { s2: 'running' } })
      const engine = createEngine(gateway)
      await engine.handleSettle(settled('s1'))
      const [opener, payload] = receiptsFor(gateway, 's2')
      expect(engine.liveFlowRunIds()).toHaveLength(1)

      terminate(engine, 's2', [opener, payload], 'failed')

      expect(engine.liveFlowRunIds()).toEqual([])
      expect(relays.listHops('c1')[0]).toMatchObject({
        dispatchId: payload,
        settledStatus: 'failed',
      })
      vi.setSystemTime(new Date('2026-09-01T12:01:00.000Z'))
      engine.checkForStalls()
      expect(hails.listOpen()).toMatchObject([
        { reason: 'stall', sessionId: 's2', crewId: 'c1' },
      ])
      expect(hails.listOpen()[0].detail).toContain('failed')
      // The opener claim went with it: a settle naming that id is nobody's
      // plumbing now, and journals as somebody's work.
      wire('s2', 's3')
      await engine.handleSettle(settled('s2', 'completed', false, [opener]))
      expect(relays.listHops('c1')[0]).toMatchObject({
        targetSessionId: 's3',
        outcome: 'delivered',
      })
    })

    it('releases a queued opener claim with its receipt', async () => {
      // A deleted target takes its queued opener with it; a claim left
      // behind would be a plumbing beat nobody can ever pay.
      wire('s1', 's2', true, null, '/clear')
      const gateway = createGateway({ statuses: { s2: 'running' } })
      const engine = createEngine(gateway)
      await engine.handleSettle(settled('s1'))
      const [opener, payload] = receiptsFor(gateway, 's2')

      terminate(engine, 's2', [opener, payload], 'abandoned')

      expect(engine.liveFlowRunIds()).toEqual([])
      // A settle naming the released opener id is nobody's plumbing now: it
      // proceeds as somebody's work and mints a fresh run.
      wire('s2', 's3')
      await engine.handleSettle(settled('s2', 'completed', false, [opener]))
      expect(relays.listHops('c1')[0]).toMatchObject({
        targetSessionId: 's3',
        outcome: 'delivered',
      })
    })
  })

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
        dispatchId: 'receipt-1',
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
      // The receipt the session layer returned rides the hop: it is what
      // lets the settle that consumed this payload stamp it, and nothing
      // else (MAR-2759).
      dispatchId: 'receipt-1',
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
        dispatchId: 'receipt-1',
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
    const gateway = createGateway({})
    const engine = createEngine(gateway)

    await engine.handleSettle(settled('s1'))
    await engine.handleSettle(settleCarried(gateway, 's2'))

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
  describe('the quiet send (F10)', () => {
    it('declines and says so, without carrying anything', async () => {
      wire()
      const gateway = createGateway({})

      await createEngine(gateway).handleSettle(settled('s1', 'completed', true))

      expect(gateway.sent).toEqual([])
      const trail = relays.listHops('c1')
      expect(trail).toHaveLength(1)
      expect(trail[0]).toMatchObject({ outcome: 'skipped-muted' })
      expect(trail[0].error).toContain('sent quiet')
      // The row is broadcast like any other: a wire that held is still a wire
      // the user must be able to watch not fire.
      expect(hops).toHaveLength(1)
    })

    it('writes exactly one row per armed wire, and none for a disarmed one', async () => {
      // The reason the guard sits where it does: the row count for a quiet
      // settle is predictable -- N armed wires, N rows, always.
      wire('s1', 's2')
      wire('s1', 's3')
      wire('s1', 's4', false)
      const gateway = createGateway({})

      await createEngine(gateway).handleSettle(settled('s1', 'completed', true))

      const outcomes = relays.listHops('c1', 100).map((hop) => hop.outcome)
      expect(outcomes).toEqual(['skipped-muted', 'skipped-muted'])
    })

    it('outranks the failed-settle guard, so the ledger says what the human did', async () => {
      // A quiet settle that also failed must not read `skipped-failed`, which
      // would suggest the flow tried and could not.
      wire()
      const gateway = createGateway({})

      await createEngine(gateway).handleSettle(settled('s1', 'failed', true))

      expect(relays.listHops('c1')[0].outcome).toBe('skipped-muted')
    })

    it('spends no budget and leaves the wire live for the next settle', async () => {
      const there = wire()
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1', 'completed', true))
      await engine.handleSettle(settled('s1'))

      // The ordinary settle after the quiet one carries as usual: nothing was
      // disarmed, and the muted row charged no budget.
      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual(['s2'])
      expect(relays.getById(there.id)!.armed).toBe(true)
      expect(relaysChanged).toBe(0)
    })

    it('does not satisfy the loop law, so the wire may still fire in that run', async () => {
      // A muted row is not a firing. If it counted, a wire that held once would
      // be dead for the rest of the run -- silently, and only sometimes.
      const there = wire()
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1', 'completed', true))
      const mutedRun = relays.listHops('c1')[0].flowRunId

      expect(relays.hasFiredInFlowRun(there.id, mutedRun)).toBe(false)
      expect(relays.countBudgetedHops(mutedRun)).toBe(0)
    })

    it('outranks the loop law, so a quiet settle never reads "already fired"', async () => {
      // Ordering, pinned rather than commented. Everything below the mute guard
      // is a fact about the flow's state; the mute is the human's explicit
      // instruction about this settle, so it wins. Otherwise a wire that had
      // already fired this run would file the human's quiet send as the loop
      // law working, and the row count for a quiet settle would depend on where
      // in a chain it happened to land.
      wire('s1', 's2')
      wire('s2', 's1')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settled('s2'))
      // s1 now holds the baton and its wire has already fired in this run.
      await engine.handleSettle(settled('s1', 'completed', true))

      expect(relays.listHops('c1')[0].outcome).toBe('skipped-muted')
    })

    it('outranks the budget guard, and disarms nothing on the way past it', async () => {
      // The budget guard does not merely record: it disarms the wire. A muted
      // settle meeting an exhausted run must not cost the user a switched-off
      // wire for a send they asked to be quiet.
      wire('s1', 's2')
      const onward = wire('s2', 's3')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      // Burn the run's budget on the ledger, then settle into that same run.
      await engine.handleSettle(settled('s1'))
      const run = relays.listHops('c1')[0].flowRunId
      for (let i = 0; i < MAX_AUTOMATIC_HOPS_PER_FLOW_RUN; i += 1) {
        relays.appendHop({
          relayId: onward.id,
          crewId: 'c1',
          flowRunId: run,
          sourceSessionId: 's9',
          triggerStatus: 'completed',
          targetSessionId: 's3',
          spawnedSessionId: null,
          payloadPreview: null,
          outcome: 'delivered',
          error: null,
        })
      }
      relaysChanged = 0

      // s2 holds s1's baton, so this settle belongs to the exhausted run.
      await engine.handleSettle(settled('s2', 'completed', true))

      expect(relays.listHops('c1')[0].outcome).toBe('skipped-muted')
      expect(relays.getById(onward.id)!.armed).toBe(true)
      expect(relaysChanged).toBe(0)
    })

    it('hands on no baton, so the next settle starts a fresh run', async () => {
      // A baton follows work that actually landed somewhere. Nothing landed.
      wire('s1', 's2')
      wire('s2', 's3')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1', 'completed', true))
      await engine.handleSettle(settled('s2'))

      const runIds = new Set(relays.listHops('c1', 100).map((h) => h.flowRunId))
      expect(runIds.size).toBe(2)
      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual(['s3'])
    })

    it('takes its baton like any other settle, because a quiet turn still finished', async () => {
      // Unlike an opener's plumbing settle, a muted settle is real work coming
      // to rest. It must consume the run it was part of rather than leaving a
      // baton behind for some later, unrelated turn to inherit.
      wire('s1', 's2')
      const back = wire('s2', 's1')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      const deliveredRun = relays.listHops('c1')[0].flowRunId

      // s2 now holds s1's baton, and the delivered work settles quiet.
      await engine.handleSettle(settleCarried(gateway, 's2', 'completed', true))
      const mutedHop = relays.listHops('c1')[0]

      expect(mutedHop.outcome).toBe('skipped-muted')
      expect(mutedHop.relayId).toBe(back.id)
      expect(mutedHop.flowRunId).toBe(deliveredRun)

      // The baton was spent, so s2 finishing again mints a fresh run.
      await engine.handleSettle(settled('s2'))
      expect(relays.listHops('c1')[0].flowRunId).not.toBe(deliveredRun)
    })
  })

  describe('the loop law: once per flow run', () => {
    it('ends a ping-pong at two real hops with both wires still armed', async () => {
      const there = wire('s1', 's2')
      const back = wire('s2', 's1')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      // s1 finishes, hails s2; s2 finishes, hails s1 back; s1 finishes again
      // -- and that third settle is where the chain has to end.
      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settleCarried(gateway, 's2'))
      await engine.handleSettle(settleCarried(gateway, 's1'))

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
      await engine.handleSettle(settleCarried(gateway, 's2'))
      await engine.handleSettle(settleCarried(gateway, 's3'))
      await engine.handleSettle(settleCarried(gateway, 's1'))

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
      await engine.handleSettle(settleCarried(gateway, 's2'))
      await engine.handleSettle(settleCarried(gateway, 's1'))
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

      // s2 settles twice: once as the settle of the delivered work, naming
      // its receipt and taking the baton, and once on its own. The second
      // finds no baton it can name and must start a run of its own.
      wire('s2', 's3')
      await engine.handleSettle(settleCarried(gateway, 's2'))
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

      // The spawned session is now wired onward; the settle of the work it
      // was born onto continues the run rather than opening a second one.
      wire('spawned-1', 's3')
      await engine.handleSettle(settleCarried(gateway, 'spawned-1'))

      const trail = relays.listHops('c1', 100)
      expect(trail).toHaveLength(2)
      expect(trail[0].flowRunId).toBe(spawnRun)
    })

    it('keeps every receipt of a same-run fan-in into one queued target', async () => {
      // Two wires of ONE run land in the same running target, so the target
      // holds two outstanding dispatches at once. The first payload's own
      // settle must continue the landing run -- not mint a fresh one because
      // a one-slot container forgot its receipt -- and the second payload is
      // still paid for by its own settle afterwards.
      const first = wire('s1', 's2')
      const second = wire('s1', 's2')
      const onward = wire('s2', 's3')
      const gateway = createGateway({ statuses: { s2: 'running' } })
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      const landingRun = relays.listHops('c1')[0].flowRunId
      expect(
        relays
          .listHops('c1', 100)
          .filter((hop) => hop.outcome === 'queued')
          .map((hop) => hop.relayId)
          .sort(),
      ).toEqual([first.id, second.id].sort())
      const [firstReceipt, secondReceipt] = receiptsFor(gateway, 's2')

      // The first queued payload settles, naming only its own receipt.
      await engine.handleSettle(
        settled('s2', 'completed', false, [firstReceipt]),
      )
      const outward = relays.listHops('c1')[0]
      expect(outward.relayId).toBe(onward.id)
      expect(outward.outcome).toBe('delivered')
      expect(outward.flowRunId).toBe(landingRun)
      const byReceipt = (receipt: string) =>
        relays.listHops('c1', 100).find((hop) => hop.dispatchId === receipt)
      expect(byReceipt(firstReceipt)?.settledAt).not.toBeNull()
      expect(byReceipt(secondReceipt)?.settledAt).toBeNull()

      // The second payload settles on its own receipt: same run, its own hop
      // paid, and the onward wire has already fired in that run.
      await engine.handleSettle(
        settled('s2', 'completed', false, [secondReceipt]),
      )
      expect(byReceipt(secondReceipt)?.settledAt).not.toBeNull()
      expect(relays.listHops('c1')[0]).toMatchObject({
        relayId: onward.id,
        outcome: 'skipped-already-fired',
        flowRunId: landingRun,
      })
    })

    it('continues the OLDEST run when one settle names batons of two runs', async () => {
      // Two runs coalesced into one native turn: two sources each landed a
      // payload in the running target, and the turn that consumed both
      // comes to rest once. The older run continues, the younger's baton is
      // consumed with it, and nothing is dropped or left live.
      wire('s1', 's2')
      wire('s3', 's2')
      const onward = wire('s2', 's1')
      const gateway = createGateway({ statuses: { s2: 'running' } })
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      const olderRun = relays.listHops('c1')[0].flowRunId
      await engine.handleSettle(settled('s3'))
      const youngerRun = relays.listHops('c1')[0].flowRunId
      expect(youngerRun).not.toBe(olderRun)
      const [olderReceipt, youngerReceipt] = receiptsFor(gateway, 's2')

      // Named youngest-first on purpose: the rule is the age of the baton,
      // not the order the settle happens to list its receipts in.
      await engine.handleSettle(
        settled('s2', 'completed', false, [youngerReceipt, olderReceipt]),
      )

      expect(relays.listHops('c1')[0]).toMatchObject({
        relayId: onward.id,
        outcome: 'delivered',
        flowRunId: olderRun,
      })
      // Both batons were consumed: only the run now waiting on s1 is live,
      // and the younger run is finished, not stranded.
      expect(engine.liveFlowRunIds()).toEqual([olderRun])
      for (const receipt of [olderReceipt, youngerReceipt]) {
        expect(
          relays.listHops('c1', 100).find((hop) => hop.dispatchId === receipt)
            ?.settledAt,
        ).not.toBeNull()
      }
    })

    /**
     * A quiet row is still a row. The engine may decline to act, but it may
     * never decline silently -- "my wire did not fire" always has an answer.
     */
    it('broadcasts the quiet row like any other hop', async () => {
      wire('s1', 's2')
      wire('s2', 's1')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settleCarried(gateway, 's2'))
      await engine.handleSettle(settleCarried(gateway, 's1'))

      expect(hops).toHaveLength(3)
      expect(hops[2].outcome).toBe('skipped-already-fired')
    })

    it('carries nothing and touches no session when it declines', async () => {
      wire('s1', 's2')
      wire('s2', 's1')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settleCarried(gateway, 's2'))
      const sentBefore = gateway.sent.length
      await engine.handleSettle(settleCarried(gateway, 's1'))

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
   * Clearing the trail is a UI convenience; the loop law is a safety rule, and
   * the loop law reads this table. A trail emptied while a chain is still
   * moving would tell a wire it never fired and let the loop it closed reopen.
   */
  describe('clearing the trail cannot un-fire a live run', () => {
    /** Exactly what the IPC handler does: the engine names what must survive. */
    function clearTrail(engine: RelayEngine) {
      return relays.clearHops('c1', {
        keepFlowRunIds: engine.liveFlowRunIds(),
      })
    }

    it('keeps a chain ending at two hops when the trail is cleared mid-chain', async () => {
      const there = wire('s1', 's2')
      wire('s2', 's1')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      // s1 -> s2 lands, and the user empties the trail while s2 is still
      // working: the run is live, holding its baton on s2.
      await engine.handleSettle(settled('s1'))
      clearTrail(engine)

      await engine.handleSettle(settleCarried(gateway, 's2'))
      await engine.handleSettle(settleCarried(gateway, 's1'))

      // Two real turns, exactly as if nothing had been cleared.
      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual(['s2', 's1'])
      const trail = relays.listHops('c1', 100)
      expect(trail[0].outcome).toBe('skipped-already-fired')
      expect(trail[0].relayId).toBe(there.id)
    })

    /**
     * The narrower window: a settle has taken its baton and has not yet left
     * the next one, so for the length of one provider send the run is named by
     * nothing the engine is holding still.
     */
    it('keeps a run that is mid-hop, between one baton and the next', async () => {
      const there = wire('s1', 's2')
      wire('s2', 's1')
      // The gateway has to reach the engine that owns it, so the clear is
      // hung on this hook once both exist.
      let onSend: (sessionId: string) => void = () => undefined
      const gateway = createGateway({
        sendMessage: async (sessionId) => onSend(sessionId),
      })
      const engine = createEngine(gateway)
      onSend = (sessionId) => {
        // The second hop, s2 -> s1: the row proving `there` already fired is
        // in the ledger, and this is the instant it is least protected.
        if (sessionId === 's1') clearTrail(engine)
      }

      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settleCarried(gateway, 's2'))
      await engine.handleSettle(settleCarried(gateway, 's1'))

      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual(['s2', 's1'])
      const trail = relays.listHops('c1', 100)
      expect(trail[0].outcome).toBe('skipped-already-fired')
      expect(trail[0].relayId).toBe(there.id)
    })

    it('empties what has finished and keeps only what is still moving', async () => {
      wire('s1', 's2')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      // One chain all the way through -- s2's settle names the receipt it
      // was handed, so the run's baton is spent -- then a second one left
      // mid-flight.
      await engine.handleSettle(settled('s1'))
      await engine.handleSettle(settleCarried(gateway, 's2'))
      const finished = relays.listHops('c1', 100)
      expect(finished).toHaveLength(1)

      await engine.handleSettle(settled('s1'))
      const liveRun = relays.listHops('c1', 100)[0].flowRunId

      const result = clearTrail(engine)

      expect(result).toEqual({ removed: 1, kept: 1 })
      expect(relays.listHops('c1', 100).map((hop) => hop.flowRunId)).toEqual([
        liveRun,
      ])
    })

    /**
     * Why `runsInFlight` counts instead of remembering a set of ids.
     *
     * One settle can leave batons on several sessions, so several settles can
     * be carrying the SAME run at once. If those were tracked as a set, the
     * first of them to finish would erase the run for all of them -- and a
     * clear landing in that gap would delete the rows the sibling settle is
     * about to be measured against. The wire it already fired would read as
     * never fired, and the loop the law had closed would reopen.
     */
    it('keeps a run two settles are carrying until the last one lets go', async () => {
      const there = wire('s1', 's2')
      const alsoThere = wire('s1', 's3')
      wire('s3', 's1')

      // The hop out of s3 is held open, so that settle is still carrying the
      // run when the settle out of s2 has finished with it.
      let releaseSend: () => void = () => undefined
      const held = new Promise<void>((resolve) => {
        releaseSend = resolve
      })
      const gateway = createGateway({
        sendMessage: async (sessionId) => {
          if (sessionId === 's1') await held
        },
      })
      const engine = createEngine(gateway)

      // s1 settles once and feeds both s2 and s3, so one run now has two
      // batons out.
      await engine.handleSettle(settled('s1'))
      const run = relays.listHops('c1', 100)[0].flowRunId
      expect(relays.listHops('c1', 100)).toHaveLength(2)

      // s3 takes its baton and stalls mid-hop; s2 takes its baton, finds
      // nothing wired onward, and finishes without leaving a new one. Between
      // them the run holds no baton at all -- only the settle still in flight.
      const stalled = engine.handleSettle(settleCarried(gateway, 's3'))
      await engine.handleSettle(settleCarried(gateway, 's2'))

      expect(engine.liveFlowRunIds()).toEqual([run])
      expect(clearTrail(engine)).toEqual({ removed: 0, kept: 2 })
      expect(relays.listHops('c1', 100).map((hop) => hop.flowRunId)).toEqual([
        run,
        run,
      ])

      releaseSend()
      await stalled

      // And the run still ends where it should: s1 comes back round to two
      // wires that have both already fired in it.
      await engine.handleSettle(settleCarried(gateway, 's1'))
      const trail = relays.listHops('c1', 100)
      expect(trail.slice(0, 2).map((hop) => hop.outcome)).toEqual([
        'skipped-already-fired',
        'skipped-already-fired',
      ])
      expect(new Set(trail.slice(0, 2).map((hop) => hop.relayId))).toEqual(
        new Set([there.id, alsoThere.id]),
      )
      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual([
        's2',
        's3',
        's1',
      ])
    })

    /**
     * The canary for the mechanism itself. Clearing without asking the engine
     * what is live is precisely the bug this guard exists for, and it must stay
     * visibly broken -- if this ever passes, the ledger stopped being the
     * loop law's authority and the guard above is measuring nothing.
     */
    it('would reopen the loop if the live runs were not spared', async () => {
      wire('s1', 's2')
      wire('s2', 's1')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      relays.clearHops('c1')

      await engine.handleSettle(settled('s2'))
      await engine.handleSettle(settled('s1'))

      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual([
        's2',
        's1',
        's2',
      ])
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
    // The hop budget is the backstop BEHIND the round cap (MAR-2759), so this
    // crew has to raise its cap above twenty for the backstop to be the guard
    // under test. A crew on the default cap never reaches it -- which is the
    // point of having the smaller, non-disarming guard in front.
    loopLimits.c1 = {
      roundCap: MAX_AUTOMATIC_HOPS_PER_FLOW_RUN + 1,
      stallMinutes: null,
    }
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

    await engine.handleSettle(settleCarried(gateway, 's2'))

    expect(gateway.sent).toHaveLength(sentBefore)
    const newest = relays.listHops('c1')[0]
    expect(newest.outcome).toBe('skipped-budget')
    expect(newest.flowRunId).toBe(flowRunId)
    expect(newest.error).toContain(String(MAX_AUTOMATIC_HOPS_PER_FLOW_RUN))
    expect(relays.getById(relay.id)!.armed).toBe(false)
    expect(relaysChanged).toBe(1)
  })

  it('lets a chain of distinct wires run right up to the budget', async () => {
    loopLimits.c1 = {
      roundCap: MAX_AUTOMATIC_HOPS_PER_FLOW_RUN + 1,
      stallMinutes: null,
    }
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
    const gateway = createGateway({})
    const engine = createEngine(gateway)

    for (const node of nodes) {
      await engine.handleSettle(settleCarried(gateway, node))
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
          dispatchId: 'receipt-1',
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
          ...crewGateway(),
          addMember: () => {
            throw new Error('crew is gone')
          },
        },
        hails,
        accounts: {
          listByProvider: (providerId) => accountsByProvider[providerId] ?? [],
        },
        onHopAppended: (hop) => hops.push(hop),
      })

      await engine.handleSettle(settled('s1'))

      expect(relays.listHops('c1')[0].outcome).toBe('spawned')
    })

    it('charges the flow run budget for a spawn', async () => {
      loopLimits.c1 = {
        roundCap: MAX_AUTOMATIC_HOPS_PER_FLOW_RUN + 1,
        stallMinutes: null,
      }
      wire('s1', 's2')
      const relay = spawnWire('s2')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      burnFlowRunBudget(relays.listHops('c1')[0].flowRunId)

      await engine.handleSettle(settleCarried(gateway, 's2'))

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

      // The round stamp rides inside the brief (MAR-2759): the first hop of a
      // fresh run is round 1, and the blank lines around it are the MAR-2280
      // law -- three blocks, so markdown cannot glue any two together.
      expect(gateway.sent[0].text).toBe(
        `${BRIEF}\n\nround 1\n\nBranch is green.`,
      )
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

      expect(gateway.started[0].text).toBe(
        `${BRIEF}\n\nround 1\n\nBranch is green.`,
      )
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
      expect(preview).toBe(`${BRIEF} round 1 Branch is green.`)
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
        'Wire one says this.\n\nround 1\n\nDone.',
        // Round 2: the first wire's delivery already spent one on this run.
        'Wire two says something else.\n\nround 2\n\nDone.',
      ])
    })
  })

  describe('the opener: a first send before the payload (F9)', () => {
    const BRIEF = 'Pick up the next task from the queue.'

    it('sends the opener first and queues the payload behind it', async () => {
      wire('s1', 's2', true, BRIEF, '/clear')
      const gateway = createGateway({ lastMessages: { s1: 'Lap done.' } })

      await createEngine(gateway).handleSettle(settled('s1'))

      // Two beats into the same session, in this order, and the payload is the
      // one that waits.
      expect(gateway.sent).toEqual([
        {
          sessionId: 's2',
          text: '/clear',
          providerAccountId: null,
          dispatchId: 'receipt-1',
        },
        {
          sessionId: 's2',
          text: `${BRIEF}\n\nround 1\n\nLap done.`,
          providerAccountId: null,
          queuedBehindOpener: true,
          dispatchId: 'receipt-2',
        },
      ])
    })

    it('sends the opener verbatim, with no instruction compiled into it', async () => {
      // The whole feature dies if anything is prepended: a message that no
      // longer starts with "/" is prose, not a command.
      wire('s1', 's2', true, BRIEF, '/clear')
      const gateway = createGateway({ lastMessages: { s1: 'Lap done.' } })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent[0].text).toBe('/clear')
    })

    it('rides both beats on the one account the hop resolved', async () => {
      wire('s1', 's2', true, null, '/clear')
      accountsByProvider.codex = [
        { id: 'work', isDefault: false, status: 'connected' },
        { id: 'personal', isDefault: true, status: 'connected' },
      ]
      const gateway = createGateway({ lastTurnAccounts: { s2: 'work' } })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent.map((turn) => turn.providerAccountId)).toEqual([
        'work',
        'work',
      ])
    })

    it('names both beats in the one ledger row it writes', async () => {
      // No silent sends: a hop that wiped its target before delivering has to
      // say so, or the trail reads as an ordinary delivery.
      wire('s1', 's2', true, null, '/clear')
      const gateway = createGateway({ lastMessages: { s1: 'Lap done.' } })

      await createEngine(gateway).handleSettle(settled('s1'))

      const trail = relays.listHops('c1', 100)
      expect(trail).toHaveLength(1)
      expect(trail[0].payloadPreview).toBe(
        'First send: /clear · then: Lap done.',
      )
      // Queued rather than delivered: the payload waits behind the opener by
      // construction, whatever the target was doing.
      expect(trail[0].outcome).toBe('queued')
    })

    it('charges one hop for a firing, not two', async () => {
      wire('s1', 's2', true, null, '/clear')
      const gateway = createGateway({})

      await createEngine(gateway).handleSettle(settled('s1'))

      const trail = relays.listHops('c1', 100)
      expect(trail).toHaveLength(1)
      expect(relays.countBudgetedHops(trail[0].flowRunId)).toBe(1)
    })

    /**
     * The loop law's hardest case. An opener adds a settle that finishes
     * nothing -- the target coming to rest after being wiped, with its real
     * work still queued. If that beat spent the run's baton, the settle a
     * moment later would open a FRESH run, every wire would be live again, and
     * A -> B -> A -> B would ping-pong for as long as the sessions kept
     * answering.
     */
    it('ends a ping-pong at two hops even though the opener adds a settle', async () => {
      const there = wire('s1', 's2', true, null, '/clear')
      const back = wire('s2', 's1')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      // s2 comes to rest twice: once because the opener's turn ended --
      // naming the opener's receipt -- and once because it finished the work
      // queued behind it, naming the payload's.
      await engine.handleSettle(
        settled('s2', 'completed', false, [gateway.sent[0].dispatchId]),
      )
      await engine.handleSettle(
        settled('s2', 'completed', false, [gateway.sent[1].dispatchId]),
      )
      await engine.handleSettle(settleCarried(gateway, 's1'))

      const trail = relays.listHops('c1', 100)
      expect(new Set(trail.map((hop) => hop.flowRunId)).size).toBe(1)
      expect(trail.map((hop) => hop.outcome)).toEqual([
        'skipped-already-fired',
        'delivered',
        'queued',
      ])
      expect(relays.getById(there.id)!.armed).toBe(true)
      expect(relays.getById(back.id)!.armed).toBe(true)
    })

    it('writes nothing for the opener beat, because no wire fired', async () => {
      wire('s1', 's2', true, null, '/clear')
      wire('s2', 's3')
      const gateway = createGateway({})
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      const afterHop = relays.listHops('c1', 100).length

      // The opener's own settle, recognised by its receipt. Nothing
      // finished, so nothing is journalled -- the same silence a disarmed
      // wire keeps, not a hidden delivery.
      await engine.handleSettle(
        settled('s2', 'completed', false, [gateway.sent[0].dispatchId]),
      )

      expect(relays.listHops('c1', 100)).toHaveLength(afterHop)
      expect(gateway.sent.map((turn) => turn.sessionId)).toEqual(['s2', 's2'])
    })

    it('sends one opener into a running target and keeps the loop closed', async () => {
      // Corner 3 of the round-3 STOP, closed by construction. A -> B -> A
      // with B mid-turn: the opener is QUEUED behind the running turn
      // (design X: an opener is always its own turn), so the pre-existing
      // turn's settle names no receipt of ours -- it is somebody's work and
      // journals through the wire leaving s2 (here the human asked for
      // quiet, so that row is a muted refusal in a fresh run) -- and the
      // baton STAYS; the opener's settle is plumbing by id; the payload's
      // settle continues the SAME run -- so the ring ends at the loop law
      // instead of re-firing A -> B, and exactly one /clear is ever sent.
      const there = wire('s1', 's2', true, null, '/clear')
      const back = wire('s2', 's1')
      const gateway = createGateway({ statuses: { s2: 'running' } })
      const engine = createEngine(gateway)

      await engine.handleSettle(settled('s1'))
      const run = relays.listHops('c1')[0].flowRunId
      // The turn that was already running comes to rest, quiet by the
      // human's word, naming nothing we hold.
      await engine.handleSettle(settled('s2', 'completed', true))
      const somebodys = relays.listHops('c1')[0]
      expect(somebodys).toMatchObject({
        relayId: back.id,
        outcome: 'skipped-muted',
      })
      expect(somebodys.flowRunId).not.toBe(run)
      // The opener's own turn.
      await engine.handleSettle(
        settled('s2', 'completed', false, [gateway.sent[0].dispatchId]),
      )
      // The payload's own settle: run continues, the ring closes.
      await engine.handleSettle(
        settled('s2', 'completed', false, [gateway.sent[1].dispatchId]),
      )
      await engine.handleSettle(settleCarried(gateway, 's1'))

      expect(
        gateway.sent.filter((turn) => turn.text === '/clear'),
      ).toHaveLength(1)
      const trail = relays.listHops('c1', 100)
      expect(
        trail.filter(
          (hop) => hop.relayId === there.id && hop.outcome === 'queued',
        ),
      ).toHaveLength(1)
      expect(trail[0]).toMatchObject({
        outcome: 'skipped-already-fired',
        flowRunId: run,
      })
      // Only the settle NAMING the opener's receipt was skipped: every
      // other beat of s2 is in the trail.
      expect(
        trail
          .filter((hop) => hop.relayId === back.id)
          .map((hop) => hop.outcome),
      ).toEqual(['delivered', 'skipped-muted'])
    })

    it('leaves a wire with no opener sending exactly one message', async () => {
      wire('s1', 's2')
      const gateway = createGateway({ lastMessages: { s1: 'Lap done.' } })

      await createEngine(gateway).handleSettle(settled('s1'))

      expect(gateway.sent).toEqual([
        {
          sessionId: 's2',
          text: 'Lap done.',
          providerAccountId: null,
          dispatchId: 'receipt-1',
        },
      ])
      expect(relays.listHops('c1')[0].outcome).toBe('delivered')
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
