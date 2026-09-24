import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { buildParallelWork } from '../../../src/shared/lib/parallel-work.pure'
import type { ConversationItem } from './conversation-item.types'
import { SessionService } from './session.service'

/**
 * The parallel-work panel's reads by id (MAR-3310 O0b). Each read is proven
 * equal to what the panel computes today from the whole loaded conversation,
 * on the real schema, so a window can later stand in for the whole list.
 */
describe('SessionService — parallel-work reads by id (MAR-3310 O0b)', () => {
  let db: Database.Database
  let service: SessionService
  let temp: string
  let sessionId: string

  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), 'convergence-o0b-reads-'))
    const repo = join(temp, 'repo')
    mkdirSync(join(repo, '.git'), { recursive: true })
    db = getDatabase(join(temp, 'convergence.db'))
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('o0b', 'o0b', ?)",
    ).run(repo)
    service = new SessionService(
      db,
      new LocalExecutionHost(new ProviderRegistry()),
      join(temp, 'sessions'),
    )
    sessionId = service.create({
      projectId: 'o0b',
      workspaceId: null,
      providerId: 'test-provider',
      model: null,
      effort: null,
      name: 'o0b',
    }).id
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(temp, { recursive: true, force: true })
  })

  interface Seed {
    kind: string
    payload: Record<string, unknown>
    agentRunId?: string
    taskId?: string
    eventType?: string
  }

  function seed(items: Seed[], session = sessionId): string[] {
    const insert = db.prepare(
      `INSERT INTO session_conversation_items (
         id, session_id, sequence, kind, state, payload_json, provider_event_type,
         agent_run_id, task_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'complete', ?, ?, ?, ?, 'at', 'at')`,
    )
    const base =
      (
        db
          .prepare(
            'SELECT MAX(sequence) AS top FROM session_conversation_items WHERE session_id = ?',
          )
          .get(session) as { top: number | null }
      ).top ?? 0
    return db.transaction(() =>
      items.map((item, index) => {
        const id = `${session}-${base + index + 1}`
        insert.run(
          id,
          session,
          base + index + 1,
          item.kind,
          JSON.stringify(item.payload),
          item.eventType ?? null,
          item.agentRunId ?? null,
          item.taskId ?? null,
        )
        return id
      }),
    )()
  }

  function run(id: string, spawnedByItemId: string): void {
    db.prepare(
      `INSERT INTO session_agent_runs (id, session_id, spawned_by_item_id, status, started_at)
       VALUES (?, ?, ?, 'running', ?)`,
    ).run(id, sessionId, spawnedByItemId, `2026-09-09T00:00:0${id.length}Z`)
  }

  const message = (text: string, agentRunId?: string, taskId?: string) => ({
    kind: 'message',
    payload: { actor: 'assistant', text },
    agentRunId,
    taskId,
  })

  it('R1 run and task reads equal the loaded conversation filtered by the same ids, in sequence order, including an item carrying both ids — mutations drop the sequence merge or read the other column turn red', () => {
    seed([
      message('main'),
      message('a1', 'a'),
      message('b1', 'b'),
      message('t1', undefined, 't'),
      message('a2 and t', 'a', 't'),
      message('u1', undefined, 'u'),
      message('b2', 'b'),
      {
        kind: 'note',
        payload: { level: 'info', text: 'done' },
        taskId: 't',
        eventType: 'harness.task.terminal',
      },
      message('a3', 'a'),
    ])
    const other = service.create({
      projectId: 'o0b',
      workspaceId: null,
      providerId: 'test-provider',
      model: null,
      effort: null,
      name: 'other',
    }).id
    seed([message('elsewhere', 'a', 't')], other)
    const all = service.getConversation(sessionId)
    const byRun = (ids: string[]) =>
      all.filter((item) => ids.includes(item.agentRunId ?? ''))
    const byTask = (ids: string[]) =>
      all.filter((item) => ids.includes(item.taskId ?? ''))
    const cases = [['a'], ['a', 'b'], ['b', 'a', 'b'], ['t'], ['t', 'u'], []]
    expect({
      runs: cases.map((ids) => service.listRunItems(sessionId, ids)),
      tasks: cases.map((ids) => service.listTaskItems(sessionId, ids)),
    }).toEqual({
      runs: cases.map(byRun),
      tasks: cases.map(byTask),
    })
    expect(
      service.listTaskItems(sessionId, ['t']).map((item) => item.kind),
    ).toEqual(['message', 'message', 'note'])
  })

  it('R4 a run knows its parent from its spawning item, and the tree built from it equals the tree built from the whole loaded list — mutation read the parent from the wrong column turns red', () => {
    const [rootSpawn, childSpawn, grandSpawn, strangerSpawn] = seed([
      { kind: 'tool-call', payload: { toolName: 'Agent', inputText: '{}' } },
      {
        kind: 'tool-call',
        payload: { toolName: 'Agent', inputText: '{}' },
        agentRunId: 'root',
        taskId: 'not-a-run',
      },
      {
        kind: 'tool-call',
        payload: { toolName: 'Agent', inputText: '{}' },
        agentRunId: 'child',
      },
      {
        kind: 'tool-call',
        payload: { toolName: 'Agent', inputText: '{}' },
        agentRunId: 'gone',
      },
    ])
    run('root', rootSpawn!)
    run('child', childSpawn!)
    run('grand', grandSpawn!)
    run('stranger', strangerSpawn!)
    run('lost', 'never-recorded')
    const runs = service.listAgentRuns(sessionId)
    const tasks = service.listTasks(sessionId)
    // The tree as the panel built it before O0b: each run's parent is the run
    // of its spawning item, found in the loaded conversation.
    const items = service.getConversation(sessionId)
    const runIds = new Set(runs.map((entry) => entry.id))
    const today = runs.map((entry) => {
      const parent = items.find(
        (item) => item.id === entry.spawnedByItemId,
      )?.agentRunId
      return [
        entry.id,
        parent && parent !== entry.id && runIds.has(parent) ? parent : null,
      ]
    })
    expect({
      parentRunIds: Object.fromEntries(
        runs.map((entry) => [entry.id, entry.parentRunId]),
      ),
      tree: buildParallelWork(runs, tasks).map((row) => [row.id, row.parentId]),
    }).toEqual({
      parentRunIds: {
        root: null,
        child: 'root',
        grand: 'child',
        stranger: 'gone',
        lost: null,
      },
      tree: today,
    })
  })

  // The transcript's actionable passes (session-transcript.container.tsx),
  // evaluated with the session running, a live handle, and attention matching
  // the request's kind.
  function actionableToday(items: ConversationItem[]): string[] {
    return items
      .filter((item) =>
        item.kind === 'approval-request'
          ? item.resolution === 'pending' || item.resolution === undefined
          : item.kind === 'input-request' &&
            (item.resolution === 'pending' || item.resolution === undefined) &&
            (item.request?.kind === 'choice' ||
              item.request?.kind === 'plan' ||
              item.request?.kind === 'form' ||
              item.request?.kind === 'url'),
      )
      .map((item) => item.id)
  }

  const plan = { kind: 'plan', plan: 'Do it' }
  const url = {
    kind: 'url',
    title: 'Sign in',
    message: 'Open the page',
    url: 'https://example.com',
  }
  const approval = (resolution?: unknown) => ({
    kind: 'approval-request',
    payload: {
      description: 'May I?',
      ...(resolution === undefined ? {} : { resolution }),
    },
  })
  const input = (resolution?: unknown, request: unknown = plan) => ({
    kind: 'input-request',
    payload: {
      prompt: 'Which?',
      request,
      ...(resolution === undefined ? {} : { resolution }),
    },
  })

  it('R7 only explicit pending requests are pins; absent, malformed and answered history are excluded', () => {
    seed([
      approval('pending'),
      approval(),
      approval('approved'),
      approval('denied'),
      // A value the reader does not recognise reads as absent there, and here.
      approval('maybe'),
      approval(null),
      message('noise'),
      input('pending'),
      input(),
      input('approved'),
      input('denied', url),
      input(undefined, url),
    ])
    const pending = service.listPendingRequestItems(sessionId)
    expect({
      ids: pending.map((item) => item.id).sort(),
      newestFirst: pending.map((item) => item.sequence),
    }).toEqual({
      ids: [`${sessionId}-1`, `${sessionId}-8`].sort(),
      newestFirst: [8, 1],
    })
  })

  it('R5 an awaiting request the transcript cannot render as actionable (a text prompt, a malformed request) is still returned — the renderer keeps its own request-kind gate', () => {
    const [text, malformed] = seed([
      input('pending', { kind: 'text', prompt: 'Name?' }),
      input('pending', { kind: 'url', url: 'https://example.com' }),
    ])
    expect({
      main: service.listPendingRequestItems(sessionId).map((item) => item.id),
      transcript: actionableToday(service.getConversation(sessionId)),
    }).toEqual({ main: [malformed, text], transcript: [] })
  })

  it('R5 is bounded: the newest 50, newest first — mutation drop the LIMIT turns red', () => {
    seed(Array.from({ length: 60 }, () => approval('pending')))
    const pending = service.listPendingRequestItems(sessionId)
    expect({
      count: pending.length,
      first: pending[0]?.sequence,
      last: pending.at(-1)?.sequence,
    }).toEqual({ count: 50, first: 60, last: 11 })
  })

  it('R10 results return only the latest terminal note per task for 60 x 400 children, with an indexed bounded plan', () => {
    const taskIds = Array.from({ length: 60 }, (_, i) => `task-${i}`)
    seed(
      taskIds.flatMap((taskId) => [
        ...Array.from({ length: 400 }, () =>
          message('x'.repeat(1000), taskId, taskId),
        ),
        {
          kind: 'note',
          taskId,
          eventType: 'harness.task.terminal',
          payload: { level: 'info', text: 'old result' },
        },
        {
          kind: 'note',
          taskId,
          eventType: 'harness.task.terminal',
          payload: { level: 'info', text: 'latest result' },
        },
        {
          kind: 'message',
          taskId,
          eventType: 'harness.task.terminal',
          payload: { actor: 'assistant', text: 'not a note' },
        },
        {
          kind: 'note',
          taskId,
          eventType: 'harness.task.progress',
          payload: { level: 'info', text: 'not terminal' },
        },
      ]),
    )
    db.exec('ANALYZE')
    const prepare = vi.spyOn(db, 'prepare')
    const items = service.listTaskResultNotes(sessionId, [
      ...taskIds,
      taskIds[0]!,
    ])
    expect(items).toHaveLength(60)
    expect(
      items.every(
        (item) => item.kind === 'note' && item.text === 'latest result',
      ),
    ).toBe(true)
    const sql = prepare.mock.calls
      .map(([sql]) => sql)
      .find((sql) =>
        sql.includes("items.provider_event_type = 'harness.task.terminal'"),
      )!
    expect(sql).toMatch(/LIMIT 1/)
    const plan = db
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(sessionId, taskIds[0]) as { detail: string }[]
    expect(plan[0]?.detail).toMatch(
      /USING INDEX idx_session_conversation_items_task/,
    )
    expect(plan.map((row) => row.detail).join('\n')).not.toMatch(
      /TEMP B-TREE|SCAN items/,
    )
    console.log(
      'R10 panel result notes:',
      JSON.stringify({
        children: 24000,
        items: items.length,
        bytes: Buffer.byteLength(JSON.stringify(items)),
      }),
    )
    prepare.mockRestore()
  })
})
