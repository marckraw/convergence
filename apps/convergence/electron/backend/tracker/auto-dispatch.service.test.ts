import { afterEach, expect, expectTypeOf, it, vi } from 'vitest'
import { tmpdir } from 'os'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { CrewService } from '../crew/crew.service'
import { WorkLedgerService } from '../work-ledger/work-ledger.service'
import { RelayService } from '../relay/relay.service'
import { SessionService } from '../session/session.service'
import { ProviderRegistry } from '../provider/provider-registry'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import {
  AutoDispatchService,
  type AutoDispatchGateway,
} from './auto-dispatch.service'
import { AutoDispatchPlanService } from './auto-dispatch-plan.service'
import { TrackerWatcherService } from './tracker-watcher.service'
import { diffTrackerSnapshot } from './tracker-watcher.pure'
import { trackerIssue } from './linear-tracker.fixture'
import {
  DEFAULT_CREW_MEMBER_SEAT,
  type SessionCrewMember,
} from '../crew/crew.types'
import type {
  SeatAvailability,
  TrackerIssue,
} from '../../../src/shared/types/tracker.types'
import { autoDispatchTime } from './auto-dispatch.pure'

const at = '2026-09-22T08:00:00.000Z'
afterEach(() => {
  vi.useRealTimers()
  closeDatabase()
  resetDatabase()
})
function bench(dbPath?: string) {
  const db = getDatabase(dbPath),
    crews = new CrewService(db),
    ledger = new WorkLedgerService(db)
  const crewId = (crews.list()[0] ?? crews.create({ name: 'Loom' })).id
  crews.setTrackerBinding(crewId, { projectId: 'p' })
  const seat: SessionCrewMember & {
    executionHost: string
    localWorkingDirectory: string | null
  } = {
    ...DEFAULT_CREW_MEMBER_SEAT,
    sessionId: 's',
    batonName: 'opus',
    canvasX: null,
    canvasY: null,
    providerId: 'codex',
    executionHost: 'local',
    localWorkingDirectory: '/conversation',
    lanePolicy: 'own-worktree',
    lanePath: '/lane',
    roleCard: 'You are the horse.',
  }
  const master = {
    ...seat,
    role: 'mastermind' as const,
    sessionId: 'm',
    batonName: 'fable',
  }
  const roster = {
    list: () => [{ ...crews.getById(crewId)!, members: [master, seat] }],
  }
  const relays = new RelayService(db)
  const wire = relays.create({
    action: 'hail',
    crewId,
    sourceSessionId: 'm',
    targetSessionId: 's',
    opener: '/clear',
    instruction: 'Do the work.',
  })
  let availability: SeatAvailability = 'idle'
  const terminalListeners: Array<
    (event: {
      sessionId: string
      reason: 'cancelled' | 'abandoned' | 'failed'
      dispatchIds: string[]
      at: string
    }) => void
  > = []
  const gateway: AutoDispatchGateway = {
    describeSeatAvailability: () => availability,
    describeLane: vi.fn(async () => 'clean' as const),
    firstDispatchSeenAt: (id) => ledger.firstDispatchSeenAt(id),
    findWire: (c, m, s) => relays.findWire(c, m, s),
    getLastTurnProviderAccountId: vi.fn(() => 'last-account'),
    listByProvider: vi.fn(() => [
      { id: 'default-account', status: 'connected' as const, isDefault: true },
      { id: 'last-account', status: 'connected' as const, isDefault: false },
    ]),
    sendMessageWithOpener: vi.fn(async () => ({
      openerDispatchId: 'opener',
      payloadDispatchId: 'payload',
      openerQueued: false,
    })),
    deliverRelayMessage: vi.fn(async () => ({
      dispatchId: 'keep',
      queued: true,
    })),
    addAutoDispatchNote: vi.fn(),
    onDispatchTerminal: (listener) => {
      terminalListeners.push(listener)
      return () => {
        const index = terminalListeners.indexOf(listener)
        if (index >= 0) terminalListeners.splice(index, 1)
      }
    },
  }
  const service = new AutoDispatchService(db, gateway, roster, ledger)
  const emitTerminal = (event: {
    sessionId: string
    reason: 'cancelled' | 'abandoned' | 'failed'
    dispatchIds: string[]
    at?: string
  }) => {
    for (const listener of [...terminalListeners]) {
      listener({ at: at, ...event })
    }
  }
  const planner = new AutoDispatchPlanService(
    {
      listCrews: roster.list,
      currentView: (id) => ledger.currentView(id),
      firstDispatchSeenAt: gateway.firstDispatchSeenAt,
      describeSeatAvailability: (id) => gateway.describeSeatAvailability(id),
      describeLane: (path) => gateway.describeLane(path),
      findWire: gateway.findWire,
    },
    (id) => service.records(id),
  )
  let page: TrackerIssue[] = [
    trackerIssue({
      id: 'i',
      identifier: 'MAR-1',
      title: 'Build it',
      groomed: true,
      grounded: true,
      dispatch: true,
      logicalStatus: 'todo',
      status: 'Todo',
    }),
  ]
  let clock = new Date(at)
  const watcher = new TrackerWatcherService({
    crews,
    ledger,
    dispatchPlanner: planner,
    autoDispatcher: service,
    resolveKey: async () => 'fixture',
    createAdapter: () => ({
      probe: async () => ({
        ok: true,
        issues: page.length,
        projectName: 'Loom',
      }),
      resolveProject: async () => ({ kind: 'not-found' }),
      listLabeledIssues: async () => page,
      readIssueBodies: async () => new Map(),
      listOutsideIssues: async () => ({ issues: [], more: false }),
    }),
    broadcast: vi.fn(),
    now: () => clock,
  })
  const observe = () =>
    ledger.append(
      diffTrackerSnapshot({
        crewId,
        current: ledger.currentView(crewId),
        issues: page,
        seenAt: clock.toISOString(),
      }),
    )
  const act = async () => {
    observe()
    await service.act(crewId, await planner.refresh(crewId, at), at)
  }
  return {
    db,
    crewId,
    crews,
    ledger,
    seat,
    master,
    relays,
    wire,
    gateway,
    service,
    planner,
    roster,
    emitTerminal,
    enable: () =>
      crews.setTrackerBinding(crewId, { projectId: 'p', autoDispatch: true }),
    busy: (value: SeatAvailability) => {
      availability = value
    },
    page: (change: (current: TrackerIssue[]) => TrackerIssue[]) => {
      page = change(page)
    },
    act,
    observe,
    tick: async () => {
      await watcher.tick()
      clock = new Date(clock.getTime() + 60_000)
    },
  }
}

it('R1 watcher stays off over three ticks, then sends once and publishes the receipt word', async () => {
  const b = bench()
  for (let i = 0; i < 3; i++) await b.tick()
  expect(b.gateway.sendMessageWithOpener).not.toHaveBeenCalled()
  expect(b.service.records(b.crewId)).toEqual([])
  expect(b.planner.cached(b.crewId)?.words.i.kind).toBe('would-start')
  b.enable()
  await b.tick()
  await b.tick()
  expect(b.gateway.sendMessageWithOpener).toHaveBeenCalledTimes(1)
  expect(b.planner.cached(b.crewId)?.words.i.kind).toBe('sent')
})
it('lap 3 B plan autoDispatch equals the persisted crew binding off and on', async () => {
  const b = bench()
  b.observe()
  expect((await b.planner.refresh(b.crewId, at)).autoDispatch).toBe(false)
  b.enable()
  expect((await b.planner.refresh(b.crewId, at)).autoDispatch).toBe(true)
  b.crews.setTrackerBinding(b.crewId, { projectId: 'p', autoDispatch: false })
  expect((await b.planner.refresh(b.crewId, at)).autoDispatch).toBe(false)
})

it('lap 3 C another crew record neither marks this issue sent nor holds this seat', async () => {
  const b = bench()
  b.enable()
  const other = b.crews.create({ name: 'Other crew' })
  b.crews.setTrackerBinding(other.id, { projectId: 'p', autoDispatch: true })
  b.db
    .prepare(
      `INSERT INTO auto_dispatches
    (id, crew_id, issue_id, lap, seat, session_id, wire_id, sent_at, delivery, receipt)
    VALUES ('other-row', ?, 'i', 1, 'opus', 'other-seat', 'other-wire', ?, 'turn', 'other-receipt')`,
    )
    .run(other.id, at)
  b.observe()
  expect(b.service.records(b.crewId)).toEqual([])
  const plan = await b.planner.refresh(b.crewId, at)
  expect(plan.words.i.kind).toBe('would-start')
  await b.service.act(b.crewId, plan, at)
  expect(b.gateway.sendMessageWithOpener).toHaveBeenCalledTimes(1)
  expect(b.service.records(b.crewId)).toHaveLength(1)
  expect(b.service.records(other.id)).toHaveLength(1)
})

const unconfirmedReason =
  "delivery unconfirmed — the app stopped mid-send; check the seat's conversation before you set the label again"

it('lap 3 R16 an unconfirmed claim is marked next tick and released only by the label path', async () => {
  const b = bench()
  b.enable()
  const other = b.crews.create({ name: 'Other crew' })
  const insert = b.db.prepare(`INSERT INTO auto_dispatches
    (id, crew_id, issue_id, lap, seat, session_id, wire_id, sent_at, delivery)
    VALUES (?, ?, 'i', 1, 'opus', 's', 'wire', ?, 'turn')`)
  insert.run('stopped', b.crewId, at)
  insert.run('other-stopped', other.id, at)
  await b.tick()
  expect(b.service.records(b.crewId)[0].error).toBe(unconfirmedReason)
  expect(b.planner.cached(b.crewId)?.words.i).toEqual({
    kind: 'send-failed',
    reason: unconfirmedReason,
  })
  expect(b.service.records(other.id)[0].error).toBeNull()
  await b.tick()
  expect(b.gateway.sendMessageWithOpener).not.toHaveBeenCalled()
  b.page((page) => page.map((i) => ({ ...i, dispatch: false })))
  await b.tick()
  expect(b.service.records(b.crewId)).toEqual([])
  b.page((page) => page.map((i) => ({ ...i, dispatch: true })))
  await b.tick()
  expect(b.gateway.sendMessageWithOpener).toHaveBeenCalledTimes(1)
  expect(b.service.records(b.crewId)[0].error).toBeNull()
})

it('lap 3 R16 a post-send receipt UPDATE failure becomes unconfirmed on the next tick', async () => {
  const b = bench()
  b.enable()
  b.db
    .exec(`CREATE TRIGGER fail_receipt BEFORE UPDATE OF receipt ON auto_dispatches
    BEGIN SELECT RAISE(FAIL, 'receipt write failed'); END`)
  await expect(b.act()).rejects.toThrow('receipt write failed')
  expect(b.service.records(b.crewId)[0].error).toBeNull()
  b.db.exec('DROP TRIGGER fail_receipt')
  await b.tick()
  expect(b.planner.cached(b.crewId)?.words.i).toEqual({
    kind: 'send-failed',
    reason: unconfirmedReason,
  })
  expect(b.gateway.sendMessageWithOpener).toHaveBeenCalledTimes(1)
})

it('lap 3 R16 rows inserted in an active tick stay unmarked, including an overlapping act', async () => {
  const b = bench()
  b.enable()
  b.observe()
  const plan = await b.planner.refresh(b.crewId, at)
  let finish!: () => void
  vi.mocked(b.gateway.sendMessageWithOpener).mockImplementation(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve
    })
    return {
      openerDispatchId: 'opener',
      payloadDispatchId: 'payload',
      openerQueued: false,
    }
  })
  const active = b.service.act(b.crewId, plan, at)
  try {
    expect(b.service.records(b.crewId)[0].error).toBeNull()
    await b.service.act(b.crewId, plan, at)
    expect(b.service.records(b.crewId)[0].error).toBeNull()
  } finally {
    finish()
    await active
  }
  expect(b.gateway.sendMessageWithOpener).toHaveBeenCalledTimes(1)
  expect(b.service.records(b.crewId)[0].error).toBeNull()
})

it('lap 3 E quiet ticks check each lane once and sending ticks check each lane twice', async () => {
  const b = bench()
  const seats = b.roster.list()[0].members.length
  await b.tick()
  expect(b.gateway.describeLane).toHaveBeenCalledTimes(seats)
  vi.mocked(b.gateway.describeLane).mockClear()
  b.enable()
  await b.tick()
  expect(b.gateway.sendMessageWithOpener).toHaveBeenCalledTimes(1)
  expect(b.gateway.describeLane).toHaveBeenCalledTimes(seats * 2)
  vi.mocked(b.gateway.describeLane).mockClear()
  await b.tick()
  expect(b.gateway.describeLane).toHaveBeenCalledTimes(seats)
})

it('lap 3 E act reports inserts, recovery and deletion but not no-op ticks', async () => {
  const b = bench()
  b.observe()
  const act = async () =>
    b.service.act(b.crewId, await b.planner.refresh(b.crewId, at), at)
  expect(await act()).toBe(false)
  b.enable()
  expect(await act()).toBe(true)
  expect(await act()).toBe(false)
  b.db.prepare('UPDATE auto_dispatches SET receipt = NULL').run()
  expect(await act()).toBe(true)
  expect(await act()).toBe(false)
  b.page((page) => page.map((i) => ({ ...i, dispatch: false })))
  b.observe()
  expect(await act()).toBe(true)
  expect(b.service.records(b.crewId)).toEqual([])
  expect(await act()).toBe(false)
})

it('R1 migrations default to off and unpaused, with exact durable record columns and unique claim', () => {
  const b = bench()
  const crewColumn = b.db.prepare('PRAGMA table_info(session_crews)').all() as {
    name: string
    dflt_value: string
    notnull: number
  }[]
  expect(
    crewColumn.find((c) => c.name === 'tracker_auto_dispatch'),
  ).toMatchObject({ dflt_value: '0', notnull: 1 })
  const memberColumn = b.db
    .prepare('PRAGMA table_info(session_crew_members)')
    .all() as { name: string; dflt_value: string; notnull: number }[]
  expect(memberColumn.find((c) => c.name === 'paused')).toMatchObject({
    dflt_value: '0',
    notnull: 1,
  })
  const columns = b.db.prepare('PRAGMA table_info(auto_dispatches)').all() as {
    name: string
  }[]
  expect(columns.map((c) => c.name)).toEqual([
    'id',
    'crew_id',
    'issue_id',
    'lap',
    'seat',
    'session_id',
    'wire_id',
    'sent_at',
    'delivery',
    'receipt',
    'error',
  ])
})
it('R2 the row precedes a throwing send; no retry, and a duplicate insert throws', async () => {
  const b = bench()
  b.enable()
  vi.mocked(b.gateway.sendMessageWithOpener).mockImplementation(async () => {
    expect(b.service.records(b.crewId)).toHaveLength(1)
    throw new Error('wire failed')
  })
  await b.act()
  await b.act()
  expect(b.gateway.sendMessageWithOpener).toHaveBeenCalledTimes(1)
  expect(b.service.records(b.crewId)[0].error).toBe('wire failed')
  expect(() =>
    b.db
      .prepare(
        `INSERT INTO auto_dispatches SELECT 'duplicate', crew_id, issue_id, lap, seat, session_id, wire_id, sent_at, delivery, receipt, error FROM auto_dispatches`,
      )
      .run(),
  ).toThrow()
})
it('R2 reopening SQLite with a persisted claim cannot send a second time', async () => {
  const root = mkdtempSync(join(tmpdir(), 'auto-dispatch-reopen-'))
  try {
    const path = join(root, 'test.sqlite')
    const b = bench(path)
    b.enable()
    await b.act()
    closeDatabase()
    resetDatabase()
    const next = bench(path)
    next.enable()
    expect(next.service.records(next.crewId)).toHaveLength(1)
    await next.act()
    expect(next.gateway.sendMessageWithOpener).not.toHaveBeenCalled()
    expect(next.gateway.deliverRelayMessage).not.toHaveBeenCalled()
  } finally {
    closeDatabase()
    resetDatabase()
    rmSync(root, { recursive: true, force: true })
  }
})
it('R3 seat starts a turn while the async lane reader resolves: no claim or send', async () => {
  const b = bench()
  b.enable()
  vi.mocked(b.gateway.describeLane).mockImplementation(async () => {
    await Promise.resolve()
    b.busy('turn')
    return 'clean'
  })
  await b.act()
  expect(b.service.records(b.crewId)).toEqual([])
  expect(b.gateway.sendMessageWithOpener).not.toHaveBeenCalled()
  expect((await b.planner.refresh(b.crewId, at)).words.i).toEqual({
    kind: 'seat-busy',
    why: 'turn',
  })
})
it('R4 opener carries wire text, role card, inherited account and payload receipt; R9 notes only the mastermind', async () => {
  const b = bench()
  b.enable()
  await b.act()
  expect(b.gateway.sendMessageWithOpener).toHaveBeenCalledWith('s', {
    opener: '/clear',
    providerAccountId: 'last-account',
    text: `You are the horse.\n\nDo the work.\n\nIssue: ${b.ledger.currentView(b.crewId)[0].issueUrl}\nRead the body first; it is the whole brief. Lap 1 of 6.\nYour reply's last line is exactly: BATON: fable`,
  })
  expect(b.gateway.listByProvider).toHaveBeenCalledWith('codex')
  expect(
    b.db.prepare('SELECT delivery, receipt FROM auto_dispatches').get(),
  ).toEqual({ delivery: 'turn', receipt: 'payload' })
  expect(b.gateway.addAutoDispatchNote).toHaveBeenCalledExactlyOnceWith(
    'm',
    `Auto-dispatched MAR-1 "Build it" → opus at ${autoDispatchTime(at)} (lap 1)`,
  )
  expect(b.gateway.deliverRelayMessage).not.toHaveBeenCalled()
})
it('R4 keep wire uses the relay message door, default account fallback and queued receipt', async () => {
  const b = bench()
  b.enable()
  b.relays.update(b.wire.id, { opener: null })
  vi.mocked(b.gateway.getLastTurnProviderAccountId).mockReturnValue('gone')
  await b.act()
  expect(b.gateway.sendMessageWithOpener).not.toHaveBeenCalled()
  expect(b.gateway.deliverRelayMessage).toHaveBeenCalledWith(
    's',
    expect.objectContaining({ providerAccountId: 'default-account' }),
  )
  expect(
    b.db.prepare('SELECT delivery, receipt FROM auto_dispatches').get(),
  ).toEqual({ delivery: 'queued', receipt: 'keep' })
})
it('R4 disarmed or replaced wire between plan and send leaves no claim', async () => {
  const b = bench()
  b.enable()
  b.observe()
  const plan = await b.planner.refresh(b.crewId, at)
  b.relays.setArmed(b.wire.id, false)
  await b.service.act(b.crewId, plan, at)
  expect(b.service.records(b.crewId)).toEqual([])
  b.relays.create({
    crewId: b.crewId,
    action: 'hail',
    sourceSessionId: 'm',
    targetSessionId: 's',
  })
  await b.service.act(b.crewId, plan, at)
  expect(b.service.records(b.crewId)).toEqual([])
})
it('R5 pause gates the backend even when changed after planning', async () => {
  const b = bench()
  b.enable()
  b.observe()
  const plan = await b.planner.refresh(b.crewId, at)
  b.seat.paused = true
  await b.service.act(b.crewId, plan, at)
  expect(b.gateway.sendMessageWithOpener).not.toHaveBeenCalled()
  expect(b.service.records(b.crewId)).toEqual([])
  expect((await b.planner.refresh(b.crewId, at)).words.i.kind).toBe(
    'seat-paused',
  )
})
it('R6 sent work holds capacity across two ticks until picked up', async () => {
  const b = bench()
  b.enable()
  await b.tick()
  b.page((page) => [...page, { ...page[0], id: 'second', identifier: 'MAR-2' }])
  await b.tick()
  expect(b.gateway.sendMessageWithOpener).toHaveBeenCalledTimes(1)
  expect(b.planner.cached(b.crewId)?.words.i.kind).toBe('sent')
  expect(b.planner.cached(b.crewId)?.words.second).toEqual({
    kind: 'queued-behind',
    identifier: 'MAR-1',
  })
  b.page((page) =>
    page.map((i) =>
      i.id === 'i'
        ? { ...i, logicalStatus: 'in-progress', status: 'In Progress' }
        : i,
    ),
  )
  await b.tick()
  expect(b.planner.cached(b.crewId)?.words.i).toBeUndefined()
})
it('R7 failed sends wait for observed label removal; delivered rows survive removal and readdition', async () => {
  const b = bench()
  b.enable()
  vi.mocked(b.gateway.sendMessageWithOpener).mockRejectedValueOnce(
    new Error('offline'),
  )
  await b.tick()
  await b.tick()
  expect(b.gateway.sendMessageWithOpener).toHaveBeenCalledTimes(1)
  expect(b.planner.cached(b.crewId)?.words.i).toEqual({
    kind: 'send-failed',
    reason: 'offline',
  })
  expect(b.gateway.addAutoDispatchNote).toHaveBeenCalledWith(
    'm',
    'Auto-dispatch of MAR-1 → opus failed: offline',
  )
  b.page((page) => page.map((i) => ({ ...i, dispatch: false })))
  await b.tick()
  expect(b.service.records(b.crewId)).toEqual([])
  b.page((page) => page.map((i) => ({ ...i, dispatch: true })))
  await b.tick()
  expect(b.gateway.sendMessageWithOpener).toHaveBeenCalledTimes(2)
  b.page((page) => page.map((i) => ({ ...i, dispatch: false })))
  await b.tick()
  b.page((page) => page.map((i) => ({ ...i, dispatch: true })))
  await b.tick()
  expect(b.gateway.sendMessageWithOpener).toHaveBeenCalledTimes(2)
  expect(b.service.records(b.crewId)).toHaveLength(1)
})
it('R8 gateway keys cannot grow a stop, steer, interrupt or mastermind message door', () => {
  expectTypeOf<keyof AutoDispatchGateway>().toEqualTypeOf<
    | 'describeSeatAvailability'
    | 'findWire'
    | 'describeLane'
    | 'firstDispatchSeenAt'
    | 'getLastTurnProviderAccountId'
    | 'listByProvider'
    | 'sendMessageWithOpener'
    | 'deliverRelayMessage'
    | 'addAutoDispatchNote'
    | 'onDispatchTerminal'
  >()
  expect(Object.keys(bench().gateway).sort()).toEqual([
    'addAutoDispatchNote',
    'deliverRelayMessage',
    'describeLane',
    'describeSeatAvailability',
    'findWire',
    'firstDispatchSeenAt',
    'getLastTurnProviderAccountId',
    'listByProvider',
    'onDispatchTerminal',
    'sendMessageWithOpener',
  ])
})

it('MAR-3298 R4 a failed terminal for a sent receipt stamps send-failed; label path retries', async () => {
  const b = bench()
  b.enable()
  await b.act()
  expect(b.service.records(b.crewId)).toEqual([
    { issueId: 'i', lap: 1, sentAt: at, error: null },
  ])
  b.emitTerminal({
    sessionId: 's',
    reason: 'failed',
    dispatchIds: ['payload'],
  })
  expect(b.service.records(b.crewId)[0].error).toBe(
    'the delivery failed before the seat took it',
  )
  await b.tick()
  expect(b.planner.cached(b.crewId)?.words.i).toEqual({
    kind: 'send-failed',
    reason: 'the delivery failed before the seat took it',
  })
  expect(b.gateway.sendMessageWithOpener).toHaveBeenCalledTimes(1)
  b.page((page) => page.map((i) => ({ ...i, dispatch: false })))
  await b.tick()
  expect(b.service.records(b.crewId)).toEqual([])
  b.page((page) => page.map((i) => ({ ...i, dispatch: true })))
  await b.tick()
  expect(b.gateway.sendMessageWithOpener).toHaveBeenCalledTimes(2)
})

it('MAR-3298 R4 a cancelled terminal stamps cancelled; an unknown receipt is ignored', async () => {
  const b = bench()
  b.enable()
  await b.act()
  b.emitTerminal({
    sessionId: 's',
    reason: 'cancelled',
    dispatchIds: ['payload'],
  })
  expect(b.service.records(b.crewId)[0].error).toBe(
    'the queued delivery was cancelled',
  )
  b.emitTerminal({
    sessionId: 's',
    reason: 'failed',
    dispatchIds: ['unknown-receipt'],
  })
  expect(b.service.records(b.crewId)[0].error).toBe(
    'the queued delivery was cancelled',
  )
})

it('MAR-3298 R4 a settled row with an error already set is not overwritten', async () => {
  const b = bench()
  b.enable()
  await b.act()
  b.emitTerminal({
    sessionId: 's',
    reason: 'failed',
    dispatchIds: ['payload'],
  })
  b.emitTerminal({
    sessionId: 's',
    reason: 'abandoned',
    dispatchIds: ['payload'],
  })
  expect(b.service.records(b.crewId)[0].error).toBe(
    'the delivery failed before the seat took it',
  )
})

it('MAR-3298 lap 2 B: a terminal before the receipt UPDATE is reconciled — drop the reconcile turns red', async () => {
  const b = bench()
  b.enable()
  b.observe()
  const plan = await b.planner.refresh(b.crewId, at)
  vi.mocked(b.gateway.sendMessageWithOpener).mockImplementation(async () => {
    b.emitTerminal({
      sessionId: 's',
      reason: 'failed',
      dispatchIds: ['early-payload'],
    })
    return {
      openerDispatchId: 'opener',
      payloadDispatchId: 'early-payload',
      openerQueued: false,
    }
  })
  await b.service.act(b.crewId, plan, at)
  expect(b.service.records(b.crewId)[0].error).toBe(
    'the delivery failed before the seat took it',
  )
})

it('MAR-3298 lap 2 E: each terminal word is a sentence — store the raw reason turns red', async () => {
  const b = bench()
  b.enable()
  await b.act()
  b.emitTerminal({
    sessionId: 's',
    reason: 'abandoned',
    dispatchIds: ['payload'],
  })
  expect(b.service.records(b.crewId)[0].error).toBe(
    "the seat's conversation was deleted",
  )
  expect(b.service.records(b.crewId)[0].error).not.toBe('abandoned')
  expect(b.service.records(b.crewId)[0].error).not.toBe('failed')
  expect(b.service.records(b.crewId)[0].error).not.toBe('cancelled')
})
it('R8 missing dispatch label sends nothing; later laps stay manual', async () => {
  const b = bench()
  b.enable()
  b.page((page) => page.map((i) => ({ ...i, dispatch: false })))
  await b.act()
  expect(b.gateway.sendMessageWithOpener).not.toHaveBeenCalled()
  b.page((page) => page.map((i) => ({ ...i, dispatch: true })))
  b.observe()
  b.db.prepare('UPDATE work_ledger SET lap = 2').run()
  const plan = await b.planner.refresh(b.crewId, at)
  expect(plan.words.i).toEqual({ kind: 'later-lap', lap: 2 })
  await b.service.act(b.crewId, plan, at)
  // The act still refuses a stale or incorrect promise as its second wall.
  await b.service.act(
    b.crewId,
    {
      ...plan,
      order: { opus: ['i'] },
      words: { i: { kind: 'would-start', wire: b.wire } },
    },
    at,
  )
  expect(b.gateway.sendMessageWithOpener).not.toHaveBeenCalled()
  expect(b.gateway.deliverRelayMessage).not.toHaveBeenCalled()
  expect(b.service.records(b.crewId)).toEqual([])
})
it('R12 changing own-worktree to main judges the conversation directory despite stored path', async () => {
  const b = bench()
  b.observe()
  await b.planner.refresh(b.crewId, at)
  expect(b.gateway.describeLane).toHaveBeenCalledWith('/lane')
  vi.mocked(b.gateway.describeLane).mockClear()
  b.seat.lanePolicy = 'main'
  b.master.lanePolicy = 'main'
  await b.planner.refresh(b.crewId, at)
  expect(b.gateway.describeLane).toHaveBeenCalledWith('/conversation')
  expect(b.gateway.describeLane).not.toHaveBeenCalledWith('/lane')
})
it('R13 real SessionService failed last turn becomes seat-failed and sends nothing', async () => {
  const b = bench()
  b.enable()
  const sessions = new SessionService(
    b.db,
    new LocalExecutionHost(new ProviderRegistry()),
    tmpdir(),
  )
  b.db
    .prepare(
      "INSERT INTO projects(id,name,repository_path) VALUES ('p','fixture',?)",
    )
    .run(tmpdir())
  const s = sessions.create({
    projectId: 'p',
    workspaceId: null,
    providerId: 'codex',
    name: 'seat',
    model: null,
    effort: null,
  })
  b.seat.sessionId = s.id
  b.db.prepare("UPDATE sessions SET status = 'failed' WHERE id = ?").run(s.id)
  b.relays.create({
    action: 'hail',
    crewId: b.crewId,
    sourceSessionId: 'm',
    targetSessionId: s.id,
  })
  b.gateway.describeSeatAvailability = (id) =>
    sessions.describeSeatAvailability(id)
  await b.act()
  expect(b.planner.cached(b.crewId)?.words.i.kind).toBe('seat-failed')
  expect(b.gateway.sendMessageWithOpener).not.toHaveBeenCalled()
  expect(b.gateway.deliverRelayMessage).not.toHaveBeenCalled()
  expect(b.service.records(b.crewId)).toEqual([])
})

it('R9 real note door adds one informational transcript item without a turn', () => {
  const b = bench()
  const host = new LocalExecutionHost(new ProviderRegistry())
  const start = vi.spyOn(host, 'start')
  const sessions = new SessionService(b.db, host, tmpdir())
  b.db
    .prepare(
      "INSERT INTO projects(id,name,repository_path) VALUES ('p','fixture',?)",
    )
    .run(tmpdir())
  const seat = sessions.create({
    projectId: 'p',
    workspaceId: null,
    providerId: 'codex',
    name: 'mastermind',
    model: null,
    effort: null,
  })
  sessions.addAutoDispatchNote(seat.id, 'Auto-dispatched MAR-1')
  expect(sessions.getConversation(seat.id)).toEqual([
    expect.objectContaining({
      kind: 'note',
      level: 'info',
      turnId: null,
      text: 'Auto-dispatched MAR-1',
      providerMeta: expect.objectContaining({
        providerEventType: 'auto-dispatch',
      }),
    }),
  ])
  expect(start).not.toHaveBeenCalled()
  expect(b.db.prepare('SELECT count(*) AS n FROM session_turns').get()).toEqual(
    { n: 0 },
  )
})
it('R5 pause persists through the existing crew seat door and clears again', () => {
  const b = bench()
  b.db
    .prepare(
      "INSERT INTO session_crew_members(crew_id, session_id) VALUES (?, 's')",
    )
    .run(b.crewId)
  expect(b.crews.getById(b.crewId)?.members[0].paused).toBe(false)
  expect(
    b.crews.setMemberSeat(b.crewId, { sessionId: 's' }, { paused: true })
      .members[0].paused,
  ).toBe(true)
  expect(
    b.crews.setMemberSeat(b.crewId, { sessionId: 's' }, { paused: false })
      .members[0].paused,
  ).toBe(false)
})

it('R2 two concurrent acts using the same plan lose one durable claim and send once', async () => {
  const b = bench()
  b.enable()
  b.observe()
  const plan = await b.planner.refresh(b.crewId, at)
  await Promise.all([
    b.service.act(b.crewId, plan, at),
    b.service.act(b.crewId, plan, at),
  ])
  expect(b.gateway.sendMessageWithOpener).toHaveBeenCalledTimes(1)
  expect(b.service.records(b.crewId)).toHaveLength(1)
})
