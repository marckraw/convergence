import { afterEach, expect, it } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { HarnessEvidenceService } from './harness-evidence.service'

afterEach(() => {
  closeDatabase()
  resetDatabase()
})
function bed() {
  const db = getDatabase()
  db.prepare(
    "INSERT INTO sessions(id, context_kind, provider_id, name, working_directory) VALUES ('session','global','claude-code','fixture','/tmp')",
  ).run()
  db.prepare(
    "INSERT INTO session_turns(id,session_id,sequence,started_at,status) VALUES ('turn','session',1,'start','running')",
  ).run()
  return { db, service: new HarnessEvidenceService(db) }
}

it('R2 preserves spawn order across identity adoption — mutation order tied spawns by mutable provider id turns red', () => {
  const { service } = bed()
  for (const id of ['z-first', 'a-second'])
    service.apply('session', null, {
      kind: 'agent.started',
      run: {
        id,
        spawnedByItemId: id,
        agentType: null,
        description: null,
        model: null,
        depth: 1,
        startedAt: 'same-time',
        transcriptPath: null,
      },
    })
  service.apply('session', null, {
    kind: 'agent.identified',
    spawnedByItemId: 'z-first',
    id: 'zz-adopted',
    agentType: null,
    description: null,
    depth: 1,
    transcriptPath: null,
  })
  expect(
    service.listAgentRuns('session').map((run) => run.spawnedByItemId),
  ).toEqual(['z-first', 'a-second'])
})

it('persists agent identity, task state and turn cost — drop a projection/accounting write or identity adoption turns red', () => {
  const { db, service } = bed()
  service.apply('session', 'turn', {
    kind: 'agent.started',
    run: {
      id: 'tool',
      spawnedByItemId: 'call',
      agentType: 'Explore',
      description: 'fixture',
      model: null,
      depth: 1,
      startedAt: 'start',
      transcriptPath: null,
    },
  })
  db.prepare(
    "INSERT INTO session_conversation_items(id,session_id,sequence,kind,state,payload_json,created_at,updated_at,agent_run_id) VALUES ('child','session',1,'tool-call','complete','{}','start','start','tool')",
  ).run()
  service.apply('session', 'turn', {
    kind: 'agent.identified',
    spawnedByItemId: 'call',
    id: 'agent',
    agentType: null,
    description: null,
    depth: 1,
    transcriptPath: '/fixture/agent.jsonl',
  })
  service.apply('session', 'turn', {
    kind: 'agent.changed',
    spawnedByItemId: 'call',
    patch: {
      model: 'haiku',
      isBackgrounded: true,
      lastToolName: 'Read',
      usageJson: '{"total_tokens":12}',
      updatedAt: 'progress',
    },
  })
  service.apply('session', 'turn', {
    kind: 'agent.ended',
    spawnedByItemId: 'call',
    status: 'completed',
    at: 'end',
  })
  service.apply('session', 'turn', {
    kind: 'task.changed',
    taskId: 'task',
    at: 'start',
    patch: { status: 'running', toolUseId: 'bash' },
  })
  service.apply('session', 'turn', {
    kind: 'task.changed',
    taskId: 'task',
    at: 'end',
    patch: { status: 'stopped', endedAt: 'end' },
  })
  service.apply('session', 'turn', {
    kind: 'turn.accounting',
    resultSubtype: 'success',
    usage: { output_tokens: 7 },
    costUsd: 0.125,
    permissionDenials: [],
    subagentStats: { completed: 1 },
  })
  const reopened = new HarnessEvidenceService(db)
  expect({
    agents: reopened
      .listAgentRuns('session')
      .map((run) => [
        run.id,
        run.status,
        run.model,
        run.isBackgrounded,
        run.lastToolName,
        run.usageJson,
        run.updatedAt,
      ]),
    child: db
      .prepare(
        "SELECT agent_run_id FROM session_conversation_items WHERE id='child'",
      )
      .get(),
    tasks: reopened
      .listTasks('session')
      .map((task) => [task.taskId, task.toolUseId, task.status]),
    turn: db
      .prepare(
        "SELECT result_subtype,usage_json,cost_usd,permission_denials_json,subagent_stats_json FROM session_turns WHERE id='turn'",
      )
      .get(),
  }).toEqual({
    agents: [
      [
        'agent',
        'completed',
        'haiku',
        true,
        'Read',
        '{"total_tokens":12}',
        'progress',
      ],
    ],
    child: { agent_run_id: 'agent' },
    tasks: [['task', 'bash', 'stopped']],
    turn: {
      result_subtype: 'success',
      usage_json: '{"output_tokens":7}',
      cost_usd: 0.125,
      permission_denials_json: '[]',
      subagent_stats_json: '{"completed":1}',
    },
  })
})

it('persists unknown subtypes with byte and row bounds — drop unknown writes or either retention cap turns red', () => {
  const { db, service } = bed()
  for (let n = 0; n < 5002; n++)
    service.apply('session', null, {
      kind: 'harness.unknown',
      type: 'system',
      subtype: 'future_signal',
      payload: { n, text: '🧬'.repeat(n === 5001 ? 10000 : 1) },
      at: 'now',
    })
  expect({
    bounds: db
      .prepare(
        'SELECT count(*) AS count,min(sequence) AS first,max(sequence) AS last,max(length(CAST(payload_json AS BLOB))) <= 8192 AS bounded FROM session_harness_events',
      )
      .get(),
    last: db
      .prepare(
        'SELECT type,subtype FROM session_harness_events ORDER BY sequence DESC LIMIT 1',
      )
      .get(),
  }).toEqual({
    bounds: { count: 5000, first: 3, last: 5002, bounded: 1 },
    last: { type: 'system', subtype: 'future_signal' },
  })
})

it('L3 persists only changed agent and task rows — mutation upsert every folded row turns red', () => {
  const { db, service } = bed()
  for (const id of ['a', 'b']) {
    service.apply('session', null, {
      kind: 'agent.started',
      run: {
        id,
        spawnedByItemId: id,
        agentType: null,
        description: null,
        model: null,
        depth: 1,
        startedAt: 'start',
        transcriptPath: null,
      },
    })
    service.apply('session', null, {
      kind: 'task.changed',
      taskId: id,
      at: 'start',
      patch: { status: 'running' },
    })
  }
  db.exec(`CREATE TEMP TABLE writes(kind TEXT,id TEXT);
 CREATE TEMP TRIGGER agent_write AFTER UPDATE ON session_agent_runs BEGIN INSERT INTO writes VALUES ('agent',new.id); END;
 CREATE TEMP TRIGGER task_write AFTER UPDATE ON session_tasks BEGIN INSERT INTO writes VALUES ('task',new.task_id); END;`)
  service.apply('session', null, {
    kind: 'agent.changed',
    spawnedByItemId: 'a',
    patch: { lastToolName: 'Read' },
  })
  service.apply('session', null, {
    kind: 'task.changed',
    taskId: 'a',
    at: 'end',
    patch: { status: 'completed' },
  })
  expect(
    db.prepare('SELECT kind,id FROM writes ORDER BY kind,id').all(),
  ).toEqual([
    { kind: 'agent', id: 'a' },
    { kind: 'task', id: 'a' },
  ])
  db.exec('DELETE FROM writes')
  service.apply('session', null, {
    kind: 'agent.changed',
    spawnedByItemId: 'a',
    patch: { lastToolName: 'Read' },
  })
  service.apply('session', null, {
    kind: 'task.changed',
    taskId: 'a',
    at: 'end',
    patch: { status: 'completed' },
  })
  expect(db.prepare('SELECT * FROM writes').all()).toEqual([])
})

it('R11 persists the first terminal summary on both lists — drop a summary write or overwrite the second terminal turns red', () => {
  const { db, service } = bed()
  service.apply('session', 'turn', {
    kind: 'agent.started',
    run: {
      id: 'agent',
      spawnedByItemId: 'call',
      agentType: 'Explore',
      description: 'fixture',
      model: null,
      depth: 1,
      startedAt: 'start',
      transcriptPath: null,
    },
  })
  service.apply('session', 'turn', {
    kind: 'agent.ended',
    spawnedByItemId: 'call',
    status: 'failed',
    at: 'first',
    summary: 'first reason',
  } as Parameters<typeof service.apply>[2])
  service.apply('session', 'turn', {
    kind: 'agent.ended',
    spawnedByItemId: 'call',
    status: 'completed',
    at: 'second',
    summary: 'second reason',
  } as Parameters<typeof service.apply>[2])
  service.apply('session', 'turn', {
    kind: 'task.changed',
    taskId: 'task',
    at: 'first',
    patch: { status: 'failed', endedAt: 'first', endedSummary: 'first reason' },
  })
  service.apply('session', 'turn', {
    kind: 'task.changed',
    taskId: 'task',
    at: 'second',
    patch: {
      status: 'completed',
      endedAt: 'second',
      endedSummary: 'second reason',
    },
  })
  const reopened = new HarnessEvidenceService(db)
  expect(
    [
      reopened.listAgentRuns('session')[0],
      reopened.listTasks('session')[0],
    ].map((row) => ({
      status: row.status,
      endedAt: row.endedAt,
      summary: row.endedSummary,
    })),
  ).toEqual([
    { status: 'failed', endedAt: 'first', summary: 'first reason' },
    { status: 'failed', endedAt: 'first', summary: 'first reason' },
  ])
})

it('R5 summary counts are persisted unique identities — mutation include the local-agent task twice turns red', () => {
  const { service } = bed()
  service.apply('session', null, {
    kind: 'agent.started',
    run: {
      id: 'agent',
      spawnedByItemId: 'spawn',
      agentType: 'Explore',
      description: null,
      model: null,
      depth: 1,
      startedAt: 'now',
      transcriptPath: null,
    },
  })
  for (const [taskId, taskType, status] of [
    ['agent', 'local_agent', 'running'],
    ['monitor', 'monitor', 'running'],
    ['lost', 'local_bash', 'unknown'],
    ['failure', 'local_bash', 'failed'],
    ['stopped', 'local_bash', 'stopped'],
  ] as const)
    service.apply('session', null, {
      kind: 'task.changed',
      taskId,
      at: 'now',
      patch: { taskType, status },
    })
  expect(service.countParallelWork(['session']).get('session')).toEqual({
    running: 2,
    unknown: 1,
    failed: 1,
    stopped: 1,
  })
})

it('H3 SQL counts a missed adoption once by the spawning provider item — mutation match run id only turns red', () => {
  const { db, service } = bed()
  db.prepare(
    "INSERT INTO session_conversation_items(id,session_id,sequence,kind,state,payload_json,created_at,updated_at,provider_item_id) VALUES ('spawn','session',1,'tool-call','complete','{}','start','start','tool-spawn')",
  ).run()
  service.apply('session', null, {
    kind: 'agent.started',
    run: {
      id: 'provisional',
      spawnedByItemId: 'spawn',
      agentType: null,
      description: null,
      model: null,
      depth: 1,
      startedAt: 'start',
      transcriptPath: null,
    },
  })
  service.apply('session', null, {
    kind: 'task.changed',
    taskId: 'harness-agent',
    at: 'start',
    patch: {
      status: 'running',
      taskType: 'local_agent',
      toolUseId: 'tool-spawn',
    },
  })
  expect(service.countParallelWork(['session']).get('session')).toEqual({
    running: 1,
    unknown: 0,
    failed: 0,
    stopped: 0,
  })
})

it.each(['running', 'unknown'] as const)(
  'H2/H3 / R8 M3 backend link and terminal task settle a missed adoption — mutation running-only winner turns red (%s)',
  (status) => {
    const { db, service } = bed()
    db.prepare(
      "INSERT INTO session_conversation_items(id,session_id,sequence,kind,state,payload_json,created_at,updated_at,provider_item_id) VALUES ('spawn','session',1,'tool-call','complete','{}','start','start','tool-spawn')",
    ).run()
    service.apply('session', null, {
      kind: 'agent.started',
      run: {
        id: 'provisional',
        spawnedByItemId: 'spawn',
        agentType: null,
        description: null,
        model: null,
        depth: 1,
        startedAt: 'start',
        transcriptPath: null,
      },
    })
    service.apply('session', null, {
      kind: 'task.changed',
      taskId: 'harness-agent',
      at: 'start',
      patch: {
        status: 'running',
        taskType: 'local_agent',
        toolUseId: 'tool-spawn',
      },
    })
    service.apply('session', null, {
      kind: 'task.changed',
      taskId: 'harness-agent',
      at: 'end',
      patch: { status: 'completed', endedAt: 'end' },
    })
    if (status === 'unknown')
      service.apply('session', null, {
        kind: 'process.ended',
        at: 'exit',
        reason: 'exit',
      })
    expect({
      link: service.listAgentRuns('session')[0].taskId,
      counts: service.countParallelWork(['session']).get('session'),
    }).toEqual({
      link: 'harness-agent',
      counts: { running: 0, unknown: 0, failed: 0, stopped: 0 },
    })
  },
)

it('RUN61 persists a typed harness fact and its turn in the existing table — mutation skip typed write', () => {
  const { db, service } = bed()
  const fact = {
    kind: 'harness.compaction' as const,
    at: 'boundary',
    trigger: 'manual',
    preTokens: 20686,
    postTokens: 4630,
    durationMs: 14465,
  }
  service.apply('session', 'turn', fact)
  expect(
    db
      .prepare(
        'SELECT type,subtype,payload_json,created_at FROM session_harness_events',
      )
      .all(),
  ).toEqual([
    {
      type: 'harness.compaction',
      subtype: null,
      payload_json: JSON.stringify({ ...fact, turnId: 'turn' }),
      created_at: 'boundary',
    },
  ])
})

it('RUN61 reads typed evidence and process endings through the durable fold — mutation omit read or process record', () => {
  const { service } = bed()
  service.apply('session', 'turn', {
    kind: 'harness.retry',
    phase: 'attempt',
    attempt: 1,
    maxRetries: 10,
    retryDelayMs: 615,
    errorStatus: null,
    message: 'unknown',
    noResponse: null,
    at: 'retry',
  })
  service.apply('session', null, { kind: 'process.ended', at: 'exit' })
  expect(service.harnessFacts('session').currentTurn?.retries?.state).toBe(
    'unknown',
  )
})

it('RUN61 reads legacy recorded harness events without backfill — mutation omit legacy decoder turns red', () => {
  const { db, service } = bed()
  db.prepare(
    "UPDATE session_turns SET started_at='2026-09-09T00:00:00.000Z'",
  ).run()
  service.apply('session', null, {
    kind: 'harness.unknown',
    type: 'system',
    subtype: 'hook_started',
    payload: {
      type: 'system',
      subtype: 'hook_started',
      hook_id: 'legacy',
      hook_name: 'Old hook',
      hook_event: 'PreToolUse',
    },
    at: '2026-09-09T00:00:01.000Z',
  })
  expect(service.harnessFacts('session').currentTurn?.hooks).toEqual([
    {
      id: 'legacy',
      name: 'Old hook',
      event: 'PreToolUse',
      status: 'running',
      startedAt: '2026-09-09T00:00:01.000Z',
      durationMs: null,
      output: null,
    },
  ])
})
