import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { WorkLedgerService } from '../work-ledger/work-ledger.service'
import { CrewService } from '../crew/crew.service'
import { RelayService } from '../relay/relay.service'
import { GitService } from '../git/git.service'
import { SessionService } from '../session/session.service'
import { SessionQueuedInputService } from '../session/session-queued-input.service'
import { ProviderRegistry } from '../provider/provider-registry'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import {
  AutoDispatchPlanService,
  type AutoDispatchPlanDeps,
} from './auto-dispatch-plan.service'
import { TrackerWatcherService } from './tracker-watcher.service'
import { trackerIssue } from './linear-tracker.fixture'
import { diffTrackerSnapshot } from './tracker-watcher.pure'
import type { WorkLedgerSnapshot } from '../../../src/shared/types/tracker.types'

beforeEach(() => {
  getDatabase()
})
afterEach(() => {
  vi.useRealTimers()
  closeDatabase()
  resetDatabase()
})
const issue = trackerIssue({
  id: 'i',
  identifier: 'MAR-1',
  logicalStatus: 'todo',
  status: 'Todo',
  groomed: true,
  grounded: true,
  dispatch: true,
})
const at = (n: number) => `2026-09-21T00:0${n}:00.000Z`

it('R3 first dispatch survives reobservation and label removal/readdition in real SQLite', () => {
  const ledger = new WorkLedgerService(getDatabase())
  for (const [n, dispatch] of [
    [1, true],
    [5, true],
    [6, false],
    [7, true],
  ] as const) {
    ledger.append(
      diffTrackerSnapshot({
        crewId: 'c',
        current: [],
        issues: [{ ...issue, dispatch }],
        seenAt: at(n),
      }),
    )
    expect(ledger.firstDispatchSeenAt('c').get('i')).toBe(at(1))
  }
  expect(ledger.firstDispatchSeenAt('other').size).toBe(0)
})
it('R5 only an armed wire in this crew to a resident target is found', () => {
  const relays = new RelayService(getDatabase())
  const other = relays.create({
    action: 'hail',
    crewId: 'other',
    sourceSessionId: 'm',
    targetSessionId: 's',
  })
  expect(relays.findWire('c', 'm', 's')).toBeNull()
  const wire = relays.create({
    action: 'hail',
    crewId: 'c',
    sourceSessionId: 'm',
    targetSessionId: 's',
    opener: '/clear',
  })
  expect(relays.findWire('c', 'm', 's')).toMatchObject({
    id: wire.id,
    opener: '/clear',
  })
  expect(relays.findWire('c', 's', 'm')).toBeNull()
  relays.setArmed(wire.id, false)
  expect(relays.findWire('c', 'm', 's')).toBeNull()
  expect(relays.findWire('other', 'm', 's')?.id).toBe(other.id)
})
it('R6 real clone, untracked dirt, unpushed commit, failed git and missing path', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dispatch-lane-'))
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, stdio: 'pipe' })
  try {
    git(root, 'init', 'source')
    const source = join(root, 'source'),
      lane = join(root, 'lane')
    git(
      source,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '--allow-empty',
      '-m',
      'base',
    )
    git(root, 'clone', source, lane)
    const service = new GitService()
    expect(await service.describeLane(lane)).toBe('clean')
    writeFileSync(join(lane, 'untracked'), 'test')
    expect(await service.describeLane(lane)).toBe('dirty')
    git(lane, 'add', 'untracked')
    git(
      lane,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '-m',
      'local',
    )
    expect(await service.describeLane(lane)).toBe('unpushed')
    expect(await service.describeLane(root)).toBe('unknown')
    expect(await service.describeLane(join(root, 'missing'))).toBe('unknown')
    expect(await service.describeLane('')).toBe('unknown')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
it('R4 reader covers idle, missing, completed with dispatching input, compacting, drill and attention without writes', () => {
  const db = getDatabase()
  const service = new SessionService(
    db,
    new LocalExecutionHost(new ProviderRegistry()),
    tmpdir(),
  )
  db.prepare(
    "INSERT INTO projects(id,name,repository_path) VALUES ('p','fixture',?)",
  ).run(tmpdir())
  const id = service.create({
    projectId: 'p',
    workspaceId: null,
    providerId: 'codex',
    name: 'seat',
    model: null,
    effort: null,
  }).id
  const queue = new SessionQueuedInputService(db)
  expect(service.describeSeatAvailability('missing')).toBe('unknown')
  expect(service.describeSeatAvailability(id)).toBe('idle')
  db.prepare("UPDATE sessions SET status = 'completed' WHERE id = ?").run(id)
  const input = queue.enqueue(id, { text: 'waiting' }, 'follow-up')
  expect(service.describeSeatAvailability(id)).toBe('turn')
  queue.patch(input.id, 'dispatching')
  expect(service.describeSeatAvailability(id)).toBe('turn')
  queue.patch(input.id, 'sent')
  // The runtime sets are controlled facts; no provider or real conversation runs.
  const runtime = service as unknown as {
    compactingSessions: Set<string>
    heldSessions: Set<string>
  }
  runtime.compactingSessions.add(id)
  expect(service.describeSeatAvailability(id)).toBe('compacting')
  runtime.compactingSessions.delete(id)
  runtime.heldSessions.add(id)
  expect(service.describeSeatAvailability(id)).toBe('drill')
  runtime.heldSessions.delete(id)
  for (const attention of ['needs-input', 'needs-approval']) {
    db.prepare('UPDATE sessions SET attention = ? WHERE id = ?').run(
      attention,
      id,
    )
    const before = db.prepare('SELECT total_changes() AS n').get()
    expect(service.describeSeatAvailability(id)).toBe('waiting-on-you')
    expect(db.prepare('SELECT total_changes() AS n').get()).toEqual(before)
  }
})
function bench() {
  const db = getDatabase(),
    crews = new CrewService(db),
    ledger = new WorkLedgerService(db)
  const c = crews.create({ name: 'fixture' })
  crews.setTrackerBinding(c.id, { projectId: 'p' })
  let busy = false
  const seat = {
    sessionId: 's',
    batonName: 'opus',
    canvasX: null,
    canvasY: null,
    role: 'horse' as const,
    kind: 'resident' as const,
    roleCard: null,
    hostPolicy: null,
    lanePolicy: null,
    wipLimit: 1,
    providerId: null,
    model: null,
    conversationMissing: false,
    localWorkingDirectory: '/fixture/lane',
  }
  const deps: AutoDispatchPlanDeps = {
    listCrews: () => [
      {
        id: c.id,
        members: [
          { ...seat, sessionId: 'm', batonName: 'fable', role: 'mastermind' },
          seat,
        ],
      },
    ],
    currentView: (id) => ledger.currentView(id),
    firstDispatchSeenAt: (id) => ledger.firstDispatchSeenAt(id),
    describeSeatAvailability: () => (busy ? 'turn' : 'idle'),
    findWire: () => ({ id: 'wire', opener: null }),
    describeLane: async () => 'clean',
  }
  const planner = new AutoDispatchPlanService(deps)
  return {
    crews,
    ledger,
    crewId: c.id,
    planner,
    deps,
    setBusy: () => {
      busy = true
    },
  }
}
it('R9 reader keys are exactly the approved capability surface', () => {
  expectTypeOf<keyof AutoDispatchPlanDeps>().toEqualTypeOf<
    | 'listCrews'
    | 'currentView'
    | 'firstDispatchSeenAt'
    | 'describeSeatAvailability'
    | 'findWire'
    | 'describeLane'
  >()
  expect(Object.keys(bench().deps).sort()).toEqual([
    'currentView',
    'describeLane',
    'describeSeatAvailability',
    'findWire',
    'firstDispatchSeenAt',
    'listCrews',
  ])
})
it('R6 remote or missing local lane never calls local git and stays unknown', async () => {
  const { deps, crewId } = bench()
  deps.currentView = () =>
    diffTrackerSnapshot({
      crewId,
      current: [],
      issues: [issue],
      seenAt: at(1),
    }).map((e) => ({ ...e, id: 'r' }))
  const crews = deps.listCrews()
  for (const member of crews[0].members) member.localWorkingDirectory = null
  deps.listCrews = () => crews
  deps.describeLane = vi.fn(async () => 'clean' as const)
  const result = await new AutoDispatchPlanService(deps).refresh(crewId, at(1))
  expect(result.words.i).toEqual({ kind: 'lane', state: 'unknown' })
  expect(deps.describeLane).not.toHaveBeenCalled()
})
describe('R7 watcher plan snapshot', () => {
  it('quiet ledger ticks broadcast availability changes; failed plan still appends and broadcasts null', async () => {
    vi.useFakeTimers()
    const { crews, ledger, crewId, planner, deps, setBusy } = bench()
    let clock = new Date(at(1)),
      currentIssue = issue
    const broadcasts: WorkLedgerSnapshot[] = [],
      log = vi.fn()
    const watcher = new TrackerWatcherService({
      crews,
      ledger,
      dispatchPlanner: planner,
      resolveKey: async () => 'fixture',
      createAdapter: () => ({
        probe: async () => ({ ok: true, issues: 1, projectName: 'fixture' }),
        resolveProject: async () => ({ kind: 'not-found' }),
        listLabeledIssues: async () => [currentIssue],
        readIssueBodies: async () => new Map(),
        listOutsideIssues: async () => ({ issues: [], more: false }),
      }),
      broadcast: (s) => broadcasts.push(s),
      now: () => clock,
      log,
    })
    expect(watcher.snapshot(crewId).dispatchPlan).toBeNull()
    await watcher.tick()
    expect(broadcasts.at(-1)?.dispatchPlan?.words.i.kind).toBe('would-start')
    expect(watcher.snapshot(crewId).dispatchPlan).toEqual(
      planner.cached(crewId),
    )
    const rows = ledger.currentView(crewId)
    broadcasts.length = 0
    setBusy()
    clock = new Date(at(2))
    await watcher.tick()
    expect(ledger.currentView(crewId)).toEqual(rows)
    expect(broadcasts).toHaveLength(1)
    expect(broadcasts[0].dispatchPlan?.words.i).toEqual({
      kind: 'seat-busy',
      why: 'turn',
    })
    broadcasts.length = 0
    clock = new Date(at(3))
    await watcher.tick()
    expect(broadcasts).toHaveLength(0)
    deps.describeLane = async () => {
      throw new Error('git fact failed')
    }
    currentIssue = { ...issue, title: 'changed' }
    clock = new Date(at(4))
    await watcher.tick()
    expect(ledger.currentView(crewId)[0].issueTitle).toBe('changed')
    expect(broadcasts.at(-1)?.dispatchPlan).toBeNull()
    expect(watcher.snapshot(crewId).dispatchPlan).toBeNull()
    expect(log).toHaveBeenCalledWith(
      'Dispatch planning failed',
      expect.any(Error),
    )
  })
})
