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
  type TrackerIssue,
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
        probe: async () => ({ ok: true, issues: 0 }),
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
        probe: async () => ({ ok: true, issues: 0 }),
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
        probe: async () => ({ ok: true, issues: 0 }),
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
