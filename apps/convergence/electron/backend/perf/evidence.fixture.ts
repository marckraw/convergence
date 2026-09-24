import type Database from 'better-sqlite3'
import { execFileSync } from 'node:child_process'
import { HarnessEvidenceService } from '../session/harness-evidence.service'

/** Run the scheduled product callback once, with its real listeners attached. */
export function measureEvidenceTick(schedule: () => void): number {
  const original = globalThis.setTimeout
  let tick: (() => void) | undefined
  Reflect.set(
    globalThis,
    'setTimeout',
    (callback: () => void, delay: number) => {
      if (delay !== 250 || tick)
        throw new Error('Expected one evidence debounce')
      const handle = original(callback, delay)
      clearTimeout(handle)
      tick = callback
      return handle
    },
  )
  try {
    schedule()
  } finally {
    globalThis.setTimeout = original
  }
  if (!tick) throw new Error('Evidence tick was not scheduled')
  const started = performance.now()
  tick()
  return performance.now() - started
}

/** Measure the actual prepared count query on a disposable real-schema copy. */
export async function measureEvidenceCount(
  db: Database.Database,
  sessionId: string,
  copyPath: string,
) {
  const shape = db
    .prepare(
      `SELECT
    (SELECT COUNT(*) FROM session_agent_runs WHERE session_id=?) AS runs,
    (SELECT COUNT(*) FROM session_tasks WHERE session_id=?) AS tasks,
    (SELECT COUNT(*) FROM session_turns WHERE session_id=?) AS turns
  `,
    )
    .get(sessionId, sessionId, sessionId) as {
    runs: number
    tasks: number
    turns: number
  }
  const prepare = db.prepare
  let query = ''
  let bindings: unknown[] = []
  db.prepare = function (this: Database.Database, sql: string) {
    const statement = prepare.call(this, sql)
    const all = statement.all
    statement.all = function (...args: unknown[]) {
      query = sql
      bindings = args
      return Reflect.apply(all, this, args)
    }
    return statement
  } as typeof db.prepare
  const started = performance.now()
  try {
    new HarnessEvidenceService(db).countParallelWork([sessionId])
  } finally {
    db.prepare = prepare
  }
  const countMs = performance.now() - started
  await db.backup(copyPath)
  // CLI VM-step counters include repeated scans hidden behind one all() call.
  // Only synthetic session IDs are interpolated into this diagnostic query.
  let index = 0
  const sql = query.replace(
    /\?/g,
    () => `'${String(bindings[index++]).replaceAll("'", "''")}'`,
  )
  const output = execFileSync('sqlite3', [copyPath, '.stats vmstep', sql], {
    encoding: 'utf8',
  })
  const match = output.match(/VM-steps: (\d+)/)
  if (!match)
    throw new Error('sqlite3 did not report VM steps for the evidence count')
  return { shape, countMs, vmSteps: Number(match[1]) }
}

/** Synthetic Fable-seat shape; never reads a user's database. */
export function seedEvidenceFixture(db: Database.Database, sessionId: string) {
  const at = '2026-09-25T00:00:00.000Z'
  db.transaction(() => {
    const turn = db.prepare(
      `INSERT INTO session_turns(id,session_id,sequence,started_at,status) VALUES (?,?,?,?,'completed')`,
    )
    for (let i = 0; i < 1431; i++)
      turn.run(`${sessionId}-turn-${i}`, sessionId, i + 1, at)
    const task = db.prepare(
      `INSERT INTO session_tasks(task_id,session_id,tool_use_id,task_type,status,started_at,observed_at) VALUES (?,?,?,'local_agent',?,?,?)`,
    )
    for (let i = 0; i < 2148; i++)
      task.run(
        `task-${i}`,
        sessionId,
        `tool-${i % 200}`,
        i % 5 === 0 ? 'running' : 'completed',
        at,
        at,
      )
    const item = db.prepare(
      `INSERT INTO session_conversation_items(id,session_id,sequence,kind,state,payload_json,provider_item_id,created_at,updated_at) VALUES (?,?,?,'tool-call','complete','{}',?,?,?)`,
    )
    const run = db.prepare(
      `INSERT INTO session_agent_runs(id,session_id,spawned_by_item_id,status,started_at) VALUES (?,?,?,'running',?)`,
    )
    for (let i = 0; i < 253; i++) {
      const spawn = `${sessionId}-spawn-${i}`
      item.run(spawn, sessionId, i + 1, `tool-${i}`, at, at)
      run.run(i % 3 === 0 ? `task-${i}` : `run-${i}`, sessionId, spawn, at)
    }
    db.prepare('UPDATE sessions SET last_sequence=253 WHERE id=?').run(
      sessionId,
    )
  })()
}
