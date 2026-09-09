import { expect, it } from 'vitest'
import type {
  SessionAgentRun,
  SessionTask,
} from '../types/harness-evidence.types'
import {
  buildParallelWork,
  countParallelWork,
  parallelWorkStatus,
  isSubagentWork,
  pendingAgentDecision,
} from './parallel-work.pure'

const run = (id: string, depth: number): SessionAgentRun => ({
  id,
  sessionId: 's',
  spawnedByItemId: `spawn-${id}`,
  agentType: 'Explore',
  description: 'same description',
  model: null,
  status: 'running',
  depth,
  startedAt: '2026-09-09T00:00:00Z',
  endedAt: null,
  transcriptPath: null,
  isBackgrounded: true,
  lastToolName: null,
  usageJson: null,
  updatedAt: null,
})

it('R3′ partitions work only and links the pending interaction — mutations move approvals, keep child tools, or retain resolved links turn red', () => {
  const items = [
    { id: 'call', kind: 'tool-call', agentRunId: 'child' },
    { id: 'result', kind: 'tool-result', agentRunId: 'child' },
    { id: 'text', kind: 'message', actor: 'assistant', agentRunId: 'child' },
    { id: 'thinking', kind: 'thinking', agentRunId: 'child' },
    {
      id: 'approval',
      kind: 'approval-request',
      resolution: 'pending',
      agentRunId: 'child',
    },
    {
      id: 'question',
      kind: 'input-request',
      resolution: 'pending',
      agentRunId: 'child',
    },
    { id: 'note', kind: 'note', agentRunId: 'child' },
    { id: 'main', kind: 'message', actor: 'assistant' },
    { id: 'user', kind: 'message', actor: 'user', agentRunId: 'child' },
  ]
  expect({
    panel: items.filter((item) => isSubagentWork(item)).map((item) => item.id),
    main: items.filter((item) => !isSubagentWork(item)).map((item) => item.id),
    pending: pendingAgentDecision(items, 'child'),
    resolved: pendingAgentDecision(
      items.map((item) => ({ ...item, resolution: 'approved' })),
      'child',
    ),
  }).toEqual({
    panel: ['call', 'result', 'text', 'thinking'],
    main: ['approval', 'question', 'note', 'main', 'user'],
    pending: 'approval',
    resolved: null,
  })
})

it('R5 parallel status respects foreground and interaction precedence and every settling boundary — mutation finish on answer or treat unknown as running turns red', () => {
  const parallelWork = { running: 2, unknown: 1, failed: 1, stopped: 2 }
  const session = { status: 'completed', attention: 'finished', parallelWork }
  expect([
    parallelWorkStatus({ ...session, status: 'running' }),
    parallelWorkStatus({ ...session, attention: 'needs-approval' }),
    parallelWorkStatus({ ...session, attention: 'needs-input' }),
    parallelWorkStatus({ ...session, attention: 'failed' }),
    parallelWorkStatus(session),
    parallelWorkStatus({
      ...session,
      parallelWork: { ...parallelWork, running: 0 },
    }),
    parallelWorkStatus({
      ...session,
      parallelWork: { ...parallelWork, running: 0, unknown: 0 },
    }),
    parallelWorkStatus({
      ...session,
      parallelWork: { running: 0, unknown: 0, failed: 0, stopped: 0 },
    }),
  ]).toEqual([
    null,
    null,
    null,
    null,
    'answered · 2 tasks running · 1 unknown',
    'answered · 1 unknown · 1 failed · 2 stopped',
    'answered · 1 failed · 2 stopped',
    null,
  ])
})

it('R5 counts unique identities including monitors without treating unknown as running — mutations double count agents or count unknown as running turn red', () => {
  const rows = buildParallelWork(
    [
      run('parent', 1),
      { ...run('child', 2), status: 'unknown' },
      { ...run('done', 1), status: 'completed' },
    ],
    [
      task('parent', 'local_agent'),
      task('monitor', 'monitor'),
      { ...task('failed', 'local_bash'), status: 'failed' },
      { ...task('stopped', 'local_bash'), status: 'stopped' },
    ],
    [],
  )
  expect(countParallelWork(rows)).toEqual({
    running: 2,
    unknown: 1,
    failed: 1,
    stopped: 1,
  })
})
const task = (taskId: string, taskType: string): SessionTask => ({
  taskId,
  sessionId: 's',
  toolUseId: null,
  taskType,
  description: 'same description',
  status: 'running',
  startedAt: null,
  endedAt: null,
  outputFile: null,
})

it('R1 resolves parent by the spawning item and merges only local-agent ids — mutations parent by depth, merge by description, or count the task twice turn red', () => {
  const rows = buildParallelWork(
    [run('parent', 1), run('other', 1), run('child', 2), run('orphan', 2)],
    [
      {
        ...task('parent', 'local_agent'),
        description: 'task description differs from run',
      },
      task('command', 'local_bash'),
    ],
    [{ id: 'spawn-child', agentRunId: 'parent' }],
  )
  expect(rows.map((row) => [row.id, row.kind, row.parentId])).toEqual([
    ['parent', 'agent', null],
    ['other', 'agent', null],
    ['child', 'agent', 'parent'],
    ['orphan', 'agent', null],
    ['command', 'task', null],
  ])
})

it('H3 a backend link merges without renderer items — mutation derive join from renderer items turns red', () => {
  const rows = buildParallelWork(
    [{ ...run('provisional', 1), taskId: 'harness-agent' }],
    [
      { ...task('harness-agent', 'local_agent'), toolUseId: 'tool-spawn' },
      { ...task('unrelated', 'local_bash'), toolUseId: 'tool-spawn' },
    ],
    [],
  )
  expect(rows.map((row) => [row.id, row.task?.taskId])).toEqual([
    ['provisional', 'harness-agent'],
    ['unrelated', 'unrelated'],
  ])
})
