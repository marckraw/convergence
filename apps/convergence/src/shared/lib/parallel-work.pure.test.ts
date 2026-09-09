import { expect, it } from 'vitest'
import type {
  SessionAgentRun,
  SessionTask,
} from '../types/harness-evidence.types'
import {
  buildParallelWork,
  orderParallelWork,
  parallelWorkParents,
  parallelWorkTime,
  parallelWorkAnchor,
  formatRelativeTime,
  archiveParallelWork,
  type ParallelWorkRow,
  parallelWorkRowState,
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

it.each(['running', 'unknown'] as const)(
  'H2 / R8 M3 M4 merged-row accessor composes terminal task state and start — mutations prefer run or lose start turn red (%s)',
  (status) => {
    const terminal = {
      ...task('harness', 'local_agent'),
      status: 'completed' as const,
      endedAt: '2026-09-09T00:01:00Z',
      endedSummary: 'task reported completion',
    }
    const row = buildParallelWork(
      [
        {
          ...run('provisional', 1),
          taskId: 'harness',
          status,
          endedSummary: 'run last seen',
        },
      ],
      [terminal],
      [],
    )[0]!
    expect(parallelWorkRowState(row)).toEqual({
      fact: { ...terminal, startedAt: '2026-09-09T00:00:00Z' },
      stopId: 'harness',
      ids: ['provisional', 'harness'],
    })
  },
)

const clock = Date.parse('2026-09-09T12:00:00.000Z')
const ago = (minutes: number) => new Date(clock - minutes * 60000).toISOString()
function timedTask(
  id: string,
  status: SessionTask['status'],
  minutes: number | null,
  parentId: string | null = null,
): ParallelWorkRow {
  return {
    id,
    kind: 'task',
    parentId,
    task: {
      taskId: id,
      sessionId: 's',
      toolUseId: null,
      taskType: null,
      description: id,
      status,
      startedAt: null,
      observedAt: minutes === null ? null : ago(minutes),
      endedAt:
        status === 'running' || status === 'unknown' || minutes === null
          ? null
          : ago(minutes),
      outputFile: null,
    },
  }
}
it('RUN64 R1′ keeps active oldest first and finished newest within parents — mutations drop active/time/null-last keys or flatten children turn red', () => {
  const rows = [
    timedTask('finished-old', 'failed', 90),
    timedTask('child-new', 'completed', 2, 'parent'),
    timedTask('legacy', 'running', null),
    timedTask('young', 'running', 4),
    timedTask('parent', 'running', 10),
    timedTask('child-old', 'running', 7, 'parent'),
    timedTask('unknown', 'unknown', 20),
    timedTask('finished-new', 'completed', 1),
    timedTask('legacy-done', 'completed', null),
  ]
  expect(orderParallelWork(rows).map((row) => row.id)).toEqual([
    'unknown',
    'parent',
    'child-old',
    'child-new',
    'young',
    'legacy',
    'finished-new',
    'finished-old',
    'legacy-done',
  ])
})
it('RUN64 R2′ formats reported and observed time honestly — mutation age from now or invent legacy time turns red', () => {
  const seen = timedTask('seen', 'running', 4)
  const started = { ...seen, task: { ...seen.task!, startedAt: ago(8) } }
  expect([
    parallelWorkTime(seen, clock),
    parallelWorkTime(started, clock),
    parallelWorkTime(timedTask('done', 'completed', 120), clock),
    parallelWorkTime(timedTask('legacy', 'running', null), clock),
  ]).toEqual([
    { at: ago(4), label: 'seen 4 m ago' },
    { at: ago(8), label: '8 m' },
    { at: ago(120), label: '2 h ago' },
    { at: null, label: 'time not reported' },
  ])
})
it('RUN64 R2 relative formatting table — mutation change minute/hour/day divisor turns red', () => {
  expect(
    [0.5, 4, 120, 2880].map((minutes) =>
      formatRelativeTime(ago(minutes), clock),
    ),
  ).toEqual(['< 1 m', '4 m', '2 h', '2 d'])
})
it('RUN64 R3 buckets 61m but never 59m or running and keeps active descendants visible — mutation horizon off by one hour or hide running branch turns red', () => {
  const rows = [
    timedTask('59', 'completed', 59),
    timedTask('61', 'failed', 61),
    {
      ...timedTask('running', 'running', 120),
      task: {
        ...timedTask('running', 'running', 120).task!,
        endedAt: ago(120),
      },
    },
    timedTask('parent', 'completed', 120),
    timedTask('child', 'running', 90, 'parent'),
    timedTask('legacy', 'completed', null),
  ]
  const groups = archiveParallelWork(rows, clock)
  expect({
    visible: groups.visible.map((row) => row.id),
    older: groups.older.map((row) => row.id),
  }).toEqual({
    visible: ['59', 'running', 'parent', 'child'],
    older: ['61', 'legacy'],
  })
})

it('RUN64 round2 anchor unifies unknown order label and archive — mutations unknown uses start, running uses end, archive unknown or omit finite guard turn red', () => {
  const a: ParallelWorkRow = {
    id: 'A',
    kind: 'agent',
    parentId: null,
    run: {
      ...run('A', 1),
      status: 'unknown',
      startedAt: ago(90),
      endedAt: ago(1),
    },
  }
  const b: ParallelWorkRow = {
    id: 'B',
    kind: 'agent',
    parentId: null,
    run: { ...run('B', 1), startedAt: ago(4), endedAt: ago(80) },
  }
  const c = timedTask('C', 'completed', 120)
  const invalid = { ...b, run: { ...b.run!, startedAt: 'start' } }
  expect({
    anchors: [a, b, c, invalid].map(parallelWorkAnchor),
    order: orderParallelWork([a, b, c]).map((row) => row.id),
    labels: [a, b, c, invalid].map((row) => parallelWorkTime(row, clock).label),
    future: archiveParallelWork([a], clock + 86400000).older,
  }).toEqual({
    anchors: [
      { at: ago(1), phase: 'lastSeen' },
      { at: ago(4), phase: 'started' },
      { at: ago(120), phase: 'ended' },
      { at: null, phase: 'none' },
    ],
    order: ['B', 'A', 'C'],
    labels: ['last seen 1 m ago', '4 m', '2 h ago', 'time not reported'],
    future: [],
  })
})

it('RUN64 round2 archive partitions complete roots — mutations archive visible-root descendants or leave no-time root visible turn red', () => {
  const rows = [
    timedTask('active-root', 'running', 4),
    timedTask('old-child', 'completed', 120, 'active-root'),
    timedTask('mixed-root', 'completed', 180),
    timedTask('mixed-old', 'completed', 120, 'mixed-root'),
    timedTask('mixed-young', 'completed', 4, 'mixed-root'),
    timedTask('legacy-root', 'completed', null),
    timedTask('old-root', 'failed', 180),
    timedTask('old-grandchild', 'completed', 120, 'old-root'),
  ]
  const partition = archiveParallelWork(rows, clock)
  expect({
    visible: partition.visible.map((row) => row.id),
    older: partition.older.map((row) => row.id),
  }).toEqual({
    visible: [
      'active-root',
      'old-child',
      'mixed-root',
      'mixed-old',
      'mixed-young',
    ],
    older: ['legacy-root', 'old-root', 'old-grandchild'],
  })
})

it('RUN64 round2 tree identity includes kind — mutation key the walk by id alone turns red', () => {
  const agent: ParallelWorkRow = {
    id: 'shared',
    kind: 'agent',
    parentId: null,
    run: { ...run('shared', 1), status: 'completed', endedAt: ago(120) },
  }
  const task = timedTask('shared', 'completed', 180)
  const child: ParallelWorkRow = {
    id: 'child',
    kind: 'agent',
    parentId: 'shared',
    run: { ...run('child', 2), startedAt: ago(4) },
  }
  const ordered = orderParallelWork([agent, task, child])
  const archived = archiveParallelWork(ordered, clock)
  expect({
    rows: ordered.map((row) => `${row.kind}:${row.id}`),
    older: archived.older.map((row) => `${row.kind}:${row.id}`),
  }).toEqual({
    rows: ['agent:shared', 'agent:child', 'task:shared'],
    older: ['task:shared'],
  })
})

it('RUN64 round3 archives timeless descendants and seen anchors — mutations ended-only or root-only none turn red', () => {
  const seen = timedTask('seen-root', 'completed', 180)
  seen.task!.endedAt = null
  const rows = [
    timedTask('root', 'completed', 240),
    timedTask('timeless-child', 'completed', null, 'root'),
    seen,
  ]
  expect(archiveParallelWork(rows, clock)).toEqual({
    visible: [],
    older: rows,
    newest: ago(180),
  })
})

it('RUN64 round3 recent seen descendant keeps the whole tree — mutation ignore seen horizon turns red', () => {
  const child = timedTask('seen-child', 'completed', 10, 'root')
  child.task!.endedAt = null
  const rows = [timedTask('root', 'completed', 240), child]
  expect(archiveParallelWork(rows, clock)).toEqual({
    visible: rows,
    older: [],
    newest: null,
  })
})

it('RUN64 round3 parents choose agents over colliding tasks — mutation reverse parent precedence turns red', () => {
  const agent: ParallelWorkRow = {
    id: 'shared',
    kind: 'agent',
    parentId: null,
    run: run('shared', 1),
  }
  const task = timedTask('shared', 'running', 10)
  const orphan = timedTask('orphan', 'running', 4, 'missing')
  expect([...parallelWorkParents([agent, orphan, task])]).toEqual([
    ['orphan', orphan],
    ['shared', agent],
  ])
})
