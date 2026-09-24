import { expect, it } from 'vitest'
import {
  buildParallelWork,
  countParallelWork,
  isSubagentWork,
  parallelWorkRowState,
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
  parallelWorkDetailItems,
  parallelWorkMarkers,
  sameParallelWorkEvidence,
  workRowKey,
  workTitle,
  workStatus,
  parallelWorkRefusal,
  parallelWorkCardTone,
  PARALLEL_WORK_CARD_TONE_CLASS,
  withFetchedWorkItems,
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

// MAR-3310 O0b R2. The panel's detail filter exactly as it stood before the
// by-id read, kept here as the reference the merged detail must equal.
const todaysDetail = (items: ConversationItem[], row: ParallelWorkRow) =>
  items.filter((item) =>
    row.kind === 'agent'
      ? parallelWorkRowState(row).ids.includes(item.agentRunId ?? '') &&
        isSubagentWork(item)
      : parallelWorkRowState(row).ids.includes(item.taskId ?? '') &&
        ['tool-call', 'tool-result'].includes(item.kind),
  )
// What main's `listRunItems` + `listTaskItems` answer for a row's ids.
const readById = (items: ConversationItem[], row: ParallelWorkRow) => {
  const { ids } = parallelWorkRowState(row)
  return items.filter(
    (item) =>
      ids.includes(item.agentRunId ?? '') || ids.includes(item.taskId ?? ''),
  )
}
const detailFixture = () => {
  let sequence = 0
  const item = (fields: Partial<ConversationItem>) =>
    ({
      id: `item-${++sequence}`,
      sequence,
      sessionId: 's',
      turnId: null,
      state: 'complete',
      createdAt: '',
      updatedAt: '',
      providerMeta: { providerId: 'claude-code' },
      ...fields,
    }) as ConversationItem
  const items = [
    item({ kind: 'message', actor: 'user', text: 'go' }),
    item({ kind: 'tool-call', agentRunId: 'agent', toolName: 'Read' }),
    item({ kind: 'tool-call', taskId: 'task', toolName: 'Bash' }),
    item({ kind: 'thinking', agentRunId: 'agent', text: 'hm' }),
    item({
      kind: 'approval-request',
      agentRunId: 'agent',
      resolution: 'pending',
    }),
    item({ kind: 'tool-result', taskId: 'task', outputText: 'out' }),
    item({ kind: 'note', taskId: 'task', text: 'done' }),
    item({ kind: 'tool-result', agentRunId: 'agent', outputText: 'r' }),
    item({ kind: 'message', actor: 'assistant', text: 'main' }),
    item({
      kind: 'message',
      actor: 'assistant',
      agentRunId: 'agent',
      text: 'a',
    }),
    item({
      kind: 'message',
      actor: 'assistant',
      agentRunId: 'other',
      text: 'o',
    }),
  ]
  const at = '2026-09-09T00:00:00Z'
  const rows = buildParallelWork(
    [
      {
        id: 'agent',
        sessionId: 's',
        spawnedByItemId: 'spawn',
        status: 'running',
        startedAt: at,
      } as SessionAgentRun,
    ],
    [
      {
        taskId: 'task',
        sessionId: 's',
        taskType: 'local_bash',
        status: 'running',
      } as SessionTask,
    ],
  )
  return { items, rows }
}

it('MAR-3310 O0b R2 on full data the merged detail IS today’s list and today’s filter, for agent and task rows; in a window the older items come back — mutation drop the fetched items turns red', () => {
  const { items, rows } = detailFixture()
  const window = items.slice(-2)
  expect(
    rows.map((row) => {
      const full = withFetchedWorkItems(items, readById(items, row))
      const windowed = withFetchedWorkItems(window, readById(items, row))
      return {
        kind: row.kind,
        fullIsLoaded: full === items,
        full: parallelWorkDetailItems(full, row).map((item) => item.id),
        windowed: parallelWorkDetailItems(windowed, row).map((item) => item.id),
        today: todaysDetail(items, row).map((item) => item.id),
        todayInWindow: todaysDetail(window, row).map((item) => item.id),
      }
    }),
  ).toEqual([
    {
      kind: 'agent',
      fullIsLoaded: true,
      full: ['item-2', 'item-4', 'item-8', 'item-10'],
      windowed: ['item-2', 'item-4', 'item-8', 'item-10'],
      today: ['item-2', 'item-4', 'item-8', 'item-10'],
      todayInWindow: ['item-10'],
    },
    {
      kind: 'task',
      fullIsLoaded: true,
      full: ['item-3', 'item-6'],
      windowed: ['item-3', 'item-6'],
      today: ['item-3', 'item-6'],
      todayInWindow: [],
    },
  ])
})

it('MAR-3310 O0b R2 the loaded copy of a streaming item wins over the fetched one, and the merge is ordered and deduplicated — mutation let the fetched copy win turns red', () => {
  const { items, rows } = detailFixture()
  const agent = rows[0]!
  const live = items.at(-2)!
  const window = [
    { ...live, text: 'the live, still-growing reply' } as ConversationItem,
    items.at(-1)!,
  ]
  // The read ran before the last chunk landed, and both reads returned it.
  const fetched = [
    ...readById(items, agent),
    { ...live, text: 'a stale snapshot' } as ConversationItem,
  ]
  const merged = withFetchedWorkItems(window, fetched)
  const detail = parallelWorkDetailItems(merged, agent)
  expect({
    ids: detail.map((item) => item.id),
    live: detail.find((item) => item.id === live.id),
    liveIsLoadedObject: detail.includes(window[0]!),
  }).toEqual({
    ids: ['item-2', 'item-4', 'item-8', 'item-10'],
    live: expect.objectContaining({ text: 'the live, still-growing reply' }),
    liveIsLoadedObject: true,
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
