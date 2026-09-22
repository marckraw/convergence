import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { trackerIssue } from '../tracker/linear-tracker.fixture'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { WORK_LEDGER_ISSUE_INDEX } from '../database/work-ledger-migration.service'
import { CrewService } from '../crew/crew.service'
import { ProviderRegistry } from '../provider/provider-registry'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { SessionService } from '../session/session.service'
import { diffTrackerSnapshot } from '../tracker/tracker-watcher.pure'
import type { TrackerIssue } from '../tracker/tracker.types'
import {
  WORK_LEDGER_CURRENT_VIEW_SQL,
  WorkLedgerService,
} from './work-ledger.service'
import type { NewWorkLedgerRecord } from './work-ledger.types'

function record(
  overrides: Partial<NewWorkLedgerRecord> = {},
): NewWorkLedgerRecord {
  return {
    crewId: 'crew-1',
    issueId: 'issue-1',
    issueIdentifier: 'EX-1',
    issueTitle: 'The work',
    issueUrl: 'https://linear.app/example/issue/ex-1',
    seat: 'opus',
    wave: null,
    lap: 1,
    state: 'assigned',
    trackerStatus: 'Todo',
    blocked: false,
    groundedAt: null,
    seenAt: '2026-09-17T08:00:00.000Z',
    fact: { logicalStatus: 'todo', branchName: null, updatedAt: null },
    verdict: null,
    verdictSettleId: null,
    verdictNote: null,
    ...overrides,
  }
}

describe('MAR-3084 R4: the ledger is append-only and the view is the latest row', () => {
  let db: Database.Database
  let ledger: WorkLedgerService

  beforeEach(() => {
    db = getDatabase()
    ledger = new WorkLedgerService(db)
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('three rows for one issue -> the view holds one, the newest, and the record keeps all three', () => {
    ledger.append([
      record({ state: 'assigned', seenAt: '2026-09-17T08:00:00.000Z' }),
      record({ state: 'working', seenAt: '2026-09-17T08:01:00.000Z' }),
      record({ state: 'returned', seenAt: '2026-09-17T08:02:00.000Z' }),
    ])

    expect(ledger.currentView('crew-1').map((row) => row.state)).toEqual([
      'returned',
    ])
    expect(db.prepare('SELECT COUNT(*) AS n FROM work_ledger').get()).toEqual({
      n: 3,
    })
  })

  it('two rows at one timestamp -> the later append wins by rowid', () => {
    // Mutation: order by `seen_at` alone -> the tie is SQLite's to break.
    ledger.append([
      record({ state: 'working', seenAt: '2026-09-17T08:00:00.000Z' }),
      record({ state: 'returned', seenAt: '2026-09-17T08:00:00.000Z' }),
    ])
    ledger.append([
      record({ state: 'reviewed', seenAt: '2026-09-17T08:00:00.000Z' }),
    ])

    expect(ledger.currentView('crew-1').map((row) => row.state)).toEqual([
      'reviewed',
    ])
  })

  it('the rowid tiebreak holds under an adversarial index that orders ties by id', () => {
    // Under the shipped index a reverse scan already breaks a tie by rowid
    // (every index entry ends in it), so the tiebreak clause is invisible
    // there. An index that ends in `id` instead makes a planner that trusts
    // the index return whichever tie sorts last by id -- here the OLDER row.
    // Measured: with both indexes the planner keeps the shipped one, so the
    // shipped one is dropped for this case.
    db.prepare(`DROP INDEX ${WORK_LEDGER_ISSUE_INDEX}`).run()
    db.prepare(
      'CREATE INDEX adversarial_ties_by_id ON work_ledger(crew_id, issue_id, seen_at, id)',
    ).run()
    const insert = db.prepare(
      `INSERT INTO work_ledger (id, crew_id, issue_id, issue_identifier, issue_title,
         issue_url, seat, wave, lap, state, tracker_status, grounded_at, seen_at, fact_json)
       VALUES (?, 'crew-1', 'issue-1', 'EX-1', 't', 'u', 'opus', NULL, 1, ?, 's', NULL,
         '2026-09-17T08:00:00.000Z', '{}')`,
    )
    insert.run('zzz-older', 'working')
    insert.run('aaa-newer', 'returned')

    // Mutation: order by `seen_at` alone -> the scan returns `zzz-older`.
    expect(ledger.currentView('crew-1').map((row) => row.id)).toEqual([
      'aaa-newer',
    ])
  })

  it('keeps issues and crews apart', () => {
    ledger.append([
      record({ issueId: 'issue-1', state: 'working' }),
      record({ issueId: 'issue-2', issueIdentifier: 'EX-2', state: 'done' }),
      record({ crewId: 'crew-2', state: 'returned' }),
    ])
    expect(
      ledger
        .currentView('crew-1')
        .map((row) => [row.issueId, row.state])
        .sort(),
    ).toEqual([
      ['issue-1', 'working'],
      ['issue-2', 'done'],
    ])
  })

  it('the view is measured against the plan SQLite picks: the (crew, issue, seen_at) index', () => {
    ledger.append([record(), record({ issueId: 'issue-2' })])
    const plan = (
      db
        .prepare(`EXPLAIN QUERY PLAN ${WORK_LEDGER_CURRENT_VIEW_SQL}`)
        .all('crew-1') as { detail: string }[]
    ).map((step) => step.detail)

    expect(
      plan.some((detail) => detail.includes(WORK_LEDGER_ISSUE_INDEX)),
    ).toBe(true)
    expect(plan.some((detail) => /TEMP B-TREE/.test(detail))).toBe(false)
  })

  it('MAR-3138 R2: `blocked` survives the round trip, on the row and through a ruling', () => {
    ledger.append([
      record({ state: 'working', blocked: true }),
      record({
        issueId: 'issue-2',
        issueIdentifier: 'EX-2',
        state: 'working',
        blocked: false,
      }),
    ])

    // Mutation: write a constant 0 in the INSERT, or read the column as
    // `false` in `workLedgerRecordFromRow` -> EX-1 comes back unblocked, red.
    expect(
      Object.fromEntries(
        ledger
          .currentView('crew-1')
          .map((row) => [row.issueIdentifier, row.blocked]),
      ),
    ).toEqual({ 'EX-1': true, 'EX-2': false })
    // The joined read is the one the panel gets, and it says the same.
    expect(
      Object.fromEntries(
        ledger.list('crew-1').map((row) => [row.issueIdentifier, row.blocked]),
      ),
    ).toEqual({ 'EX-1': true, 'EX-2': false })

    // A ruling carries the label it found on the row it bound to.
    const bound = ledger
      .currentView('crew-1')
      .find((row) => row.issueIdentifier === 'EX-1')!
    ledger.appendVerdict({
      bound,
      verdict: 'pass',
      lap: 2,
      settleId: 'settle-1',
      seenAt: '2026-09-17T09:00:00.000Z',
    })
    expect(
      ledger
        .currentView('crew-1')
        .find((row) => row.issueIdentifier === 'EX-1')!.blocked,
    ).toBe(true)
  })

  it('the service issues no UPDATE and no DELETE', () => {
    const source = readFileSync(
      join(__dirname, 'work-ledger.service.ts'),
      'utf8',
    )
    expect(source).not.toMatch(/\bUPDATE\b/i)
    expect(source).not.toMatch(/\bDELETE\b/i)
  })

  it('survives a reopen: the rows are there before any tick', () => {
    const dir = mkdtempSync(join(tmpdir(), 'work-ledger-'))
    const path = join(dir, 'convergence.db')
    try {
      closeDatabase()
      resetDatabase()
      new WorkLedgerService(getDatabase(path)).append([record()])
      closeDatabase()
      resetDatabase()
      expect(
        new WorkLedgerService(getDatabase(path)).currentView('crew-1'),
      ).toHaveLength(1)
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('MAR-3084 R6: the facts join at read time from the app’s own records', () => {
  let db: Database.Database
  let root: string

  beforeEach(() => {
    db = getDatabase()
    root = mkdtempSync(join(tmpdir(), 'work-ledger-join-'))
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(root, { recursive: true, force: true })
  })

  function issue(id: string, identifier: string): TrackerIssue {
    return trackerIssue({
      id,
      identifier,
      title: identifier,
      url: `https://linear.app/example/issue/${identifier.toLowerCase()}`,
      status: 'In Review',
      logicalStatus: 'in-review',
    })
  }

  it('the seat’s session, its PR only for the issue its branch names, and its host', () => {
    db.prepare(
      'INSERT INTO projects (id, name, repository_path) VALUES (?, ?, ?)',
    ).run('p1', 'p1', root)
    const sessions = new SessionService(
      db,
      new LocalExecutionHost(new ProviderRegistry()),
    )
    const session = sessions.create({
      projectId: 'p1',
      workspaceId: null,
      providerId: 'claude-code',
      model: null,
      effort: null,
      name: 'opus',
    })
    // The shape `PullRequestService` stores (`session-pull-request.types`).
    const pr = {
      number: 700,
      url: 'https://github.com/example/repo/pull/700',
      state: 'open',
      headBranch: 'agent/mar-3008-tray-key',
      checkedAt: '2026-09-17T08:00:00.000Z',
      source: 'gh',
    }
    db.prepare(
      "UPDATE sessions SET pull_request_json = ?, attention = 'host-unreachable', execution_host_last_event_at = ? WHERE id = ?",
    ).run(JSON.stringify(pr), '2026-09-17T07:59:00.000Z', session.id)

    const crews = new CrewService(db)
    const crew = crews.create({ name: 'Loom', sessionIds: [session.id] })
    crews.setMemberBatonName(crew.id, { sessionId: session.id }, 'opus')

    const ledger = new WorkLedgerService(db)
    ledger.append(
      diffTrackerSnapshot({
        crewId: crew.id,
        current: [],
        issues: [issue('i-3008', 'MAR-3008'), issue('i-3070', 'MAR-3070')],
        seenAt: '2026-09-17T08:00:00.000Z',
      }),
    )
    const before = db.prepare('SELECT * FROM work_ledger').all()

    const byIdentifier = Object.fromEntries(
      ledger.list(crew.id).map((entry) => [entry.issueIdentifier, entry]),
    )

    expect(byIdentifier['MAR-3008']).toMatchObject({
      sessionId: session.id,
      pr,
      hostLiveness: {
        executionHost: 'local',
        lastEventAt: '2026-09-17T07:59:00.000Z',
        hostReachable: false,
      },
    })
    // Mutation: match the PR by seat alone -> MAR-3070 carries PR 700, red.
    expect(byIdentifier['MAR-3070']).toMatchObject({
      sessionId: session.id,
      pr: null,
    })
    // The join is a SELECT: nothing was written into the ledger by reading.
    expect(db.prepare('SELECT * FROM work_ledger').all()).toEqual(before)
  })

  it('a recipe seat has no session and no facts', () => {
    const crews = new CrewService(db)
    const crew = crews.create({ name: 'Loom' })
    crews.addRecipeMember(crew.id, {
      batonName: 'grok',
      providerId: 'codex',
      model: null,
      hostPolicy: 'local',
    })
    const ledger = new WorkLedgerService(db)
    ledger.append(
      diffTrackerSnapshot({
        crewId: crew.id,
        current: [],
        issues: [{ ...issue('i-1', 'MAR-1'), seat: 'grok' }],
        seenAt: '2026-09-17T08:00:00.000Z',
      }),
    )
    expect(ledger.list(crew.id)).toMatchObject([
      { seat: 'grok', sessionId: null, pr: null, hostLiveness: null },
    ])
  })
})

describe('MAR-3085 R3: the row is the ruling', () => {
  let db: Database.Database
  let ledger: WorkLedgerService

  beforeEach(() => {
    db = getDatabase()
    ledger = new WorkLedgerService(db)
    ledger.append([
      record({ state: 'returned', lap: 1, trackerStatus: 'In Review' }),
    ])
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  const bound = () => ledger.currentView('crew-1')[0]!

  it('RETURN, PASS and STOP write the state, the mastermind’s lap and the settle', () => {
    const returned = ledger.appendVerdict({
      bound: bound(),
      verdict: 'return',
      lap: 2,
      settleId: 'settle-1',
      seenAt: '2026-09-18T08:00:00.000Z',
    })
    expect(returned).toMatchObject({
      state: 'working',
      lap: 2,
      verdict: 'return',
      verdictSettleId: 'settle-1',
      // The tracker has not moved: the row still carries what it last said.
      trackerStatus: 'In Review',
      seat: 'opus',
      issueIdentifier: 'EX-1',
    })
    expect(returned.fact).toMatchObject({
      ledgerLapBefore: 1,
      lapDisagreed: false,
    })

    const passed = ledger.appendVerdict({
      bound: bound(),
      verdict: 'pass',
      lap: 3,
      settleId: 'settle-2',
      seenAt: '2026-09-18T08:01:00.000Z',
    })
    expect(passed).toMatchObject({ state: 'reviewed', lap: 3, verdict: 'pass' })

    const stopped = ledger.appendVerdict({
      bound: bound(),
      verdict: 'stop',
      lap: 4,
      settleId: 'settle-3',
      note: 'x'.repeat(5_000),
      seenAt: '2026-09-18T08:02:00.000Z',
    })
    expect(stopped.state).toBe('stopped')
    expect(stopped.verdictNote).toHaveLength(4_000)

    // Three rulings, three rows, the newest current: append-only holds.
    expect(
      (
        db.prepare('SELECT COUNT(*) AS n FROM work_ledger').get() as {
          n: number
        }
      ).n,
    ).toBe(4)
    expect(ledger.currentView('crew-1')).toHaveLength(1)
    expect(bound()).toMatchObject({ state: 'stopped', lap: 4, verdict: 'stop' })
  })

  it('takes the mastermind’s lap even when the ledger disagrees, and says so', () => {
    // Mutation: write the ledger's lap + 1 instead of N -> lap 5 here, red.
    const row = ledger.appendVerdict({
      bound: bound(),
      verdict: 'return',
      lap: 9,
      settleId: 'settle-1',
      seenAt: '2026-09-18T08:00:00.000Z',
    })
    expect(row.lap).toBe(9)
    expect(row.fact.lapDisagreed).toBe(true)
  })

  it('a PASS carries no note, whatever the reply said', () => {
    expect(
      ledger.appendVerdict({
        bound: bound(),
        verdict: 'pass',
        lap: 2,
        settleId: 'settle-1',
        note: 'the whole reply',
        seenAt: '2026-09-18T08:00:00.000Z',
      }).verdictNote,
    ).toBeNull()
  })
})

it('MAR-2981 R14 measures first dispatch seen over 20,000 ledger rows across three crews', () => {
  const db = getDatabase()
  try {
    const ledger = new WorkLedgerService(db)
    ledger.append(
      Array.from({ length: 20_000 }, (_, n) =>
        record({
          crewId: `crew-${n % 3}`,
          issueId: `issue-${n % 600}`,
          seenAt: new Date(Date.UTC(2026, 8, 1) + n * 1000).toISOString(),
          fact: {
            logicalStatus: 'todo',
            branchName: null,
            updatedAt: null,
            dispatch: n >= 600,
          },
        }),
      ),
    )
    const start = performance.now()
    const seen = ledger.firstDispatchSeenAt('crew-1')
    const elapsed = performance.now() - start
    process.stdout.write(
      `MAR-2981 R14: ${elapsed.toFixed(3)} ms, 20,000 rows / 3 crews\n`,
    )
    expect(seen.size).toBe(200)
    expect(seen.get('issue-1')).toBe(
      new Date(Date.UTC(2026, 8, 1) + 601_000).toISOString(),
    )
    expect(elapsed).toBeLessThan(20)
  } finally {
    closeDatabase()
    resetDatabase()
  }
})
