import { afterEach, expect, it, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { HarnessEvidenceService } from './harness-evidence.service'
import { LegacyHarnessCounts } from './harness-evidence-legacy.fixture'
import { seedEvidenceFixture } from '../perf/evidence.fixture'

afterEach(() => {
  vi.restoreAllMocks()
  closeDatabase()
  resetDatabase()
})
function bed() {
  const db = getDatabase()
  db.prepare(
    "INSERT INTO sessions(id,context_kind,provider_id,name,working_directory) VALUES ('fixture','global','test','synthetic','/tmp')",
  ).run()
  return { db, service: new HarnessEvidenceService(db) }
}

it('F5 equality: generated links, every status and answer-window edges match the frozen query', () => {
  const { db, service } = bed()
  const legacy = new LegacyHarnessCounts(db)
  const rawRows: unknown[][] = []
  const prepare = db.prepare.bind(db)
  vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
    const statement = prepare(sql)
    const all = statement.all.bind(statement)
    statement.all = (...args: unknown[]) => {
      const rows = all(...args)
      rawRows.push(rows)
      return rows
    }
    return statement
  })
  const compare = (sessionIds: string[]) => {
    rawRows.length = 0
    expect(service.countParallelWork(sessionIds)).toEqual(
      legacy.countParallelWork(sessionIds),
    )
    expect(rawRows[0]).toEqual(rawRows[1])
  }
  const statuses = ['running', 'unknown', 'completed', 'failed', 'stopped']
  const times = [
    null,
    '2026-09-25T00:00:00Z',
    '2026-09-25T00:00:00.000Z',
    '2026-09-24T23:59:59.999Z',
    '2026-09-25T00:00:00.001Z',
    'start',
    'zz-after',
  ]
  let seed = 3402
  const next = (n: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % n
  }
  const task = db.prepare(
    'INSERT INTO session_tasks(task_id,session_id,tool_use_id,task_type,status,started_at,observed_at) VALUES (?,?,?,?,?,?,?)',
  )
  const run = db.prepare(
    'INSERT INTO session_agent_runs(id,session_id,spawned_by_item_id,status,started_at) VALUES (?,?,?,?,?)',
  )
  const item = db.prepare(
    "INSERT INTO session_conversation_items(id,session_id,sequence,kind,state,payload_json,provider_item_id,created_at,updated_at) VALUES (?,?,?,'tool-call','complete','{}',?,'start','start')",
  )
  const ids: string[] = []
  for (let sample = 0; sample < 60; sample++) {
    const id = `session-${sample}`
    ids.push(id)
    db.prepare(
      "INSERT INTO sessions(id,context_kind,provider_id,name,working_directory) VALUES (?,'global','test','synthetic','/tmp')",
    ).run(id)
    if (sample % 8 !== 0)
      db.prepare(
        "INSERT INTO session_turns(id,session_id,sequence,started_at,status) VALUES (?,?,1,?,'running')",
      ).run(`${id}-turn`, id, times[1 + (sample % (times.length - 1))])
    for (let i = 0; i < 25; i++) {
      task.run(
        `task-${i}`,
        id,
        `tool-${i % 10}`,
        i % 4 === 0 ? 'shell' : 'local_agent',
        statuses[i % 5],
        times[next(times.length)],
        times[next(times.length)],
      )
      if (i < 15) {
        item.run(
          `${id}-spawn-${i}`,
          id,
          i + 1,
          i % 7 === 0 ? null : `tool-${i % 12}`,
        )
        run.run(
          i % 3 === 0 ? `task-${i}` : `run-${i}`,
          id,
          `${id}-spawn-${i}`,
          statuses[next(5)],
          times[1 + next(times.length - 1)],
        )
      }
    }
    compare([id])
  }
  compare(ids)
  compare([ids[0], ids[0], 'missing'])
  expect(service.countParallelWork([])).toEqual(new Map())
})

it('F5 plan: linked work is materialized outside the per-task anti-join', () => {
  const { db, service } = bed()
  seedEvidenceFixture(db, 'fixture')
  const prepare = vi.spyOn(db, 'prepare')
  const start = performance.now()
  service.countParallelWork(['fixture'])
  const ms = performance.now() - start
  const query = prepare.mock.calls.find(([sql]) =>
    sql.startsWith('WITH requested'),
  )![0]
  const plan = db
    .prepare(`EXPLAIN QUERY PLAN ${query}`)
    .all('fixture', 'fixture', 'fixture', 'fixture') as {
    id: number
    parent: number
    detail: string
  }[]
  const linked = plan.find((row) => row.detail === 'MATERIALIZE linked')
  expect(linked).toBeDefined()
  const union = plan.find((row) => row.detail === 'UNION ALL')!
  for (
    let node = linked;
    node;
    node = plan.find((row) => row.id === node!.parent)
  )
    expect(node.id).not.toBe(union.id)
  expect(
    plan.filter((row) => row.detail === 'MATERIALIZE latest'),
  ).toHaveLength(1)
  const antiJoin = plan.find(
    (row) =>
      row.detail.startsWith('CORRELATED') &&
      plan.some(
        (child) =>
          child.parent === row.id &&
          /SEARCH a .*linked_task_id/.test(child.detail),
      ),
  )
  expect(antiJoin).toBeDefined()
  expect(
    plan
      .filter((row) => row.parent === antiJoin!.id)
      .every((row) => !/SUBQUERY|MATERIALIZE/.test(row.detail)),
  ).toBe(true)
  expect(plan.filter((row) => /SEARCH turn /.test(row.detail))).toHaveLength(1)
  console.log(
    `F5 count (253 runs / 2148 tasks / 1431 turns): ${ms.toFixed(3)} ms`,
  )
})

it('F5 apply: a single task or agent fact reads at most its own projection', () => {
  const { db, service } = bed()
  seedEvidenceFixture(db, 'fixture')
  const prepare = db.prepare.bind(db)
  let rows = 0
  vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
    const statement = prepare(sql)
    const all = statement.all.bind(statement)
    statement.all = (...args: unknown[]) => {
      const result = all(...args)
      rows += result.length
      return result
    }
    return statement
  })
  service.apply('fixture', null, {
    kind: 'task.changed',
    taskId: 'task-1',
    at: 'now',
    patch: { description: 'changed' },
  })
  expect(rows).toBe(1)
  rows = 0
  service.apply('fixture', null, {
    kind: 'agent.changed',
    spawnedByItemId: 'fixture-spawn-1',
    patch: { model: 'changed' },
  })
  expect(rows).toBe(1)
})
