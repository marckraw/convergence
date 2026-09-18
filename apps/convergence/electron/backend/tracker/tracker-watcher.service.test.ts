import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { CrewService } from '../crew/crew.service'
import { WorkLedgerService } from '../work-ledger/work-ledger.service'
import type { WorkLedgerSnapshot } from '../work-ledger/work-ledger.types'
import { TRACKER_WATCH_INTERVAL_MS } from './tracker-watcher.pure'
import { TrackerWatcherService } from './tracker-watcher.service'
import { createLinearTrackerAdapter } from './linear-tracker.adapter'
import {
  linearIssueNode,
  linearIssuesBody,
  linearLabel,
  recordedReply,
} from './linear-tracker.fixture'
import {
  TrackerRefusalError,
  type TrackerAdapter,
  type TrackerBinding,
  type TrackerIssue,
  type TrackerProjectResolution,
  type TrackerRefusal,
} from './tracker.types'

const ISSUE: TrackerIssue = {
  id: 'issue-1',
  identifier: 'EX-1',
  title: 'The work',
  url: 'https://linear.app/example/issue/ex-1',
  status: 'In Progress',
  logicalStatus: 'in-progress',
  seat: 'opus',
  blocked: false,
  wave: null,
  groundedAt: null,
  branchName: null,
  updatedAt: '2026-09-17T08:00:00.000Z',
}

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
          fetch: async () => recordedReply(200, replies.shift()),
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
