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

  function plan(sql: string, params: (string | number)[]): string {
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

  it('conversation prefix groups the sequence range through its statistics index without a temp B-tree', () => {
    const sql = capture(
      () => service.getConversationPrefix(id, 49701),
      /SELECT spans/,
    )
    const detail = plan(sql, [id, 49701, id])
    expect(detail).toContain(
      'USING COVERING INDEX idx_session_conversation_items_prefix',
    )
    expect(detail).toMatch(
      /SEARCH first USING INDEX .*\(session_id=\? AND sequence=\?\)/,
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
        /WITH requested\(session_id\)/,
      )
      const detail = plan(sql, [...ids, ...ids, ...ids, ...ids])
      expect(detail).toContain('sqlite_autoindex_session_agent_runs_2')
      expect(detail).toContain('sqlite_autoindex_session_tasks_1')
      expect(detail).toContain('idx_session_turns_session_sequence')
    },
  )

  // MAR-3310 O0b R1/R4/R5: the parallel-work panel's reads by id. Each pin
  // captures the SQL the service really runs.
  it.each([
    {
      read: 'listRunItems',
      act: () => service.listRunItems(id, ['run-a', 'run-b']),
      match: /items\.agent_run_id = \?/,
      params: () => [id, 'run-a'],
      index: 'USING INDEX idx_session_conversation_items_agent_run',
    },
    {
      read: 'listTaskItems',
      act: () => service.listTaskItems(id, ['task-a', 'task-b']),
      match: /items\.task_id = \?/,
      params: () => [id, 'task-a'],
      index: 'USING INDEX idx_session_conversation_items_task',
    },
    {
      read: 'listPendingRequestItems',
      act: () => service.listPendingRequestItems(id),
      match: /LIMIT 50/,
      params: () => [id],
      index: 'USING INDEX idx_session_conversation_items_attention_request',
    },
  ])(
    'MAR-3310 O0b $read seeks its partial index in sequence order without a temp B-tree',
    ({ act, match, params, index }) => {
      const detail = plan(capture(act, match), params())
      expect(detail).toContain(index)
      expect(detail).not.toContain('TEMP B-TREE')
      expect(detail).not.toMatch(/SCAN items\b/)
    },
  )

  it('MAR-3310 O0b R4 listAgentRuns reads each parent run by the spawning item’s primary key', () => {
    const sql = capture(
      () => new HarnessEvidenceService(db).listAgentRuns(id),
      /AS parentRunId/,
    )
    expect(plan(sql, [id])).toMatch(
      /SEARCH spawn USING INDEX sqlite_autoindex_session_conversation_items_1 \(id=\?\)/,
    )
  })

  it('MAR-3310 O0b R1 measures the reads on a 50,000-item conversation with a 2,000-item run, and the plans hold after ANALYZE', () => {
    const insert = db.prepare(
      `INSERT INTO session_conversation_items (
         id, session_id, sequence, kind, state, payload_json, agent_run_id,
         task_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'complete', ?, ?, ?, 'at', 'at')`,
    )
    const text = 'x'.repeat(400)
    db.transaction(() => {
      for (let sequence = 1; sequence <= 50_000; sequence += 1) {
        // Every 25th item is the big run's: 2,000 of them, spread end to end.
        const big = sequence % 25 === 0
        // A fifth of the conversation is other subagents' and tasks' work.
        const noise = !big && sequence % 5 === 0
        const request = !big && !noise && sequence % 1_000 === 1
        insert.run(
          `big-${sequence}`,
          id,
          sequence,
          request ? 'approval-request' : 'message',
          JSON.stringify(
            request
              ? { description: 'May I?', resolution: 'pending' }
              : { actor: 'assistant', text },
          ),
          big ? 'big-run' : noise ? `noise-run-${sequence % 97}` : null,
          big && sequence % 4 === 0
            ? 'big-task'
            : noise
              ? `noise-task-${sequence % 89}`
              : null,
        )
      }
    })()
    db.exec('ANALYZE')
    const time = (read: () => unknown[]) => {
      const samples: number[] = []
      let count = 0
      for (let round = 0; round < 5; round += 1) {
        const started = performance.now()
        count = read().length
        samples.push(performance.now() - started)
      }
      samples.sort((a, b) => a - b)
      return { count, medianMs: Number(samples[2]!.toFixed(2)) }
    }
    const measured = {
      listRunItems: time(() => service.listRunItems(id, ['big-run'])),
      listTaskItems: time(() => service.listTaskItems(id, ['big-task'])),
      listPendingRequestItems: time(() => service.listPendingRequestItems(id)),
      getConversation: time(() => service.getConversation(id)),
    }
    // The figures the O0b report quotes; no timing bound is asserted here.
    console.log('MAR-3310 O0b reads on 50,000 items', measured)
    const runPlan = plan(
      capture(
        () => service.listRunItems(id, ['big-run']),
        /items\.agent_run_id = \?/,
      ),
      [id, 'big-run'],
    )
    const taskPlan = plan(
      capture(
        () => service.listTaskItems(id, ['big-task']),
        /items\.task_id = \?/,
      ),
      [id, 'big-task'],
    )
    const pendingPlan = plan(
      capture(() => service.listPendingRequestItems(id), /LIMIT 50/),
      [id],
    )
    expect({
      counts: [
        measured.listRunItems.count,
        measured.listTaskItems.count,
        measured.listPendingRequestItems.count,
        measured.getConversation.count,
      ],
      run: runPlan.includes('idx_session_conversation_items_agent_run'),
      task: taskPlan.includes('idx_session_conversation_items_task'),
      pending: pendingPlan.includes(
        'idx_session_conversation_items_attention_request',
      ),
      sorts: [runPlan, taskPlan, pendingPlan].some((detail) =>
        detail.includes('TEMP B-TREE'),
      ),
    }).toEqual({
      counts: [2_000, 500, 50, 50_000],
      run: true,
      task: true,
      pending: true,
      sorts: false,
    })
  })

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
