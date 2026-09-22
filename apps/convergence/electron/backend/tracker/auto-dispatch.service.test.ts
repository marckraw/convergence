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
  }
  const service = new AutoDispatchService(db, gateway, roster, ledger)
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
    'sendMessageWithOpener',
  ])
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
  await b.service.act(b.crewId, await b.planner.refresh(b.crewId, at), at)
  expect(b.gateway.sendMessageWithOpener).not.toHaveBeenCalled()
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
