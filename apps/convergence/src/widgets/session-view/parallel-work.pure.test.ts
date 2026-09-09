import { expect, it } from 'vitest'
import type { ParallelWorkRow } from '@/shared/lib/parallel-work.pure'
import type { SessionTask } from '@/shared/types/harness-evidence.types'
import type { ConversationItem } from '@/entities/session'
import {
  descendantActivity,
  workElapsed,
  parallelWorkMarkers,
  workTitle,
  workStatus,
  parallelWorkRefusal,
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
    descendants: descendantActivity(rows, 'parent'),
    elapsed: workElapsed(missing, 1000),
  }).toEqual({ descendants: 1, elapsed: '—' })
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
  expect(descendantActivity(rows, 'a')).toBe(1)
})
