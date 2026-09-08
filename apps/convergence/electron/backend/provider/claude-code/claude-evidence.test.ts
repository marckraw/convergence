import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { expect, it } from 'vitest'
import { ClaudeEvidenceService } from './claude-evidence.service'
import { foldAgentRuns } from '../../session/harness-evidence.pure'
import type {
  HarnessEvidence,
  SessionAgentRun,
} from '../../session/harness-evidence.types'

function fixture() {
  let runs: SessionAgentRun[] = []
  const facts: HarnessEvidence[] = []
  const adapter = new ClaudeEvidenceService(
    '/fixture',
    () => '/missing-run54-account',
    (fact) => {
      facts.push(fact)
      if (fact.kind.startsWith('agent.') || fact.kind === 'process.ended')
        runs = foldAgentRuns(
          runs,
          fact as Parameters<typeof foldAgentRuns>[1],
          'session',
        )
    },
  )
  const call = (id = 'spawn', parent?: string) =>
    adapter.toolCall(
      { parent_tool_use_id: parent },
      {
        id,
        name: 'Agent',
        input: { subagent_type: 'Explore', description: 'Read fixture' },
      },
      `item-${id}`,
      'start',
    )
  const start = (extra = {}) =>
    adapter.consume(
      {
        type: 'system',
        subtype: 'task_started',
        task_type: 'local_agent',
        task_id: 'agent',
        tool_use_id: 'spawn',
        spawn_depth: 1,
        is_backgrounded: true,
        ...extra,
      },
      'started',
    )
  const result = (status: string) =>
    adapter.toolResult(
      { tool_use_result: { status, resolvedModel: 'haiku' } },
      { tool_use_id: 'spawn', content: 'ack' },
      'result',
    )
  const update = (status: string) =>
    adapter.consume(
      {
        type: 'system',
        subtype: 'task_updated',
        task_id: 'agent',
        patch: { status },
      },
      'terminal',
    )
  return { adapter, call, start, result, update, facts, runs: () => runs }
}

it('background launch stays running until the task ends — mutation complete on async_launched turns red', () => {
  const f = fixture()
  f.call()
  f.start()
  f.result('async_launched')
  expect(f.runs().map(({ status, model }) => ({ status, model }))).toEqual([
    { status: 'running', model: 'haiku' },
  ])
  f.update('completed')
  expect(f.runs()[0].status).toBe('completed')
})
it('foreground completion has one terminal moment — mutation drop terminal dedupe turns red', () => {
  const f = fixture()
  f.call()
  f.start({ is_backgrounded: false })
  f.update('completed')
  f.result('completed')
  f.adapter.consume(
    {
      type: 'system',
      subtype: 'task_notification',
      task_id: 'agent',
      status: 'failed',
    },
    'later',
  )
  expect({
    runs: f
      .runs()
      .map(({ status, endedAt, model }) => ({ status, endedAt, model })),
    ends: f.facts.filter((fact) => fact.kind === 'agent.ended').length,
  }).toEqual({
    runs: [{ status: 'completed', endedAt: 'terminal', model: 'haiku' }],
    ends: 1,
  })
})
it('task kill ends the adopted agent — mutation ignore killed turns red', () => {
  const f = fixture()
  f.call()
  f.start()
  f.update('killed')
  expect(f.runs()[0].status).toBe('stopped')
})
it('an unanswered background run becomes unknown on process exit — mutation complete on exit turns red', () => {
  const f = fixture()
  f.call()
  f.start()
  f.result('async_launched')
  f.adapter.processEnded('exit')
  expect({ status: f.runs()[0].status, endedAt: f.runs()[0].endedAt }).toEqual({
    status: 'unknown',
    endedAt: 'exit',
  })
})
it('task birth adopts the same provisional row — mutation create a second run turns red', () => {
  const f = fixture()
  f.call()
  const before = f.runs()[0].spawnedByItemId
  f.start({ spawn_depth: 2 })
  expect(
    f.runs().map(({ id, spawnedByItemId, depth, isBackgrounded }) => ({
      id,
      spawnedByItemId,
      depth,
      isBackgrounded,
    })),
  ).toEqual([
    { id: 'agent', spawnedByItemId: before, depth: 2, isBackgrounded: true },
  ])
})
it('progress and subagent accounting survive — mutation discard task_progress or subagent_stats turns red', () => {
  const f = fixture()
  f.call()
  f.start()
  f.adapter.consume(
    {
      type: 'system',
      subtype: 'task_progress',
      task_id: 'agent',
      last_tool_name: 'Read',
      usage: { total_tokens: 12 },
    },
    'progress',
  )
  f.adapter.accounting({ subagent_stats: { completed: 1 } })
  expect({
    progress: f.runs().map(({ lastToolName, usageJson, updatedAt }) => ({
      lastToolName,
      usageJson,
      updatedAt,
    })),
    accounting: f.facts.find((fact) => fact.kind === 'turn.accounting'),
  }).toMatchObject({
    progress: [
      {
        lastToolName: 'Read',
        usageJson: '{"total_tokens":12}',
        updatedAt: 'progress',
      },
    ],
    accounting: { subagentStats: { completed: 1 } },
  })
})

it('nested tool ownership follows its immediate parent — mutation erase parent identity turns red', () => {
  const f = fixture()
  f.call()
  f.start()
  f.call('nested', 'spawn')
  f.adapter.consume(
    {
      type: 'system',
      subtype: 'task_started',
      task_type: 'local_agent',
      task_id: 'nested-agent',
      tool_use_id: 'nested',
      spawn_depth: 2,
    },
    'nested-start',
  )
  expect({
    identity: f.adapter.identity({ parent_tool_use_id: 'nested' }, 'read'),
    runs: f.runs().map((run) => [run.id, run.depth]),
  }).toEqual({
    identity: { agentRunId: 'nested-agent', taskId: 'nested-agent' },
    runs: [
      ['agent', 1],
      ['nested-agent', 2],
    ],
  })
})

it('meta alone resolves the harness id and depth — mutation skip meta reading turns red', () => {
  const dir = mkdtempSync(join(tmpdir(), 'run54-meta-'))
  const metaDir = join(dir, 'projects', '-fixture', 'harness', 'subagents')
  mkdirSync(metaDir, { recursive: true })
  writeFileSync(
    join(metaDir, 'agent-meta-agent.meta.json'),
    JSON.stringify({
      toolUseId: 'spawn',
      agentType: 'Explore',
      description: 'From meta',
      spawnDepth: 3,
    }),
  )
  let runs: SessionAgentRun[] = []
  const adapter = new ClaudeEvidenceService(
    '/fixture',
    () => dir,
    (fact) => {
      if (fact.kind.startsWith('agent.'))
        runs = foldAgentRuns(
          runs,
          fact as Parameters<typeof foldAgentRuns>[1],
          'session',
        )
    },
  )
  try {
    adapter.consume(
      { type: 'system', subtype: 'init', session_id: 'harness' },
      'init',
    )
    adapter.toolCall(
      {},
      { id: 'spawn', name: 'Agent', input: {} },
      'local-call',
      'start',
    )
    expect(
      runs.map((run) => ({
        id: run.id,
        depth: run.depth,
        description: run.description,
        agentType: run.agentType,
        path: run.transcriptPath,
      })),
    ).toEqual([
      {
        id: 'meta-agent',
        depth: 3,
        description: 'From meta',
        agentType: 'Explore',
        path: join(metaDir, 'agent-meta-agent.jsonl'),
      },
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
