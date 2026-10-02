import { describe, expect, it } from 'vitest'
import {
  orderParallelWork,
  type ParallelWorkRow,
} from '@/shared/lib/parallel-work.pure'
import { workRowKey } from './parallel-work.pure'
import {
  parallelWorkDecisionIds,
  parallelWorkDescendantCounts,
  parallelWorkInventory,
  parallelWorkStructure,
} from './parallel-work-tree.pure'

const task = (id: string, status: string, parentId: string | null = null) =>
  ({
    id,
    parentId,
    kind: 'task',
    task: { taskId: id, status },
  }) as ParallelWorkRow

const agent = (id: string, status: string, parentId: string | null = null) =>
  ({
    id,
    parentId,
    kind: 'agent',
    run: { id, status, spawnedByItemId: `spawn-${id}` },
  }) as ParallelWorkRow

describe('parallelWorkInventory (CONV-30)', () => {
  it('says running and completed always, the rest only when there are some', () => {
    expect(
      parallelWorkInventory([task('a', 'running'), task('b', 'completed')]),
    ).toEqual(['This session', '1 running', '1 completed'])
    expect(
      parallelWorkInventory([
        task('a', 'unknown'),
        task('b', 'failed'),
        task('c', 'stopped'),
        task('d', 'stopped'),
      ]),
    ).toEqual([
      'This session',
      '0 running',
      '0 completed',
      '1 unknown',
      '1 failed',
      '2 stopped',
    ])
  })
})

describe('parallelWorkStructure (CONV-30)', () => {
  it('nests each row under its parent, and makes an orphan a root', () => {
    const parent = agent('parent', 'running')
    const child = agent('child', 'running', 'parent')
    const orphan = task('orphan', 'running', 'gone')
    const rows = [parent, child, orphan]
    const { roots, childrenById } = parallelWorkStructure(
      rows,
      orderParallelWork(rows),
    )
    expect(roots).toEqual([parent, orphan])
    expect(childrenById.get(parent)).toEqual([child])
    expect(childrenById.has(orphan)).toBe(false)
  })
})

describe('parallelWorkDescendantCounts (CONV-30)', () => {
  it('counts running descendants under folded rows only', () => {
    const parent = agent('parent', 'completed')
    const child = agent('child', 'completed', 'parent')
    const grandchild = agent('grandchild', 'running', 'child')
    const rows = [parent, child, grandchild]
    expect(parallelWorkDescendantCounts(rows, new Set())).toEqual(new Map())
    expect(
      parallelWorkDescendantCounts(rows, new Set([workRowKey(parent)])),
    ).toEqual(new Map([[workRowKey(parent), 1]]))
  })
})

describe('parallelWorkDecisionIds (CONV-30)', () => {
  it('finds the request waiting on an agent, and nothing for the rest', () => {
    const parent = agent('parent', 'running')
    const child = agent('child', 'running', 'parent')
    const decisions = parallelWorkDecisionIds(
      [parent, child],
      [
        {
          id: 'ask-1',
          kind: 'approval-request',
          agentRunId: 'child',
          resolution: 'pending',
        },
        {
          id: 'ask-0',
          kind: 'input-request',
          agentRunId: 'parent',
          resolution: 'answered',
        },
      ],
    )
    expect(decisions.get(workRowKey(child))).toBe('ask-1')
    expect(decisions.get(workRowKey(parent))).toBeUndefined()
  })
})
