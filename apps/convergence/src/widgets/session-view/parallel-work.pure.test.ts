import { expect, it } from 'vitest'
import {
  countParallelWork,
  parallelWorkTime,
  type ParallelWorkRow,
} from '@/shared/lib/parallel-work.pure'
import type {
  SessionAgentRun,
  SessionTask,
} from '@/shared/types/harness-evidence.types'
import type { ConversationItem } from '@/entities/session'
import {
  descendantActivity,
  parallelWorkLinksKey,
  parallelWorkMarkers,
  sameParallelWorkEvidence,
  workRowKey,
  workTitle,
  workStatus,
  parallelWorkRefusal,
  parallelWorkCardTone,
  PARALLEL_WORK_CARD_TONE_CLASS,
} from './parallel-work.pure'

it('R2 collapsed activity includes deep descendants and missing elapsed stays missing — mutations count direct children only or invent zero elapsed turn red', () => {
  const rows = [
    {
      id: 'parent',
      parentId: null,
      kind: 'task',
      task: { status: 'completed' },
    },
    {
      id: 'child',
      parentId: 'parent',
      kind: 'task',
      task: { status: 'completed' },
    },
    {
      id: 'grandchild',
      parentId: 'child',
      kind: 'task',
      task: { status: 'running' },
    },
  ] as ParallelWorkRow[]
  const missing: ParallelWorkRow = {
    id: 'missing',
    parentId: null,
    kind: 'task',
    task: { status: 'running', startedAt: null } as SessionTask,
  }
  expect({
    descendants: descendantActivity(rows, rows[0]),
    elapsed: parallelWorkTime(missing, 1000).label,
  }).toEqual({ descendants: 1, elapsed: 'time not reported' })
})

it('R4/R7 nested markers name the recorded parent with a generic child title and local stop reason — mutations omit parent, reveal provisional id or erase stop reason turn red', () => {
  const rows = [
    {
      id: 'parent',
      kind: 'agent',
      parentId: null,
      run: { spawnedByItemId: 'parent-spawn', description: 'Inspect routes' },
    },
    {
      id: 'tool-provisional',
      kind: 'agent',
      parentId: 'parent',
      run: {
        spawnedByItemId: 'child-spawn',
        description: null,
        agentType: 'Explore',
        status: 'stopped',
        stopReason: 'stop',
      },
    },
  ] as ParallelWorkRow[]
  const marker = parallelWorkMarkers(
    [
      {
        id: 'child-spawn',
        kind: 'tool-call',
        providerMeta: {},
      } as ConversationItem,
    ],
    rows,
  ).get('child-spawn')
  expect({
    marker: marker?.label,
    title: workTitle(rows[1]),
    status: workStatus(rows[1]),
  }).toEqual({
    marker: 'Started Explore · Subagent · from Inspect routes',
    title: 'Subagent',
    status: 'Stopped by you',
  })
})

it('L7 unwraps only the Stop IPC envelope — mutation display the remote-method wrapper turns red', () => {
  expect(
    parallelWorkRefusal(
      new Error(
        "Error invoking remote method 'session:stopTask': Error: Control refused",
      ),
    ),
  ).toBe('Control refused')
})

it('T10 cyclic descendants terminate and exclude the starting row — mutation remove visited guard turns red', () => {
  const rows = [
    { id: 'a', parentId: 'b', kind: 'task', task: { status: 'running' } },
    { id: 'b', parentId: 'a', kind: 'task', task: { status: 'running' } },
  ] as ParallelWorkRow[]
  expect(descendantActivity(rows, rows[0])).toBe(1)
})

it('H2′ withheld result moments leave the terminal task fact as the return marker — mutation discard task-fact returns turns red', () => {
  const rows = [
    {
      id: 'adopted',
      kind: 'agent',
      parentId: null,
      run: {
        spawnedByItemId: 'spawn',
        description: 'Read routes',
        status: 'completed',
      },
    },
  ] as ParallelWorkRow[]
  const items = [
    {
      id: 'unassociated-result',
      kind: 'tool-result',
      relatedItemId: 'spawn',
      providerMeta: { providerEventType: 'tool_result' },
    },
    {
      id: 'terminal',
      kind: 'note',
      taskId: 'adopted',
      providerMeta: { providerEventType: 'harness.task.terminal' },
    },
  ] as ConversationItem[]
  expect([...parallelWorkMarkers(items, rows)]).toEqual([
    [
      'terminal',
      {
        rowKey: 'agent:adopted',
        label: 'Result returned · Read routes · completed',
        replace: false,
      },
    ],
  ])
})

it('H2 merged state and return marker follow the terminal task — mutations prefer run state or index run id only turn red', () => {
  const row = {
    id: 'provisional',
    kind: 'agent',
    parentId: null,
    run: {
      id: 'provisional',
      status: 'running',
      spawnedByItemId: 'spawn',
      description: 'Read routes',
      startedAt: '2026-09-09T00:00:00Z',
    },
    task: {
      taskId: 'harness',
      status: 'completed',
      startedAt: '2026-09-09T00:00:01Z',
      endedAt: '2026-09-09T00:00:05Z',
    },
  } as ParallelWorkRow
  const markers = parallelWorkMarkers(
    [
      {
        id: 'terminal',
        kind: 'note',
        taskId: 'harness',
        providerMeta: { providerEventType: 'harness.task.terminal' },
      },
    ] as ConversationItem[],
    [row],
  )
  expect({
    status: workStatus(row),
    elapsed: parallelWorkTime(row, Date.parse('2026-09-09T00:01:00Z')).label,
    counts: countParallelWork([row]),
    marker: markers.get('terminal')?.label,
  }).toEqual({
    status: 'Completed',
    elapsed: '< 1 m ago',
    counts: { running: 0, unknown: 0, failed: 0, stopped: 0 },
    marker: 'Result returned · Read routes · completed',
  })
})

/**
 * RUN72 / MAR-2902. A run id and a task id can be the same string, and then one
 * id names two rows. The row key tells them apart, and the descendant walk
 * resolves each child's `parentId` the way the panel's tree does — so the task
 * row is handed none of the agent's children.
 *
 * Mutation: walk on the bare parent id (`child.parentId === parent.id`) and the
 * task reports the agent's descendant — red.
 */
it('RUN72 a task sharing a run id keys apart and inherits no descendants — mutation walk by bare parent id turns red', () => {
  const rows = [
    {
      id: 'shared',
      parentId: null,
      kind: 'agent',
      run: { status: 'running' },
    },
    {
      id: 'child',
      parentId: 'shared',
      kind: 'agent',
      run: { status: 'running' },
    },
    {
      id: 'shared',
      parentId: null,
      kind: 'task',
      task: { status: 'running' },
    },
  ] as ParallelWorkRow[]
  expect({
    keys: rows.map(workRowKey),
    agent: descendantActivity(rows, rows[0]),
    task: descendantActivity(rows, rows[2]),
  }).toEqual({
    keys: ['agent:shared', 'agent:child', 'task:shared'],
    agent: 1,
    task: 0,
  })
})

it('MAR-3308 R1 every state word has one tone and every other word has none — mutation map `unknown` or a missing status to a colour turns red', () => {
  expect({
    running: parallelWorkCardTone('running'),
    completed: parallelWorkCardTone('completed'),
    failed: parallelWorkCardTone('failed'),
    stopped: parallelWorkCardTone('stopped'),
    unknown: parallelWorkCardTone('unknown'),
    missing: parallelWorkCardTone(undefined),
    future: parallelWorkCardTone('queued'),
  }).toEqual({
    running: 'running',
    completed: 'completed',
    failed: 'failed',
    stopped: 'stopped',
    unknown: 'none',
    missing: 'none',
    future: 'none',
  })
})

it('MAR-3308 R1 each tone is its own class pair — mutation reuse one tone for two states turns red', () => {
  const tones = Object.values(PARALLEL_WORK_CARD_TONE_CLASS)
  expect({
    map: PARALLEL_WORK_CARD_TONE_CLASS,
    distinct: new Set(tones).size,
  }).toEqual({
    map: {
      running: 'border-blue-500/40 bg-blue-500/10',
      completed: 'border-emerald-500/30 bg-emerald-500/[0.06]',
      failed: 'border-red-500/40 bg-red-500/10',
      stopped: 'border-amber-500/30 bg-amber-500/[0.06]',
      none: 'border-border/50 bg-muted/30',
    },
    distinct: 5,
  })
})

it('MAR-3310 F1e R4 the links key names each run with the agent that spawned it, and is blind to text — mutation read the item text turns red', () => {
  const run = { id: 'run-1', spawnedByItemId: 'spawn' } as SessionAgentRun
  const orphan = { id: 'run-2', spawnedByItemId: 'gone' } as SessionAgentRun
  const spawn = {
    id: 'spawn',
    kind: 'tool-call',
    agentRunId: 'parent-run',
  } as ConversationItem
  const plain = { id: 'plain', kind: 'message', text: 'a' } as ConversationItem
  const grown = { ...plain, text: 'a longer reply' } as ConversationItem
  expect({
    key: parallelWorkLinksKey([spawn, plain], [run, orphan]),
    sameWhenTextGrows:
      parallelWorkLinksKey([spawn, plain], [run]) ===
      parallelWorkLinksKey([spawn, grown], [run]),
  }).toEqual({
    key: JSON.stringify([
      ['spawn', 'parent-run'],
      ['gone', null],
    ]),
    sameWhenTextGrows: true,
  })
})

it('MAR-3310 F1e R4 two reads are the same evidence only when runs and tasks both match — mutation compare tasks only turns red', () => {
  const task = { taskId: 't', status: 'running' } as SessionTask
  const run = { id: 'r', status: 'running' } as SessionAgentRun
  const read = (runs: SessionAgentRun[], tasks: SessionTask[]) => ({
    runs,
    tasks,
  })
  expect({
    same: sameParallelWorkEvidence(
      read([run], [task]),
      read([{ ...run }], [{ ...task }]),
    ),
    taskChanged: sameParallelWorkEvidence(
      read([run], [task]),
      read([run], [{ ...task, status: 'completed' }]),
    ),
    runChanged: sameParallelWorkEvidence(
      read([run], [task]),
      read([{ ...run, status: 'completed' }], [task]),
    ),
  }).toEqual({ same: true, taskChanged: false, runChanged: false })
})
