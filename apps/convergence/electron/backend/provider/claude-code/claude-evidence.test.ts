import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { expect, it, vi } from 'vitest'
import * as fs from 'fs'
vi.mock('fs', async (original) => {
  const actual = await original<typeof import('fs')>()
  return {
    ...actual,
    readdirSync: vi.fn(actual.readdirSync),
    readFileSync: vi.fn(actual.readFileSync),
  }
})
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

it('M2 retains omitted progress fields — mutation emit absent fields as null turns red', () => {
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
    'first',
  )
  f.adapter.consume(
    { type: 'system', subtype: 'task_progress', task_id: 'agent' },
    'second',
  )
  expect(
    f.runs().map((run) => [run.lastToolName, run.usageJson, run.updatedAt]),
  ).toEqual([['Read', '{"total_tokens":12}', 'second']])
})
it('M1 stops metadata IO once identified and remembers unmatched files — mutation remove awaiting gate or unmatched cache turns red', () => {
  const dir = mkdtempSync(join(tmpdir(), 'run54-r2-meta-'))
  const metaDir = join(dir, 'projects', '-fixture', 'harness', 'subagents')
  mkdirSync(metaDir, { recursive: true })
  writeFileSync(
    join(metaDir, 'agent-foreign.meta.json'),
    JSON.stringify({ toolUseId: 'old-turn' }),
  )
  const adapter = new ClaudeEvidenceService(
    '/fixture',
    () => dir,
    () => {},
  )
  try {
    adapter.consume(
      { type: 'system', subtype: 'init', session_id: 'harness' },
      'init',
    )
    adapter.toolCall(
      {},
      { id: 'spawn', name: 'Agent', input: {} },
      'call',
      'start',
    )
    vi.mocked(fs.readFileSync).mockClear()
    for (let n = 0; n < 3; n++)
      adapter.consume({ type: 'system', subtype: 'status' }, 'waiting')
    const unmatchedReads = vi.mocked(fs.readFileSync).mock.calls.length
    vi.mocked(fs.readFileSync).mockClear()
    writeFileSync(
      join(metaDir, 'agent-new.meta.json'),
      JSON.stringify({ toolUseId: 'another-old-turn' }),
    )
    adapter.consume({ type: 'system', subtype: 'status' }, 'listing-change')
    const changedListingReads = vi.mocked(fs.readFileSync).mock.calls.length
    adapter.consume(
      {
        type: 'system',
        subtype: 'task_started',
        task_type: 'local_agent',
        task_id: 'agent',
        tool_use_id: 'spawn',
      },
      'identified',
    )
    vi.mocked(fs.readdirSync).mockClear()
    vi.mocked(fs.readFileSync).mockClear()
    for (let n = 0; n < 10; n++)
      adapter.consume({ type: 'system', subtype: 'status' }, 'after')
    expect({
      unmatchedReads,
      changedListingReads,
      reads: vi.mocked(fs.readFileSync).mock.calls.length,
      scans: vi.mocked(fs.readdirSync).mock.calls.length,
    }).toEqual({
      unmatchedReads: 0,
      changedListingReads: 2,
      reads: 0,
      scans: 0,
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
it('L1 keeps the adopted id when a later scan finds a different meta filename — mutation overwrite adopted id turns red', () => {
  const dir = mkdtempSync(join(tmpdir(), 'run54-r2-authority-'))
  const metaDir = join(dir, 'projects', '-fixture', 'harness', 'subagents')
  mkdirSync(metaDir, { recursive: true })
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
      'call',
      'start',
    )
    adapter.consume(
      {
        type: 'system',
        subtype: 'task_started',
        task_type: 'local_agent',
        task_id: 'authoritative',
        tool_use_id: 'spawn',
      },
      'identified',
    )
    writeFileSync(
      join(metaDir, 'agent-different.meta.json'),
      JSON.stringify({
        toolUseId: 'spawn',
        description: 'From meta',
        agentType: 'Explore',
        spawnDepth: 3,
      }),
    )
    adapter.toolCall(
      {},
      { id: 'pending', name: 'Agent', input: {} },
      'pending-call',
      'pending',
    )
    expect(
      runs
        .filter((run) => run.spawnedByItemId === 'call')
        .map((run) => [run.id, run.description, run.depth, run.transcriptPath]),
    ).toEqual([
      ['authoritative', 'From meta', 3, join(metaDir, 'agent-different.jsonl')],
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
it('M4 result-only adoption and completion need no task event or meta — mutation drop structured agentId or completed result turns red', () => {
  const f = fixture()
  f.call()
  f.adapter.toolResult(
    {
      tool_use_result: {
        agentId: 'result-agent',
        status: 'completed',
        resolvedModel: 'haiku',
      },
    },
    { tool_use_id: 'spawn', content: 'done' },
    'end',
  )
  expect(
    f.runs().map((run) => [run.id, run.status, run.endedAt, run.model]),
  ).toEqual([['result-agent', 'completed', 'end', 'haiku']])
})

it.each([
  '  exact error\nreason  ',
  [{ type: 'text', text: '  exact error\nreason  ' }],
])(
  'R11 failed Agent result and task terminal carry their reported summary — drop summary or serialize text blocks turns red (%j)',
  (content) => {
    const { adapter, call, start, runs } = fixture()
    call()
    start()
    adapter.toolResult(
      {},
      {
        tool_use_id: 'spawn',
        is_error: true,
        content,
      },
      'end',
    )
    call('second')
    start({ tool_use_id: 'second', task_id: 'other-agent' })
    adapter.consume(
      {
        type: 'system',
        subtype: 'task_notification',
        task_id: 'other-agent',
        status: 'failed',
        summary: 'task reason',
      },
      'end',
    )
    expect(runs().map((run) => run.endedSummary)).toEqual([
      '  exact error\nreason  ',
      'task reason',
    ])
  },
)
