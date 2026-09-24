import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { SessionService } from './session.service'
import { HarnessEvidenceService } from './harness-evidence.service'
import { createPerfProbe } from '../perf/perf-probe.service'

// Attention's single and batch pins, including skewed data + ANALYZE, live in
// session.attention-lookup.test.ts (MAR-3396). These pin the remaining hot reads.
describe('MAR-3323 hot query plans on the real schema', () => {
  let db: Database.Database
  let service: SessionService
  let temp: string
  let id: string

  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), 'convergence-perf-plans-'))
    const repo = join(temp, 'repo')
    mkdirSync(join(repo, '.git'), { recursive: true })
    db = getDatabase(join(temp, 'convergence.db'))
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('perf-plans', 'plans', ?)",
    ).run(repo)
    service = new SessionService(
      db,
      new LocalExecutionHost(new ProviderRegistry()),
      join(temp, 'sessions'),
    )
    id = service.create({
      projectId: 'perf-plans',
      workspaceId: null,
      providerId: 'test-provider',
      model: null,
      effort: null,
      name: 'plans',
    }).id
  })

  afterEach(() => {
    vi.restoreAllMocks()
    closeDatabase()
    resetDatabase()
    rmSync(temp, { recursive: true, force: true })
  })

  function capture(act: () => unknown, match: RegExp): string {
    const statements: string[] = []
    const original = db.prepare.bind(db)
    const spy = vi.spyOn(db, 'prepare').mockImplementation(((sql: string) => {
      statements.push(sql)
      return original(sql)
    }) as typeof db.prepare)
    try {
      act()
    } finally {
      spy.mockRestore()
    }
    const sql = statements.find((text) => match.test(text))
    expect(sql, `service did not execute ${match}`).toBeDefined()
    return sql!
  }

  function plan(sql: string, params: string[]): string {
    return (
      db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as {
        detail: string
      }[]
    )
      .map((step) => step.detail)
      .join('\n')
  }

  it('conversation order uses idx_session_conversation_items_session_sequence without a temp B-tree', () => {
    const sql = capture(() => service.getConversation(id), /SELECT items\.\*/)
    const detail = plan(sql, [id])
    expect(detail).toContain(
      'USING INDEX idx_session_conversation_items_session_sequence',
    )
    expect(detail).not.toContain('TEMP B-TREE')
  })

  it('summary turn timings use idx_session_turns_session_sequence', () => {
    const sql = capture(
      () => service.getSummaryById(id),
      /ROW_NUMBER\(\).*session_turns/s,
    )
    expect(plan(sql, [id])).toContain(
      'USING INDEX idx_session_turns_session_sequence',
    )
  })

  it.each([1, 2])(
    'countParallelWork for %i sessions indexes both evidence tables and the turn lookup',
    (count) => {
      const ids = count === 1 ? [id] : [id, 'other-session']
      const evidence = new HarnessEvidenceService(db)
      const sql = capture(
        () => evidence.countParallelWork(ids),
        /WITH linked AS/,
      )
      const detail = plan(sql, [...ids, ...ids])
      expect(detail).toContain('sqlite_autoindex_session_agent_runs_2')
      expect(detail).toContain('sqlite_autoindex_session_tasks_1')
      expect(detail).toContain('idx_session_turns_session_sequence')
    },
  )

  it('the probe counts unnecessary single and batched attention lookup attempts, even with no request rows', () => {
    const single = capture(() => {
      db.prepare(
        "UPDATE sessions SET attention = 'needs-approval' WHERE id = ?",
      ).run(id)
      service.getSummaryById(id)
    }, /kind IN \('approval-request', 'input-request'\)/)
    const batched = capture(() => service.getAllSummaries(), /request_rank/)
    const probe = createPerfProbe(true)!
    probe.wrapDatabase(db)
    try {
      for (const attention of ['needs-approval', 'needs-input']) {
        db.prepare('UPDATE sessions SET attention = ? WHERE id = ?').run(
          attention,
          id,
        )
        service.getSummaryById(id)
        service.getAllSummaries()
      }
      expect(probe.report().main.attentionRowReads).toEqual({
        total: 4,
        notNeeded: 0,
      })
      for (const attention of ['none', 'finished', 'failed']) {
        db.prepare('UPDATE sessions SET attention = ? WHERE id = ?').run(
          attention,
          id,
        )
        service.getSummaryById(id)
        service.getAllSummaries()
      }
      expect(probe.report().main.attentionRowReads).toEqual({
        total: 4,
        notNeeded: 0,
      })
      // Exercise the observer with exactly the forbidden reads, without
      // altering product code: a zero-result read is still a wasted lookup.
      db.prepare(single).get(id)
      db.prepare(batched).all(id)
      expect(probe.report().main.attentionRowReads).toEqual({
        total: 6,
        notNeeded: 2,
      })
    } finally {
      probe.dispose()
    }
  })
})
