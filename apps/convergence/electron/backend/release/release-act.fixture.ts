import Database from 'better-sqlite3'
import { vi } from 'vitest'
import { migrateReleaseActs } from '../database/release-act-migration.service'
import {
  migrateWorkLedger,
  migrateWorkLedgerBlocked,
  migrateWorkLedgerVerdict,
} from '../database/work-ledger-migration.service'
import { WorkLedgerService } from '../work-ledger/work-ledger.service'
import { PullRequestService } from '../pull-request/pull-request.service'
import { GitService } from '../git/git.service'
import { ReleaseActService } from './release-act.service'
import type { WorkLedgerEntry } from '../work-ledger/work-ledger.types'

export const HEAD = 'a'.repeat(40)
export const MOVED = 'b'.repeat(40)
export const MERGED = 'c'.repeat(40)
export const seat = { crewId: 'crew', sessionId: 'mastermind' }
export const reading = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    url: 'https://github.com/example/repo/pull/1',
    title: 'Reviewed change',
    headRefOid: HEAD,
    mergeStateStatus: 'CLEAN',
    statusCheckRollup: [
      { name: 'verify', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ],
    mergeCommit: { oid: MERGED },
    ...patch,
  })

export function releaseBench(count = 1) {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT)')
  migrateWorkLedger(db)
  migrateWorkLedgerVerdict(db)
  migrateWorkLedgerBlocked(db)
  migrateReleaseActs(db)
  const ledger = new WorkLedgerService(db)
  for (let number = count; number >= 1; number--)
    ledger.append([
      {
        crewId: 'crew',
        issueId: `issue-${number}`,
        issueIdentifier: `TEST-${number}`,
        issueTitle: `Change ${number}`,
        issueUrl: `https://example.test/${number}`,
        seat: 'horse',
        wave: 'wave-1',
        lap: 1,
        state: 'reviewed',
        trackerStatus: 'In Review',
        groundedAt: null,
        seenAt: '2026-09-01T00:00:00.000Z',
        verdict: 'pass',
        verdictSettleId: 'settle',
        verdictNote: null,
        blocked: false,
        fact: { logicalStatus: 'in-review', branchName: null, updatedAt: null },
      },
    ])
  const list = (): WorkLedgerEntry[] =>
    ledger.currentView('crew').map((row) => ({
      ...row,
      sessionId: null,
      hostLiveness: null,
      dispatch: null,
      pr: {
        source: 'tracker',
        number: Number(row.issueId.split('-')[1]),
        url: `https://github.com/example/repo/pull/${row.issueId.split('-')[1]}`,
        title: row.issueTitle,
      },
    }))
  let time = Date.parse('2026-09-23T00:00:00Z')
  const events: string[] = []
  const gh = vi.fn(async (args: string[], _cwd: string): Promise<string> => {
    events.push(args.join(' '))
    if (args[0] === 'run')
      return JSON.stringify([
        { headSha: MERGED, status: 'completed', conclusion: 'success' },
      ])
    if (args[1] === 'merge') return ''
    return reading({ url: `https://github.com/example/repo/pull/${args[2]}` })
  })
  const hails = { raise: vi.fn(() => null) }
  const deps = {
    db,
    ledger: {
      currentView: (id: string) => ledger.currentView(id),
      list,
      append: ledger.append.bind(ledger),
    },
    prs: new PullRequestService(db, new GitService(), gh),
    hails,
    authorize: (input: { crewId: string; sessionId: string }) => {
      if (input.crewId !== seat.crewId || input.sessionId !== seat.sessionId)
        throw new Error('Only the mastermind can merge reviewed PRs')
      return '/fake/repository'
    },
    changed: vi.fn(),
    now: () => time,
    sleep: vi.fn(async (ms: number) => {
      time += ms
    }),
  }
  const service = new ReleaseActService(deps)
  const merge = async () => {
    const plan = await service.plan(seat)
    return service.merge({
      ...seat,
      planId: plan.id,
      issueIds: plan.candidates.map((row) => row.issueId),
    })
  }
  return { db, ledger, gh, deps, events, hails, service, merge }
}
