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
      {
        message: { content: [{ type: 'tool_result', tool_use_id: 'spawn' }] },
        tool_use_result: { status, resolvedModel: 'haiku' },
      },
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
      message: { content: [{ type: 'tool_result', tool_use_id: 'spawn' }] },
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
      { message: { content: [{ type: 'tool_result', tool_use_id: 'spawn' }] } },
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

it('H1 Agent+Agent batch cannot adopt, decorate or end the unclaimed run — mutation trust root in identity reader turns red', () => {
  const f = fixture()
  f.call('a')
  f.call('b')
  f.start({ task_id: 'adopted-a', tool_use_id: 'a' })
  const blocks = [
    { type: 'tool_result', tool_use_id: 'a', content: 'A returned' },
    { type: 'tool_result', tool_use_id: 'b', content: 'B still working' },
  ]
  const event = {
    message: { content: blocks },
    tool_use_result: {
      agentId: 'adopted-a',
      status: 'completed',
      resolvedModel: 'haiku',
    },
  }
  for (const block of blocks) f.adapter.toolResult(event, block, 'end')
  expect(
    f.runs().map(({ id, status, model }) => ({ id, status, model })),
  ).toEqual([
    { id: 'adopted-a', status: 'completed', model: 'haiku' },
    { id: 'b', status: 'running', model: null },
  ])
})

it('R8 H1 both block-local errors end unadopted agents without a root result — mutation gate block errors turns red', () => {
  const f = fixture()
  f.call('a')
  f.call('b')
  const blocks = ['a', 'b'].map((id) => ({
    type: 'tool_result',
    tool_use_id: id,
    is_error: true,
    content: `  ${id} interrupted\nreason  `,
  }))
  for (const block of blocks)
    f.adapter.toolResult({ message: { content: blocks } }, block, 'end')
  expect(
    f.runs().map((run) => [run.id, run.status, run.endedAt, run.endedSummary]),
  ).toEqual([
    ['a', 'failed', 'end', '  a interrupted\nreason  '],
    ['b', 'failed', 'end', '  b interrupted\nreason  '],
  ])
})

it.each([
  [
    { type: 'system', subtype: 'hook_started', hook_id: 'hook' },
    'harness.hook',
  ],
  [{ type: 'system', subtype: 'api_retry', attempt: 1 }, 'harness.retry'],
  [
    {
      type: 'system',
      subtype: 'compact_boundary',
      compact_metadata: { trigger: 'manual' },
    },
    'harness.compaction',
  ],
  [
    { type: 'system', subtype: 'permission_denied', tool_name: 'Bash' },
    'harness.denial',
  ],
  [
    { type: 'rate_limit_event', rate_limit_info: { status: 'rejected' } },
    'harness.rateLimit',
  ],
  [{ type: 'system', subtype: 'init' }, 'harness.init'],
])('RUN61 emits %j as %s — mutation remove family mapping', (wire, kind) => {
  const f = fixture()
  f.adapter.consume(wire, 'now')
  expect(f.facts.map((fact) => fact.kind)).toEqual([kind])
})

it.each([
  [
    'message_start',
    1,
    { type: 'stream_event', event: { type: 'message_start' } },
    'succeeded',
    null,
  ],
  [
    'assistant fallback',
    1,
    { type: 'assistant', message: { content: [] } },
    'succeeded',
    null,
  ],
  [
    'error result',
    1,
    { type: 'result', subtype: 'error_during_execution' },
    'failed',
    'error_during_execution',
  ],
  [
    'error flag',
    1,
    { type: 'result', subtype: 'other', is_error: true },
    'failed',
    'other',
  ],
  [
    'all outstanding attempts',
    2,
    { type: 'stream_event', event: { type: 'message_start' } },
    'succeeded',
    null,
  ],
] as const)(
  'R4prime %s records resolution — mutation delete resolution or resolve only last',
  (_name, n, event, outcome, errorSubtype) => {
    const f = fixture()
    for (let attempt = 1; attempt <= n; attempt++)
      f.adapter.consume(
        { type: 'system', subtype: 'api_retry', attempt },
        'retry',
      )
    f.adapter.consume(event, 'response')
    f.adapter.consume(event, 'duplicate')
    expect(
      f.facts.filter(
        (f) =>
          f.kind === 'harness.retry' && 'phase' in f && f.phase === 'resolved',
      ),
    ).toEqual([
      {
        kind: 'harness.retry',
        phase: 'resolved',
        outcome,
        attempts: n,
        at: 'response',
        ...(errorSubtype ? { errorSubtype } : {}),
      },
    ])
  },
)

it('R4prime no outstanding attempt emits no resolution — mutation emit anyway', () => {
  const f = fixture()
  f.adapter.consume(
    { type: 'stream_event', event: { type: 'message_start' } },
    'now',
  )
  expect(f.facts).toEqual([])
})

it('R4prime process end records no guessed resolution and clears outstanding attempts — mutation keep retries after process end turns red', () => {
  const f = fixture()
  f.adapter.consume(
    { type: 'system', subtype: 'api_retry', attempt: 1 },
    'retry',
  )
  f.adapter.processEnded('exit', 'exit')
  f.adapter.consume(
    { type: 'stream_event', event: { type: 'message_start' } },
    'later',
  )
  expect(
    f.facts.map((fact) =>
      fact.kind === 'harness.retry' ? fact.phase : fact.kind,
    ),
  ).toEqual(['attempt', 'process.ended'])
})

it.each(['stream_event', 'assistant'])(
  'R4double main-thread witness rejects child %s — mutation accept child frames turns red',
  (type) => {
    const f = fixture()
    f.adapter.consume(
      { type: 'system', subtype: 'api_retry', attempt: 1 },
      'retry',
    )
    f.adapter.consume(
      {
        type,
        parent_tool_use_id: 'toolu_x',
        event: { type: 'message_start' },
        message: { content: [] },
      },
      'child',
    )
    const atChild = f.facts.filter(
      (f) => f.kind === 'harness.retry' && f.phase === 'resolved',
    )
    f.adapter.consume(
      { type: 'result', subtype: 'error_during_execution' },
      'failed',
    )
    expect({
      atChild,
      resolved: f.facts.filter(
        (f) => f.kind === 'harness.retry' && f.phase === 'resolved',
      ),
    }).toEqual({
      atChild: [],
      resolved: [
        {
          kind: 'harness.retry',
          phase: 'resolved',
          outcome: 'failed',
          attempts: 1,
          errorSubtype: 'error_during_execution',
          at: 'failed',
        },
      ],
    })
  },
)
it.each([undefined, 'completed'])(
  'R4double result %s resolves turn A before turn B — mutation ignore successful result turns red',
  (terminal_reason) => {
    const f = fixture()
    f.adapter.consume(
      { type: 'system', subtype: 'api_retry', attempt: 1 },
      'turn A retry',
    )
    f.adapter.consume(
      { type: 'result', subtype: 'success', terminal_reason },
      'turn A end',
    )
    f.adapter.consume(
      { type: 'stream_event', event: { type: 'message_start' } },
      'turn B',
    )
    expect(
      f.facts.filter(
        (f) => f.kind === 'harness.retry' && f.phase === 'resolved',
      ),
    ).toEqual([
      {
        kind: 'harness.retry',
        phase: 'resolved',
        outcome: 'succeeded',
        attempts: 1,
        at: 'turn A end',
      },
    ])
  },
)
it.each([
  'aborted_streaming',
  'aborted_tools',
  'hook_stopped',
  'tool_deferred',
  'max_turns',
  'background_requested',
])(
  'R4double %s clears without guessed success — mutation carry retries across result turns red',
  (terminal_reason) => {
    const f = fixture()
    f.adapter.consume(
      { type: 'system', subtype: 'api_retry', attempt: 1 },
      'retry',
    )
    f.adapter.consume(
      { type: 'result', subtype: 'success', terminal_reason },
      'end',
    )
    f.adapter.consume(
      { type: 'stream_event', event: { type: 'message_start' } },
      'next turn',
    )
    expect(
      f.facts.filter(
        (f) => f.kind === 'harness.retry' && f.phase === 'resolved',
      ),
    ).toEqual([])
  },
)
