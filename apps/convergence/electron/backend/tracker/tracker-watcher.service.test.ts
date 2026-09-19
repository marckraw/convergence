import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { CrewService } from '../crew/crew.service'
import { WorkLedgerService } from '../work-ledger/work-ledger.service'
import type { WorkLedgerSnapshot } from '../work-ledger/work-ledger.types'
import {
  TRACKER_BACKGROUND_INTERVAL_MS,
  TRACKER_WATCH_INTERVAL_MS,
} from './tracker-watcher.pure'
import { TrackerWatcherService } from './tracker-watcher.service'
import { createLinearTrackerAdapter } from './linear-tracker.adapter'
import {
  linearIssueBodiesBody,
  linearIssueNode,
  linearIssuesBody,
  linearLabel,
  recordedReply,
  trackerIssue,
} from './linear-tracker.fixture'
import type {
  TrackerOutsideIssue,
  TrackerOutsideSnapshot,
  TrackerReadEvent,
} from '../../../src/shared/types/tracker.types'
import {
  TrackerRefusalError,
  type TrackerAdapter,
  type TrackerBinding,
  type TrackerIssue,
  type TrackerProjectResolution,
  type TrackerRefusal,
} from './tracker.types'

const ISSUE: TrackerIssue = trackerIssue({ id: 'issue-1' })

/** A project with nothing outside the loop (MAR-3236): the port's new read. */
const NO_OUTSIDE: TrackerAdapter['listOutsideIssues'] = async () => ({
  issues: [],
  more: false,
})

function refusal(kind: TrackerRefusal['kind'], retryAt: string | null = null) {
  return new TrackerRefusalError({ kind, message: kind, retryAt })
}

describe('MAR-3084 R7: the tick is a house-rules timer', () => {
  let db: Database.Database
  let crewId: string
  let ledger: WorkLedgerService
  let broadcasts: WorkLedgerSnapshot[]
  let clock: Date

  beforeEach(() => {
    vi.useFakeTimers()
    clock = new Date('2026-09-17T08:00:00.000Z')
    db = getDatabase()
    const crews = new CrewService(db)
    crewId = crews.create({ name: 'Loom' }).id
    crews.setTrackerBinding(crewId, { projectId: 'project-1' })
    ledger = new WorkLedgerService(db)
    broadcasts = []
  })

  afterEach(() => {
    vi.useRealTimers()
    closeDatabase()
    resetDatabase()
  })

  function watcher(listLabeledIssues: TrackerAdapter['listLabeledIssues']) {
    const log = vi.fn()
    const service = new TrackerWatcherService({
      crews: new CrewService(db),
      ledger,
      resolveKey: async () => 'lin_api_fixture',
      createAdapter: () => ({
        probe: async () => ({
          ok: true,
          issues: 0,
          projectName: 'convergence',
        }),
        resolveProject: async () => ({ kind: 'not-found' as const }),
        listLabeledIssues,
        readIssueBodies: async () => new Map<string, string | null>(),
        listOutsideIssues: NO_OUTSIDE,
      }),
      broadcast: (snapshot) => broadcasts.push(snapshot),
      now: () => clock,
      log,
    })
    return { service, log }
  }

  it('fires at once, then every interval; a throw in the middle tick never kills the interval', async () => {
    let calls = 0
    const list = vi.fn(async () => {
      calls += 1
      if (calls === 2) throw new Error('boom inside a tick')
      return [ISSUE]
    })
    const { service, log } = watcher(list)

    const handle = service.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(list).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(TRACKER_WATCH_INTERVAL_MS)
    expect(list).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(TRACKER_WATCH_INTERVAL_MS)
    await vi.advanceTimersByTimeAsync(TRACKER_WATCH_INTERVAL_MS)
    // The fourth still fires.
    expect(list).toHaveBeenCalledTimes(4)
    handle.stop()
  })

  it('a throw outside any crew (the roster read) is logged by the timer and the interval lives on', async () => {
    const crews = new CrewService(db)
    let reads = 0
    const log = vi.fn()
    const list = vi.fn(async () => [ISSUE])
    const service = new TrackerWatcherService({
      crews: {
        list: () => {
          reads += 1
          if (reads === 2) throw new Error('roster unreadable')
          return crews.list()
        },
      },
      ledger,
      resolveKey: async () => 'lin_api_fixture',
      createAdapter: () => ({
        probe: async () => ({
          ok: true,
          issues: 0,
          projectName: 'convergence',
        }),
        resolveProject: async () => ({ kind: 'not-found' as const }),
        listLabeledIssues: list,
        readIssueBodies: async () => new Map<string, string | null>(),
        listOutsideIssues: NO_OUTSIDE,
      }),
      broadcast: () => {},
      now: () => clock,
      log,
    })

    const handle = service.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(TRACKER_WATCH_INTERVAL_MS * 3)
    // Mutation: drop the timer's catch -> an unhandled rejection, red.
    expect(log).toHaveBeenCalledWith('Tick failed', expect.any(Error))
    expect(reads).toBe(4)
    expect(list).toHaveBeenCalledTimes(3)
    handle.stop()
  })

  it('one crew whose read throws does not stop the next crew being read', async () => {
    const crews = new CrewService(db)
    const second = crews.create({ name: 'Second' }).id
    crews.setTrackerBinding(second, { projectId: 'project-2' })
    const list = vi.fn<TrackerAdapter['listLabeledIssues']>(async (input) => {
      if (input.projectId === 'project-1') throw new Error('boom')
      return [ISSUE]
    })
    const { service, log } = watcher(list)

    await expect(service.tick()).resolves.toBeUndefined()
    // Mutation: drop the per-crew catch -> the tick rejects and the second
    // crew is never read.
    expect(list).toHaveBeenCalledTimes(2)
    expect(ledger.list(second)).toHaveLength(1)
    expect(log).toHaveBeenCalledTimes(1)
  })

  it('a 429 backs off until Retry-After, then reads again', async () => {
    const list = vi
      .fn<TrackerAdapter['listLabeledIssues']>()
      .mockRejectedValueOnce(
        refusal('rate-limited', '2026-09-17T08:03:00.000Z'),
      )
      .mockResolvedValue([ISSUE])
    const { service } = watcher(list)

    await service.tick()
    expect(service.trackerHealth(crewId)).toMatchObject({
      state: 'rate-limited',
      backoffUntil: '2026-09-17T08:03:00.000Z',
    })

    clock = new Date('2026-09-17T08:02:00.000Z')
    await service.tick()
    expect(list).toHaveBeenCalledTimes(1)

    clock = new Date('2026-09-17T08:03:00.000Z')
    await service.tick()
    expect(list).toHaveBeenCalledTimes(2)
    expect(service.trackerHealth(crewId)).toMatchObject({ state: 'ok' })
  })

  it('an outage keeps the ledger: the rows are still there and the health says since when', async () => {
    const list = vi
      .fn<TrackerAdapter['listLabeledIssues']>()
      .mockResolvedValueOnce([ISSUE])
      .mockRejectedValue(refusal('unreachable'))
    const { service } = watcher(list)

    await service.tick()
    clock = new Date('2026-09-17T08:01:00.000Z')
    await service.tick()
    clock = new Date('2026-09-17T08:02:00.000Z')
    await service.tick()

    // Mutation: clear the ledger on a refusal -> zero rows, red.
    expect(ledger.list(crewId)).toHaveLength(1)
    expect(broadcasts.at(-1)).toMatchObject({
      crewId,
      entries: [{ issueIdentifier: 'EX-1', state: 'working' }],
      trackerHealth: {
        state: 'unreachable',
        since: '2026-09-17T08:01:00.000Z',
        lastOkAt: '2026-09-17T08:00:00.000Z',
      },
    })
  })

  it('lap 2, A: a truncated read (more pages, no cursor) appends nothing and keeps the rows', async () => {
    // Through the real Linear adapter and parse: page one of a two-issue
    // project, then a first page that claims more but gives no cursor.
    const node = (id: string, identifier: string) =>
      linearIssueNode({
        id,
        identifier,
        state: 'In Progress',
        labels: [linearLabel('opus', 'horse')],
      })
    const replies = [
      linearIssuesBody([node('issue-1', 'EX-1'), node('issue-2', 'EX-2')]),
      linearIssuesBody([node('issue-1', 'EX-1')], {
        hasNextPage: true,
        endCursor: null,
      }),
    ]
    const service = new TrackerWatcherService({
      crews: new CrewService(db),
      ledger,
      resolveKey: async () => 'lin_api_fixture',
      createAdapter: ({ apiKey, binding }) =>
        createLinearTrackerAdapter({
          apiKey,
          binding,
          now: () => clock,
          // The bodies read is its own query (MAR-3190 R4), so the fake
          // answers it as one -- otherwise it would eat the next PAGE reply
          // and this case would measure the wrong thing.
          fetch: async (_url, init) => {
            const sent = JSON.parse(init.body) as { query: string }
            return sent.query.includes('ConvergenceTrackerIssueBodies')
              ? recordedReply(
                  200,
                  linearIssueBodiesBody([{ id: 'issue-1' }, { id: 'issue-2' }]),
                )
              : recordedReply(200, replies.shift())
          },
        }),
      broadcast: () => {},
      now: () => clock,
      log: vi.fn(),
    })

    await service.tick()
    const before = ledger.currentView(crewId)
    expect(before).toHaveLength(2)
    clock = new Date('2026-09-17T08:01:00.000Z')
    await service.tick()

    // Mutation: read `hasNextPage` without a cursor as the last page -> EX-2
    // gets a permanent `unassigned` row, red.
    expect(ledger.currentView(crewId)).toEqual(before)
    expect(service.trackerHealth(crewId)).toMatchObject({
      state: 'bad-response',
      lastOkAt: '2026-09-17T08:00:00.000Z',
    })
  })

  it('lap 2, D: a rate limit with no reset header waits the default, not one interval', async () => {
    const list = vi
      .fn<TrackerAdapter['listLabeledIssues']>()
      .mockRejectedValueOnce(refusal('rate-limited', null))
      .mockResolvedValue([ISSUE])
    const { service } = watcher(list)

    await service.tick()
    clock = new Date('2026-09-17T08:01:00.000Z')
    await service.tick()
    // Mutation: a null backoff -> the second tick reads, red.
    expect(list).toHaveBeenCalledTimes(1)

    clock = new Date('2026-09-17T08:05:00.000Z')
    await service.tick()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('lap 2, F: a read with nothing new broadcasts nothing', async () => {
    const list = vi.fn(async () => [ISSUE])
    const { service } = watcher(list)

    await service.tick()
    expect(broadcasts).toHaveLength(1)
    clock = new Date('2026-09-17T08:01:00.000Z')
    await service.tick()
    // Mutation: broadcast after every read -> two, red.
    expect(broadcasts).toHaveLength(1)

    list.mockResolvedValue([
      { ...ISSUE, logicalStatus: 'in-review', status: 'In Review' },
    ])
    clock = new Date('2026-09-17T08:02:00.000Z')
    await service.tick()
    expect(broadcasts).toHaveLength(2)
  })

  it('lap 2, F: a tick still awaiting its read when the next fires reads once', async () => {
    let release: (issues: TrackerIssue[]) => void = () => {}
    const list = vi.fn(
      () =>
        new Promise<TrackerIssue[]>((resolve) => {
          release = resolve
        }),
    )
    const { service } = watcher(list)

    const handle = service.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(TRACKER_WATCH_INTERVAL_MS * 2)
    // Mutation: drop the `ticking` guard -> three reads, red.
    expect(list).toHaveBeenCalledTimes(1)
    release([ISSUE])
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(TRACKER_WATCH_INTERVAL_MS)
    expect(list).toHaveBeenCalledTimes(2)
    handle.stop()
  })

  it('a crew with no key or no binding is never read', async () => {
    const list = vi.fn(async () => [ISSUE])
    const service = new TrackerWatcherService({
      crews: new CrewService(db),
      ledger,
      resolveKey: async () => null,
      createAdapter: () => ({
        probe: async () => ({
          ok: true,
          issues: 0,
          projectName: 'convergence',
        }),
        resolveProject: async () => ({ kind: 'not-found' as const }),
        listLabeledIssues: list,
        readIssueBodies: async () => new Map<string, string | null>(),
        listOutsideIssues: NO_OUTSIDE,
      }),
      broadcast: () => {},
      now: () => clock,
    })
    new CrewService(db).create({ name: 'Unbound' })
    await service.tick()
    expect(list).not.toHaveBeenCalled()
    await expect(service.probe(crewId)).resolves.toMatchObject({
      ok: false,
      refusal: { kind: 'unauthorized' },
    })
  })
})

describe('MAR-3156 A: the lookup door is where the key is fetched', () => {
  let db: Database.Database
  let crews: CrewService
  let boundCrewId: string
  let unboundCrewId: string

  const KEY = 'lin_api_fixture_not_a_real_key'
  const RESOLVED = {
    kind: 'resolved' as const,
    project: {
      id: '4f6d2a1e-8b3c-4d5e-9f01-2a3b4c5d6e7f',
      name: 'convergence',
      url: 'https://linear.app/marckraw/project/convergence-f66c7ae332ee',
    },
  }

  beforeEach(() => {
    db = getDatabase()
    crews = new CrewService(db)
    boundCrewId = crews.create({ name: 'Loom' }).id
    crews.setTrackerBinding(boundCrewId, { projectId: 'project-1' })
    unboundCrewId = crews.create({ name: 'Unbound' }).id
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  /** The service under test, with the adapter factory watched. */
  function bench(input: { key: string | null }) {
    const resolveProject = vi.fn(async () => RESOLVED)
    const createAdapter = vi.fn(
      (built: { apiKey: string; binding: TrackerBinding }): TrackerAdapter => {
        void built
        return {
          probe: async () => ({
            ok: true,
            issues: 0,
            projectName: 'convergence',
          }),
          listLabeledIssues: async () => [],
          readIssueBodies: async () => new Map<string, string | null>(),
          listOutsideIssues: NO_OUTSIDE,
          resolveProject,
        }
      },
    )
    // Watched, not only stubbed (integration pin, Fable): keys are per crew,
    // so WHOSE key is fetched is a fact a test has to be able to see.
    const resolveKey = vi.fn(async (crewId: string) => {
      void crewId
      return input.key
    })
    const service = new TrackerWatcherService({
      crews: new CrewService(db),
      ledger: new WorkLedgerService(db),
      resolveKey,
      createAdapter,
      broadcast: () => {},
    })
    return { service, createAdapter, resolveProject, resolveKey }
  }

  it('no key stored: a typed refusal, and no adapter is ever built', async () => {
    const { service, createAdapter, resolveProject } = bench({ key: null })

    // Mutation: drop the no-key branch -> an adapter is built with `null` as
    // its key and Linear is asked with no authorization, red here.
    await expect(
      service.resolveProject(boundCrewId, 'convergence'),
    ).resolves.toEqual({
      kind: 'refused',
      refusal: {
        kind: 'unauthorized',
        message: 'No API key is stored for this crew.',
        retryAt: null,
      },
    })
    expect(createAdapter).not.toHaveBeenCalled()
    expect(resolveProject).not.toHaveBeenCalled()
  })

  it('a crew with no binding yet: the lookup-only binding, and the answer passes through', async () => {
    const { service, createAdapter, resolveProject } = bench({ key: KEY })

    // The case this door exists for: finding the id is how the binding gets
    // made, so it has to work before there is one.
    await expect(
      service.resolveProject(unboundCrewId, 'convergence'),
    ).resolves.toEqual(RESOLVED)
    expect(resolveProject).toHaveBeenCalledWith('convergence')
    const built = createAdapter.mock.calls[0]![0]
    expect(built.apiKey).toBe(KEY)
    expect(built.binding.projectId).toBe('')
    expect(built.binding.labelPrefix).toBe('horse:')
  })

  it('a bound crew: the adapter is built with the crew’s own binding', async () => {
    const { service, createAdapter } = bench({ key: KEY })

    await service.resolveProject(boundCrewId, 'convergence')
    expect(createAdapter.mock.calls[0]![0].binding.projectId).toBe('project-1')
  })

  it('the key fetched is THIS crew’s, never another’s', async () => {
    const { service, resolveKey } = bench({ key: KEY })

    await service.resolveProject(boundCrewId, 'convergence')
    // Mutation: fetch the key by anything but the crew id the door was given
    // -> crew A's lookup runs on crew B's Linear key, and this is red.
    expect(resolveKey).toHaveBeenCalledTimes(1)
    expect(resolveKey).toHaveBeenCalledWith(boundCrewId)
  })

  it('the answer carries the resolution and nothing else', async () => {
    const { service } = bench({ key: KEY })

    const answer = await service.resolveProject(boundCrewId, 'convergence')
    // The key is read on this side of the seam and stays here (R5).
    expect(JSON.stringify(answer)).not.toContain(KEY)
    expect(JSON.stringify(answer)).not.toContain('lin_api')
    expect(Object.keys(answer)).toEqual(['kind', 'project'])
  })
})

describe('MAR-3169: an empty page is verified before it is believed', () => {
  let db: Database.Database
  let crewId: string
  let ledger: WorkLedgerService
  let broadcasts: WorkLedgerSnapshot[]
  let clock: Date

  beforeEach(() => {
    db = getDatabase()
    const crews = new CrewService(db)
    crewId = crews.create({ name: 'Loom' }).id
    crews.setTrackerBinding(crewId, { projectId: 'project-1' })
    ledger = new WorkLedgerService(db)
    broadcasts = []
    clock = new Date('2026-09-17T08:00:00.000Z')
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  /**
   * A watcher whose far side answers from two queues the test fills: what
   * the issue list returns this tick, and what the project lookup says.
   */
  function bench() {
    const pages: TrackerIssue[][] = []
    const lookups: TrackerProjectResolution[] = []
    const listLabeledIssues = vi.fn(async () => pages.shift() ?? [])
    const resolveProject = vi.fn(
      async (): Promise<TrackerProjectResolution> =>
        lookups.shift() ?? { kind: 'not-found' },
    )
    const service = new TrackerWatcherService({
      crews: new CrewService(db),
      ledger,
      resolveKey: async () => 'lin_api_fixture',
      createAdapter: () => ({
        probe: async () => ({
          ok: true,
          issues: 0,
          projectName: 'convergence',
        }),
        listLabeledIssues,
        readIssueBodies: async () => new Map<string, string | null>(),
        listOutsideIssues: NO_OUTSIDE,
        resolveProject,
      }),
      broadcast: (snapshot) => broadcasts.push(snapshot),
      now: () => clock,
    })
    return { service, pages, lookups, listLabeledIssues, resolveProject }
  }

  const states = () => ledger.currentView(crewId).map((row) => row.state)
  const RESOLVED: TrackerProjectResolution = {
    kind: 'resolved',
    project: {
      id: 'project-1',
      name: 'convergence',
      url: 'https://linear.app/example/project/convergence-f66c7ae332ee',
    },
  }

  /** One tick that reads ISSUE: the crew now has a `working` row. */
  async function seedWorking(b: ReturnType<typeof bench>) {
    b.pages.push([ISSUE])
    await b.service.tick()
    expect(states()).toEqual(['working'])
  }

  it('R1: a project the key cannot see keeps the rows and names the state', async () => {
    const b = bench()
    await seedWorking(b)

    b.pages.push([])
    b.lookups.push({ kind: 'not-found' })
    clock = new Date('2026-09-17T08:01:00.000Z')
    await b.service.tick()

    // Mutation: skip the verification -> the empty page is believed and the
    // riding row drifts to `unassigned`, red here.
    expect(states()).toEqual(['working'])
    expect(b.service.trackerHealth(crewId)).toMatchObject({
      state: 'project-not-visible',
      since: '2026-09-17T08:01:00.000Z',
      backoffUntil: null,
    })
    // The windows hear it: a changed health is news even with no rows.
    expect(broadcasts.at(-1)?.trackerHealth?.state).toBe('project-not-visible')
    expect(b.resolveProject).toHaveBeenCalledWith('project-1')
  })

  it('R1: an empty page whose project IS there is believed, exactly as before', async () => {
    const b = bench()
    await seedWorking(b)

    b.pages.push([])
    b.lookups.push(RESOLVED)
    await b.service.tick()

    // The label came off: today's behaviour, untouched.
    expect(states()).toEqual(['unassigned'])
    expect(b.service.trackerHealth(crewId)?.state).toBe('ok')
  })

  it('R1: a refusal on the question is the tick’s refusal', async () => {
    const b = bench()
    await seedWorking(b)

    b.pages.push([])
    b.lookups.push({
      kind: 'refused',
      refusal: { kind: 'unreachable', message: 'gone', retryAt: null },
    })
    await b.service.tick()

    // Mutation: treat a refused lookup as "the project is there" -> the row
    // drifts and the health reads ok, red.
    expect(states()).toEqual(['working'])
    expect(b.service.trackerHealth(crewId)?.state).toBe('unreachable')
  })

  it('lap 2, A: a lookup that finds a DIFFERENT id means the bound string is not a project this key can see', async () => {
    // The population this issue exists for: a binding stored before MAR-3156
    // (a pasted URL, a typed name), which the list filters as `project.id eq`
    // and answers empty -- and which the lookup, re-reading its argument as
    // free text, could find BY NAME. The Test asks by id and says "not
    // visible"; the tick has to say the same.
    const b = bench()
    await seedWorking(b)

    b.pages.push([])
    b.lookups.push({
      kind: 'resolved',
      project: {
        id: '4f6d2a1e-8b3c-4d5e-9f01-2a3b4c5d6e7f',
        name: 'project-1',
        url: 'https://linear.app/example/project/project-1-f66c7ae332ee',
      },
    })
    await b.service.tick()

    // Mutation: accept any `resolved` -> the empty page is believed and the
    // riding row drifts to `unassigned`, red here.
    expect(states()).toEqual(['working'])
    expect(b.service.trackerHealth(crewId)?.state).toBe('project-not-visible')
  })

  it('lap 3, A: an upper-case binding and Linear’s lower-case answer are the same project', async () => {
    // A UUID typed or pasted in upper case is bound verbatim; Linear answers
    // with its own lower-case form. Same id -- the quiet page is the truth.
    new CrewService(db).setTrackerBinding(crewId, {
      projectId: '4F6D2A1E-8B3C-4D5E-9F01-2A3B4C5D6E7F',
    })
    const b = bench()
    await seedWorking(b)

    b.pages.push([])
    b.lookups.push({
      kind: 'resolved',
      project: {
        id: '4f6d2a1e-8b3c-4d5e-9f01-2a3b4c5d6e7f',
        name: 'convergence',
        url: 'https://linear.app/example/project/convergence-f66c7ae332ee',
      },
    })
    await b.service.tick()

    // Mutation: compare with a strict `===` -> the project reads as not
    // visible and the row is held back as if the key were blind, red here.
    expect(states()).toEqual(['unassigned'])
    expect(b.service.trackerHealth(crewId)?.state).toBe('ok')
  })

  it('lap 2, A: several projects answering to the bound string is not the project either', async () => {
    const b = bench()
    await seedWorking(b)

    b.pages.push([])
    b.lookups.push({
      kind: 'ambiguous',
      candidates: [
        RESOLVED.kind === 'resolved' ? RESOLVED.project : (null as never),
        {
          id: '7c1b9e04-2f5a-4c8d-b3e6-1d0a9f8e7c6b',
          name: 'project-1',
          url: 'https://linear.app/example/project/project-1-aabbccddeeff',
        },
      ],
    })
    await b.service.tick()

    // Mutation: read `ambiguous` as the project being there -> the row
    // drifts, red here.
    expect(states()).toEqual(['working'])
    expect(b.service.trackerHealth(crewId)?.state).toBe('project-not-visible')
  })

  it('R2: a page with issues in it asks nothing more', async () => {
    const b = bench()
    await seedWorking(b)
    b.pages.push([ISSUE])
    await b.service.tick()

    // Mutation: verify on every tick -> two lookups for two non-empty pages,
    // red on the count.
    expect(b.resolveProject).not.toHaveBeenCalled()
    expect(b.listLabeledIssues).toHaveBeenCalledTimes(2)
  })

  it('R3: the state heals on the next tick that finds the project, with a new `since`', async () => {
    const b = bench()
    await seedWorking(b)

    b.pages.push([])
    b.lookups.push({ kind: 'not-found' })
    clock = new Date('2026-09-17T08:01:00.000Z')
    await b.service.tick()
    expect(b.service.trackerHealth(crewId)?.state).toBe('project-not-visible')

    // Due again at once: no backoff for this state.
    b.pages.push([ISSUE])
    clock = new Date('2026-09-17T08:02:00.000Z')
    await b.service.tick()

    expect(b.listLabeledIssues).toHaveBeenCalledTimes(3)
    expect(b.service.trackerHealth(crewId)).toMatchObject({
      state: 'ok',
      since: '2026-09-17T08:02:00.000Z',
    })
    expect(broadcasts.at(-1)?.trackerHealth?.state).toBe('ok')
    expect(states()).toEqual(['working'])
  })
})

describe('MAR-3190 R4: bodies are read only for issues that changed', () => {
  let db: Database.Database
  let crewId: string
  let ledger: WorkLedgerService
  let clock: Date

  beforeEach(() => {
    clock = new Date('2026-09-17T08:00:00.000Z')
    db = getDatabase()
    const crews = new CrewService(db)
    crewId = crews.create({ name: 'Loom' }).id
    crews.setTrackerBinding(crewId, { projectId: 'project-1' })
    ledger = new WorkLedgerService(db)
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  function watcherReading(
    pages: TrackerIssue[][],
    bodies: Map<string, string | null> = new Map(),
  ) {
    const readIssueBodies = vi.fn(
      async (_ids: readonly string[]) => new Map(bodies),
    )
    const listLabeledIssues = vi.fn(async () => pages.shift() ?? [])
    const service = new TrackerWatcherService({
      crews: new CrewService(db),
      ledger,
      resolveKey: async () => 'lin_api_fixture',
      createAdapter: () => ({
        probe: async () => ({
          ok: true,
          issues: 0,
          projectName: 'convergence',
        }),
        resolveProject: async () => ({ kind: 'not-found' as const }),
        listLabeledIssues,
        readIssueBodies,
        listOutsideIssues: NO_OUTSIDE,
      }),
      broadcast: () => {},
      now: () => clock,
      log: vi.fn(),
    })
    return { service, readIssueBodies }
  }

  it('tick 1 asks for all three, tick 2 for none, and only the mover after that', async () => {
    const page = [
      trackerIssue({ id: 'issue-1', identifier: 'EX-1' }),
      trackerIssue({ id: 'issue-2', identifier: 'EX-2' }),
      trackerIssue({ id: 'issue-3', identifier: 'EX-3' }),
    ]
    const moved = page.map((issue) =>
      issue.id === 'issue-2'
        ? { ...issue, updatedAt: '2026-09-18T09:00:00.000Z' }
        : issue,
    )
    const { service, readIssueBodies } = watcherReading(
      [page, page, moved],
      new Map([
        ['issue-1', '## What\n\nThe first.\n\nGrounded at x · 2026-09-16'],
        ['issue-2', '## What\n\nThe second.'],
        ['issue-3', null],
      ]),
    )

    await service.tick()
    expect(readIssueBodies).toHaveBeenCalledTimes(1)
    expect(readIssueBodies.mock.calls[0]![0]).toEqual([
      'issue-1',
      'issue-2',
      'issue-3',
    ])
    const first = ledger.list(crewId)
    expect(first.find((e) => e.issueId === 'issue-1')?.fact.summary).toBe(
      'The first.',
    )
    expect(first.find((e) => e.issueId === 'issue-1')?.groundedAt).toBe(
      '2026-09-16',
    )
    expect(first.find((e) => e.issueId === 'issue-3')?.fact.summary).toBeNull()

    // Nothing moved: the minute tick stays ONE request.
    // Mutation: ask for every id every tick -> 2 here, red.
    await service.tick()
    expect(readIssueBodies).toHaveBeenCalledTimes(1)

    // One issue's `updatedAt` moves: one id, not three.
    await service.tick()
    expect(readIssueBodies).toHaveBeenCalledTimes(2)
    expect(readIssueBodies.mock.calls[1]![0]).toEqual(['issue-2'])
    // ...and the two that were not asked for keep what the ledger holds.
    // Mutation: read every issue from the bodies map in `applyIssueBodies`
    // -> issue-1's summary is rewritten to null and a row records the loss.
    const after = ledger.list(crewId)
    expect(after.find((e) => e.issueId === 'issue-1')?.fact.summary).toBe(
      'The first.',
    )
    expect(after.find((e) => e.issueId === 'issue-1')?.groundedAt).toBe(
      '2026-09-16',
    )
  })

  it('a refused bodies read appends nothing and sets the health', async () => {
    const readIssueBodies = vi.fn(async () => {
      throw refusal('rate-limited')
    })
    const service = new TrackerWatcherService({
      crews: new CrewService(db),
      ledger,
      resolveKey: async () => 'lin_api_fixture',
      createAdapter: () => ({
        probe: async () => ({
          ok: true,
          issues: 0,
          projectName: 'convergence',
        }),
        resolveProject: async () => ({ kind: 'not-found' as const }),
        listLabeledIssues: async () => [trackerIssue({ id: 'issue-1' })],
        readIssueBodies,
        listOutsideIssues: NO_OUTSIDE,
      }),
      broadcast: () => {},
      now: () => clock,
      log: vi.fn(),
    })

    await service.tick()
    // Mutation: catch the refusal and diff the page anyway -> a row lands
    // with `summary: null` for an issue whose body was never read, and the
    // next tick believes it. Red here twice.
    expect(ledger.list(crewId)).toEqual([])
    expect(service.snapshot(crewId).trackerHealth?.state).toBe('rate-limited')
  })

  it('a quiet project asks for no bodies at all', async () => {
    const { service, readIssueBodies } = watcherReading([[]])
    await service.tick()
    // Mutation: call `readIssueBodies([])` unconditionally -> a request per
    // tick for a project with nothing in it, red.
    expect(readIssueBodies).not.toHaveBeenCalled()
  })
})

describe('MAR-3190 lap 2, B: an updatedAt-only move is read once, not forever', () => {
  let db: Database.Database
  let crewId: string
  let ledger: WorkLedgerService
  let clock: Date

  beforeEach(() => {
    clock = new Date('2026-09-17T08:00:00.000Z')
    db = getDatabase()
    const crews = new CrewService(db)
    crewId = crews.create({ name: 'Loom' }).id
    crews.setTrackerBinding(crewId, { projectId: 'project-1' })
    ledger = new WorkLedgerService(db)
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('four ticks: bodies read on 1 and 3, never again', async () => {
    const still = trackerIssue({ id: 'issue-1', identifier: 'EX-1' })
    // A comment, or a typo fixed in the body: `updatedAt` moves and NOTHING
    // `sameObservation` compares does, so no row is written and the ledger's
    // `updatedAt` stays where it was.
    const moved = { ...still, updatedAt: '2026-09-18T09:00:00.000Z' }
    const pages = [[still], [still], [moved], [moved]]
    const readIssueBodies = vi.fn(
      async (ids: readonly string[]) =>
        new Map<string, string | null>(ids.map((id) => [id, 'The same body'])),
    )
    const service = new TrackerWatcherService({
      crews: new CrewService(db),
      ledger,
      resolveKey: async () => 'lin_api_fixture',
      createAdapter: () => ({
        probe: async () => ({
          ok: true,
          issues: 0,
          projectName: 'convergence',
        }),
        resolveProject: async () => ({ kind: 'not-found' as const }),
        listLabeledIssues: async () => pages.shift() ?? [],
        readIssueBodies,
        listOutsideIssues: NO_OUTSIDE,
      }),
      broadcast: () => {},
      now: () => clock,
      log: vi.fn(),
    })

    await service.tick()
    expect(readIssueBodies).toHaveBeenCalledTimes(1)
    await service.tick()
    expect(readIssueBodies).toHaveBeenCalledTimes(1)

    // The move: one read, and the body says exactly what it said before, so
    // the diff writes nothing and the row keeps its old `updatedAt`.
    await service.tick()
    expect(readIssueBodies).toHaveBeenCalledTimes(2)
    expect(ledger.currentView(crewId)[0]?.fact.updatedAt).toBe(
      '2026-09-17T08:00:00.000Z',
    )

    // The tick that lap 1 never reached. Mutation: drop the in-memory
    // last-read map -> 3 here, and this issue's body is fetched every minute
    // for as long as the app runs.
    await service.tick()
    expect(readIssueBodies).toHaveBeenCalledTimes(2)
  })
})

describe('MAR-3190 lap 2, C: a short bodies reply refuses the tick', () => {
  let db: Database.Database
  let crewId: string
  let ledger: WorkLedgerService
  const clock = new Date('2026-09-17T08:00:00.000Z')

  beforeEach(() => {
    db = getDatabase()
    const crews = new CrewService(db)
    crewId = crews.create({ name: 'Loom' }).id
    crews.setTrackerBinding(crewId, { projectId: 'project-1' })
    ledger = new WorkLedgerService(db)
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('through the real adapter: two answered of three asked appends nothing', async () => {
    const node = (id: string, identifier: string) =>
      linearIssueNode({
        id,
        identifier,
        state: 'In Progress',
        labels: [linearLabel('opus', 'horse')],
      })
    const service = new TrackerWatcherService({
      crews: new CrewService(db),
      ledger,
      resolveKey: async () => 'lin_api_fixture',
      createAdapter: ({ apiKey, binding }) =>
        createLinearTrackerAdapter({
          apiKey,
          binding,
          now: () => clock,
          fetch: async (_url, init) => {
            const sent = JSON.parse(init.body) as { query: string }
            return sent.query.includes('ConvergenceTrackerIssueBodies')
              ? // Three asked, two answered.
                recordedReply(
                  200,
                  linearIssueBodiesBody([
                    { id: 'issue-1', description: 'One' },
                    { id: 'issue-2', description: 'Two' },
                  ]),
                )
              : recordedReply(
                  200,
                  linearIssuesBody([
                    node('issue-1', 'EX-1'),
                    node('issue-2', 'EX-2'),
                    node('issue-3', 'EX-3'),
                  ]),
                )
          },
        }),
      broadcast: () => {},
      now: () => clock,
      log: vi.fn(),
    })

    await service.tick()

    // Mutation: accept the short reply -> three rows land, EX-3's carrying a
    // summary of null for a body nobody ever read, and the next tick believes
    // it because `updatedAt` never moved. Red here twice.
    expect(ledger.currentView(crewId)).toEqual([])
    expect(service.trackerHealth(crewId)).toMatchObject({
      state: 'bad-response',
    })
  })
})

describe('MAR-3227: the tracker is read when it matters', () => {
  const T0 = new Date('2026-09-19T12:00:00.000Z').getTime()
  let db: Database.Database
  let crews: CrewService
  let crewId: string
  let ledger: WorkLedgerService
  let broadcasts: WorkLedgerSnapshot[]
  let reads: TrackerReadEvent[]
  let handle: { stop: () => void } | null

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    db = getDatabase()
    crews = new CrewService(db)
    crewId = crews.create({ name: 'Loom' }).id
    crews.setTrackerBinding(crewId, { projectId: 'project-1' })
    ledger = new WorkLedgerService(db)
    broadcasts = []
    reads = []
    handle = null
  })

  afterEach(() => {
    handle?.stop()
    vi.useRealTimers()
    closeDatabase()
    resetDatabase()
  })

  /** Seconds since T0, for reading a schedule off the fake clock. */
  const at = () => Math.round((Date.now() - T0) / 1000)

  /** A watcher on the fake clock; `list` records WHEN each read happened. */
  function watcher(
    list: TrackerAdapter['listLabeledIssues'] = async () => [ISSUE],
  ) {
    const times: number[] = []
    const listLabeledIssues = vi.fn<TrackerAdapter['listLabeledIssues']>(
      (input) => {
        times.push(at())
        return list(input)
      },
    )
    const service = new TrackerWatcherService({
      crews,
      ledger,
      resolveKey: async () => 'lin_api_fixture',
      createAdapter: () => ({
        probe: async () => ({ ok: true, issues: 0, projectName: 'x' }),
        resolveProject: async () => ({ kind: 'not-found' as const }),
        listLabeledIssues,
        readIssueBodies: async () => new Map<string, string | null>(),
        listOutsideIssues: NO_OUTSIDE,
      }),
      broadcast: (snapshot) => broadcasts.push(snapshot),
      onRead: (event) => reads.push(event),
      now: () => new Date(),
      log: vi.fn(),
    })
    return { service, times, listLabeledIssues }
  }

  async function until(seconds: number) {
    await vi.advanceTimersByTimeAsync(T0 + seconds * 1000 - Date.now())
  }

  it('R2: activity opens a 3-minute burst at 15 s, then the beat goes back to 60 s', async () => {
    const { service, times } = watcher()
    handle = service.start()
    await until(30)
    expect(times).toEqual([0])

    service.noteActivity(crewId)
    await until(340)
    // Mutation: a burst that never ends (ignore `burstUntil`'s expiry) ->
    // 225, 240, ... after 210, red.
    expect(times).toEqual([
      0, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 270, 330,
    ])
  })

  it('R2: activity at the same moment is one read and one timer, never a stack', async () => {
    const { service, times } = watcher()
    handle = service.start()
    await until(30)
    service.noteActivity(crewId)
    service.noteActivity(crewId)
    service.noteActivity(crewId)
    expect(vi.getTimerCount()).toBe(1)
    await until(44)
    expect(times).toEqual([0, 30])
  })

  it('R2: an unbound crew’s activity hurries nothing', async () => {
    const { service, times } = watcher()
    const unbound = crews.create({ name: 'Unbound' }).id
    handle = service.start()
    await until(30)
    service.noteActivity(unbound)
    await until(59)
    expect(times).toEqual([0])
  })

  it('R3: blur slows to the background beat; focus reads at once and returns to 60 s', async () => {
    const { service, times } = watcher()
    handle = service.start()
    await until(1)
    service.setWindowFocused(false)
    // Mutation: ignore blur -> a read at 60, red.
    await until(TRACKER_BACKGROUND_INTERVAL_MS / 1000 - 1)
    expect(times).toEqual([0])
    await until(TRACKER_BACKGROUND_INTERVAL_MS / 1000)
    expect(times).toEqual([0, 300])

    await until(400)
    service.setWindowFocused(true)
    await until(400)
    expect(times).toEqual([0, 300, 400])
    expect(service.lastKickReason()).toBe('focus')
    await until(TRACKER_WATCH_INTERVAL_MS / 1000 + 400)
    expect(times).toEqual([0, 300, 400, 460])
  })

  it('R3: a blur never slows an open burst', async () => {
    const { service, times } = watcher()
    handle = service.start()
    await until(30)
    service.noteActivity(crewId)
    service.setWindowFocused(false)
    await until(60)
    expect(times).toEqual([0, 30, 45, 60])
  })

  it('R3: focus inside the floor waits the floor out, then reads', async () => {
    const { service, times } = watcher()
    handle = service.start()
    await until(3)
    service.setWindowFocused(true)
    await until(9)
    expect(times).toEqual([0])
    await until(10)
    expect(times).toEqual([0, 10])
  })

  it('R4: three kicks during one slow read are exactly one read after it, after the floor', async () => {
    let release: () => void = () => {}
    let slow = true
    const { service, times } = watcher(async () => {
      if (slow) {
        slow = false
        await new Promise<void>((resolve) => {
          release = resolve
        })
      }
      return [ISSUE]
    })
    handle = service.start()
    await until(1)
    service.kick('manual')
    await until(2)
    service.kick('focus')
    await until(3)
    service.kick('activity')
    await until(5)
    release()
    await until(9)
    expect(times).toEqual([0])
    // Mutation: drop the pending flag -> no read at 10, red.
    await until(10)
    expect(times).toEqual([0, 10])
    // Mutation: queue every kick -> 20 and 30 as well, red.
    await until(69)
    expect(times).toEqual([0, 10])
    await until(70)
    expect(times).toEqual([0, 10, 70])
  })

  it('R5: a kick or a Refresh during a 5-minute backoff asks the tracker nothing', async () => {
    const { service, times } = watcher(async () => {
      throw refusal('rate-limited', null)
    })
    handle = service.start()
    await until(30)
    expect(service.trackerHealth(crewId)?.state).toBe('rate-limited')

    expect(service.refresh(crewId)).toEqual({
      outcome: 'backing-off',
      refreshableAt: '2026-09-19T12:05:00.000Z',
    })
    service.noteActivity(crewId)
    service.kick('manual')
    // Mutation: let a kick read past `isTrackerTickDue` -> a read at 30, red.
    await until(299)
    expect(times).toEqual([0])
  })

  it('R5: a rate-limited answer closes the burst; the healthy crew goes back to the beat', async () => {
    const limited = crewId
    const healthy = crews.create({ name: 'Healthy' }).id
    crews.setTrackerBinding(healthy, { projectId: 'project-2' })
    const healthyTimes: number[] = []
    const { service } = watcher(async (input) => {
      if (input.projectId === 'project-2') {
        healthyTimes.push(at())
        return [ISSUE]
      }
      if (at() >= 45) throw refusal('rate-limited', null)
      return [ISSUE]
    })
    handle = service.start()
    await until(30)
    service.noteActivity(limited)
    await until(59)
    // The 429 lands at 45; the burst it closes would have read at 60.
    // Mutation: keep the burst -> 60 and 75 on the healthy crew, red.
    await until(104)
    expect(healthyTimes).toEqual([0, 30, 45])
    await until(105)
    expect(healthyTimes).toEqual([0, 30, 45, 105])
  })

  it('R6: Refresh inside the floor says just read and asks for nothing; after it, reads now', async () => {
    const { service, times } = watcher()
    handle = service.start()
    await until(4)
    expect(service.refresh(crewId)).toEqual({
      outcome: 'just-read',
      refreshableAt: '2026-09-19T12:00:10.000Z',
    })
    await until(59)
    expect(times).toEqual([0])

    expect(service.refresh(crewId)).toEqual({
      outcome: 'reading',
      refreshableAt: null,
    })
    expect(service.lastKickReason()).toBe('manual')
    await until(59)
    expect(times).toEqual([0, 59])
  })

  it('R6: every successful read is heard, news or not; the ledger channel still carries news only', async () => {
    const { service } = watcher()
    handle = service.start()
    await until(60)
    // Mutation: tell only on news -> one read heard, red.
    expect(reads).toEqual([
      {
        crewId,
        lastOkAt: '2026-09-19T12:00:00.000Z',
        refreshableAt: '2026-09-19T12:00:10.000Z',
      },
      {
        crewId,
        lastOkAt: '2026-09-19T12:01:00.000Z',
        refreshableAt: '2026-09-19T12:01:10.000Z',
      },
    ])
    expect(broadcasts).toHaveLength(1)
  })

  it('R6: a refused read is not heard as a read', async () => {
    const { service } = watcher(async () => {
      throw refusal('unreachable')
    })
    handle = service.start()
    await until(1)
    expect(reads).toEqual([])
  })
})

describe('MAR-3236: the issues outside the loop, read beside the ledger', () => {
  const T0 = new Date('2026-09-19T12:00:00.000Z').getTime()
  let db: Database.Database
  let crews: CrewService
  let crewId: string
  let ledger: WorkLedgerService
  let handle: { stop: () => void } | null

  const OUTSIDE: TrackerOutsideIssue = {
    id: 'out-1',
    identifier: 'EX-90',
    title: 'Nobody has groomed this',
    url: 'https://linear.app/example/issue/ex-90',
    status: 'Backlog',
    priority: null,
    labels: ['Bug'],
    updatedAt: '2026-09-19T11:00:00.000Z',
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    db = getDatabase()
    crews = new CrewService(db)
    crewId = crews.create({ name: 'Loom' }).id
    crews.setTrackerBinding(crewId, { projectId: 'project-1' })
    ledger = new WorkLedgerService(db)
    handle = null
  })

  afterEach(() => {
    handle?.stop()
    vi.useRealTimers()
    closeDatabase()
    resetDatabase()
  })

  const at = () => Math.round((Date.now() - T0) / 1000)

  async function until(seconds: number) {
    await vi.advanceTimersByTimeAsync(T0 + seconds * 1000 - Date.now())
  }

  /**
   * A watcher on the fake clock recording WHEN each read happened, per
   * crew: the labeled read and the outside read, separately.
   */
  function watcher(
    options: {
      list?: TrackerAdapter['listLabeledIssues']
      outside?: TrackerAdapter['listOutsideIssues']
    } = {},
  ) {
    const labeled: Record<string, number[]> = {}
    const outside: Record<string, number[]> = {}
    const pushed: TrackerOutsideSnapshot[] = []
    const record = (into: Record<string, number[]>, projectId: string) => {
      ;(into[projectId] ??= []).push(at())
    }
    const listOutsideIssues = vi.fn<TrackerAdapter['listOutsideIssues']>(
      async (input) => {
        record(outside, input.projectId)
        return options.outside
          ? options.outside(input)
          : { issues: [OUTSIDE], more: false }
      },
    )
    const service = new TrackerWatcherService({
      crews,
      ledger,
      resolveKey: async () => 'lin_api_fixture',
      createAdapter: () => ({
        probe: async () => ({ ok: true, issues: 0, projectName: 'x' }),
        resolveProject: async () => ({ kind: 'not-found' as const }),
        listLabeledIssues: async (input) => {
          record(labeled, input.projectId)
          return options.list ? options.list(input) : [ISSUE]
        },
        readIssueBodies: async () => new Map<string, string | null>(),
        listOutsideIssues,
      }),
      broadcast: () => {},
      broadcastOutside: (snapshot) => pushed.push(snapshot),
      now: () => new Date(),
      log: vi.fn(),
    })
    return { service, labeled, outside, pushed, listOutsideIssues }
  }

  it('R4: a burst reads the loop fast and outside it once; ten minutes, a Refresh, never a focus', async () => {
    const { service, labeled, outside } = watcher()
    service.noteActivity(crewId)
    handle = service.start()
    await until(30)
    expect(labeled['project-1']).toEqual([0, 15, 30])
    // Mutation: read outside on every tick -> [0, 15, 30], red.
    expect(outside['project-1']).toEqual([0])

    await until(599)
    expect(outside['project-1']).toEqual([0])
    await until(600)
    expect(labeled['project-1']).toContain(600)
    expect(outside['project-1']).toEqual([0, 600])

    await until(630)
    expect(service.refresh(crewId).outcome).toBe('reading')
    await until(631)
    expect(outside['project-1']).toEqual([0, 600, 630])

    // A focus kick reads the loop and nothing outside it.
    await until(700)
    service.setWindowFocused(true)
    await until(701)
    expect(labeled['project-1']).toContain(700)
    // Mutation: mark the outside read due on every kick -> 700 here, red.
    expect(outside['project-1']).toEqual([0, 600, 630])
  })

  it('R4: a Refresh reaches outside the loop only for the crew it was pressed for', async () => {
    const other = crews.create({ name: 'Other' }).id
    crews.setTrackerBinding(other, { projectId: 'project-2' })
    const { service, outside } = watcher()
    handle = service.start()
    await until(30)
    expect(service.refresh(other).outcome).toBe('reading')
    await until(31)
    // Mutation: a Refresh marks every crew due -> project-1 read at 30, red.
    expect(outside['project-1']).toEqual([0])
    expect(outside['project-2']).toEqual([0, 30])
  })

  it('R4: a crew backing off reads nothing outside, not even for a Refresh', async () => {
    const { service, outside } = watcher({
      list: async () => {
        if (at() >= 60) throw refusal('rate-limited', null)
        return [ISSUE]
      },
    })
    handle = service.start()
    await until(60)
    expect(service.trackerHealth(crewId)?.state).toBe('rate-limited')
    expect(service.refresh(crewId).outcome).toBe('backing-off')
    // Well past the outside beat, still inside the default 5-minute backoff
    // from 60 s -- and then the labeled read is refused again.
    await until(700)
    // Mutation: read outside before (or whatever) the labeled read -> a
    // read at 60, red.
    expect(outside['project-1']).toEqual([0])
  })

  it('R4: a refused outside read keeps the last snapshot and pushes nothing', async () => {
    let calls = 0
    const { service, pushed } = watcher({
      outside: async () => {
        calls += 1
        if (calls === 2) throw refusal('unreachable')
        return { issues: [OUTSIDE], more: calls > 2 }
      },
    })
    expect(service.outsideSnapshot(crewId)).toEqual({
      crewId,
      issues: [],
      more: false,
      readAt: null,
    })
    handle = service.start()
    await until(1)
    const first = service.outsideSnapshot(crewId)
    expect(first).toEqual({
      crewId,
      issues: [OUTSIDE],
      more: false,
      readAt: '2026-09-19T12:00:00.000Z',
    })
    expect(pushed).toEqual([first])

    await until(600)
    // Mutation: clear the snapshot on a refusal -> never-read, red.
    expect(service.outsideSnapshot(crewId)).toEqual(first)
    expect(pushed).toHaveLength(1)
    // The labeled read's health is untouched by the outside refusal.
    expect(service.trackerHealth(crewId)?.state).toBe('ok')

    // The beat counts from the attempt: no retry on the next tick.
    await until(1199)
    expect(calls).toBe(2)
    await until(1200)
    expect(calls).toBe(3)
    expect(service.outsideSnapshot(crewId).more).toBe(true)
  })

  it('a crew re-bound to another project never shows the old project’s issues', async () => {
    const { service } = watcher()
    handle = service.start()
    await until(1)
    expect(service.outsideSnapshot(crewId).issues).toEqual([OUTSIDE])
    crews.setTrackerBinding(crewId, { projectId: 'project-9' })
    expect(service.outsideSnapshot(crewId).readAt).toBeNull()
  })

  it('R5: beside the ledger, not in it -- an outside read writes no row', async () => {
    const { service, listOutsideIssues } = watcher()
    // The labeled read alone first: what the ledger holds without outside.
    const bare = watcher({ outside: async () => ({ issues: [], more: false }) })
    await bare.service.tick()
    const before = JSON.stringify(ledger.currentView(crewId))
    // `workLedger:list` answers `snapshot(crewId).entries` from the ledger.
    const listBefore = JSON.stringify(bare.service.snapshot(crewId).entries)
    await service.tick()
    expect(listOutsideIssues).toHaveBeenCalledTimes(1)
    expect(service.outsideSnapshot(crewId).issues).toEqual([OUTSIDE])
    // Mutation: append outside issues as `unassigned` -> a row for EX-90,
    // red.
    expect(JSON.stringify(ledger.currentView(crewId))).toBe(before)
    expect(JSON.stringify(service.snapshot(crewId).entries)).toBe(listBefore)
    expect(
      ledger.list(crewId).some((row) => row.issueIdentifier === 'EX-90'),
    ).toBe(false)
  })
})
