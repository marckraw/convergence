import { describe, expect, it } from 'vitest'
import {
  applyCursorTodoUpdate,
  getCursorTodoUpdateChangedIds,
  renderCursorTodoNote,
  type CursorAcpTodo,
  type CursorAcpTodoUpdateParams,
} from './cursor-acp-todos.pure'
import {
  CURSOR_ACP_RECORDED_UPDATE_TODOS_FULL_REQUEST,
  CURSOR_ACP_RECORDED_UPDATE_TODOS_MERGE_REQUEST,
} from './cursor-acp.recorded.fixture'

function fullParams(): CursorAcpTodoUpdateParams {
  return CURSOR_ACP_RECORDED_UPDATE_TODOS_FULL_REQUEST as unknown as CursorAcpTodoUpdateParams
}

function mergeParams(): CursorAcpTodoUpdateParams {
  return CURSOR_ACP_RECORDED_UPDATE_TODOS_MERGE_REQUEST as unknown as CursorAcpTodoUpdateParams
}

function todosWithIds(...ids: string[]): CursorAcpTodo[] {
  return ids.map((id) => ({
    id,
    content: `task ${id}`,
    status: 'pending',
  }))
}

describe('applyCursorTodoUpdate', () => {
  it('full replace (merge: false) replaces the list', () => {
    const current = todosWithIds('a', 'b')
    const result = applyCursorTodoUpdate(current, fullParams())

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('1')
    expect(result[1].id).toBe('2')
    expect(result[2].id).toBe('3')
  })

  it('merge: true updates matching ids in place', () => {
    const afterFull = applyCursorTodoUpdate([], fullParams())
    const result = applyCursorTodoUpdate(afterFull, mergeParams())

    // Item 1 updated, 2 updated, 3 untouched
    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('1')
    expect(result[0].status).toBe('completed')
    expect(result[1].id).toBe('2')
    expect(result[1].status).toBe('in_progress')
    expect(result[2].id).toBe('3')
    expect(result[2].status).toBe('pending')
  })

  it('merge: true appends unknown ids', () => {
    const current = todosWithIds('a')
    const params: CursorAcpTodoUpdateParams = {
      todos: [{ id: 'new', content: 'new task', status: 'completed' }],
      merge: true,
    }
    const result = applyCursorTodoUpdate(current, params)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('a')
    expect(result[1].id).toBe('new')
  })

  it('merge: true into empty list produces only the merge items', () => {
    const result = applyCursorTodoUpdate([], mergeParams())

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('1')
    expect(result[1].id).toBe('2')
  })

  it('merge: true with a todo lacking a string id appends it', () => {
    const current = todosWithIds('a')
    const params: CursorAcpTodoUpdateParams = {
      todos: [{ content: 'no-id', status: 'pending' }],
      merge: true,
    }
    const result = applyCursorTodoUpdate(current, params)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('a')
    // The id-less todo is appended
    expect(result[1].content).toBe('no-id')
  })

  it('merge: true does not reorder unchanged items', () => {
    const current = todosWithIds('a', 'b', 'c')
    const params: CursorAcpTodoUpdateParams = {
      todos: [{ id: 'b', content: 'changed', status: 'completed' }],
      merge: true,
    }
    const result = applyCursorTodoUpdate(current, params)

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('a')
    expect(result[1].id).toBe('b')
    expect(result[1].content).toBe('changed')
    expect(result[2].id).toBe('c')
  })

  it('a second full replace replaces everything', () => {
    const current = todosWithIds('a', 'b', 'c', 'd')
    const result = applyCursorTodoUpdate(current, fullParams())

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('1')
    expect(result[1].id).toBe('2')
    expect(result[2].id).toBe('3')
  })

  it('missing merge field acts as full replace', () => {
    const current = todosWithIds('x', 'y')
    const params: CursorAcpTodoUpdateParams = {
      todos: [{ id: 'a', content: 'only', status: 'pending' }],
    }
    const result = applyCursorTodoUpdate(current, params)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })

  it('non-array todos leaves the list unchanged', () => {
    const current = todosWithIds('a')
    const params: CursorAcpTodoUpdateParams = { todos: 42 }
    const result = applyCursorTodoUpdate(current, params)

    expect(result).toEqual(current)
  })

  it('never throws on garbage input', () => {
    expect(() => applyCursorTodoUpdate([], { todos: null })).not.toThrow()
    expect(() => applyCursorTodoUpdate([], { todos: undefined })).not.toThrow()
    expect(() => applyCursorTodoUpdate([], {})).not.toThrow()
    expect(() =>
      applyCursorTodoUpdate([], null as unknown as CursorAcpTodoUpdateParams),
    ).not.toThrow()
  })

  // MUTATION: treat merge:true as replacement — this test goes red.
  it('MUTATION: merge:true is NOT a replacement (full + merge keeps all items)', () => {
    const afterFull = applyCursorTodoUpdate([], fullParams())
    const result = applyCursorTodoUpdate(afterFull, mergeParams())

    // If merge:true were wrongly treated as replacement, item 3 would be
    // dropped and the length would be 2 instead of 3.
    expect(result).toHaveLength(3)
  })
})

describe('getCursorTodoUpdateChangedIds', () => {
  it('returns ids not in the previous list (full-replace payload against different previous)', () => {
    const previous = todosWithIds('x')
    const ids = getCursorTodoUpdateChangedIds(fullParams(), previous)
    expect(ids).toEqual(new Set(['1', '2', '3']))
  })

  it('returns only ids whose status or content changed (merge vs post-full previous)', () => {
    const afterFull = applyCursorTodoUpdate([], fullParams())
    const ids = getCursorTodoUpdateChangedIds(mergeParams(), afterFull)
    // merge payload has 1 (status now completed) and 2 (status now in_progress).
    // 3 is in the previous list but NOT in the payload, so it is unmarked.
    expect(ids).toEqual(new Set(['1', '2']))
  })

  it('returns an empty set for no todos', () => {
    const ids = getCursorTodoUpdateChangedIds({}, [])
    expect(ids.size).toBe(0)
  })

  // F2: when there is no previous list, nothing is marked.
  it('first full list has no markers', () => {
    const ids = getCursorTodoUpdateChangedIds(fullParams(), [])
    expect(ids.size).toBe(0)
  })

  it('a merge that changes one status marks exactly that one', () => {
    const previous: CursorAcpTodo[] = [
      { id: '1', content: 'a', status: 'pending' },
      { id: '2', content: 'b', status: 'pending' },
    ]
    const params: CursorAcpTodoUpdateParams = {
      todos: [
        { id: '1', content: 'a', status: 'completed' },
        { id: '2', content: 'b', status: 'pending' },
      ],
      merge: true,
    }
    const ids = getCursorTodoUpdateChangedIds(params, previous)
    expect(ids).toEqual(new Set(['1']))
  })

  it('a second full list identical but for one status marks exactly that one', () => {
    const previous: CursorAcpTodo[] = [
      { id: '1', content: 'a', status: 'pending' },
      { id: '2', content: 'b', status: 'pending' },
    ]
    const params: CursorAcpTodoUpdateParams = {
      todos: [
        { id: '1', content: 'a', status: 'completed' },
        { id: '2', content: 'b', status: 'pending' },
      ],
      merge: false,
    }
    const ids = getCursorTodoUpdateChangedIds(params, previous)
    expect(ids).toEqual(new Set(['1']))
  })

  // MUTATION: mark every incoming id again (ignore previous) → first-full-list test red.
  it('MUTATION: first full list has NO markers (previous is empty)', () => {
    const ids = getCursorTodoUpdateChangedIds(fullParams(), [])
    expect(ids.size).toBe(0)
  })
})

describe('renderCursorTodoNote', () => {
  it('renders the full list with changed items marked', () => {
    const todos: CursorAcpTodo[] = [
      { id: '1', content: 'task one', status: 'completed' },
      { id: '2', content: 'task two', status: 'in_progress' },
      { id: '3', content: 'task three', status: 'pending' },
    ]
    const changedIds = new Set(['1', '2'])

    const note = renderCursorTodoNote(todos, changedIds)

    expect(note).toContain('Cursor todos')
    expect(note).toContain('[completed] task one ← updated')
    expect(note).toContain('[in_progress] task two ← updated')
    expect(note).toContain('[pending] task three')
    // Item 3 is NOT marked
    expect(note).not.toContain('task three ← updated')
  })

  it('after full + merge, only merged ones carry the marker', () => {
    const afterFull = applyCursorTodoUpdate([], fullParams())
    const afterMerge = applyCursorTodoUpdate(afterFull, mergeParams())
    const changedIds = getCursorTodoUpdateChangedIds(mergeParams(), afterFull)

    const note = renderCursorTodoNote(afterMerge, changedIds)

    // Every item of the full list is present
    expect(note).toContain('[completed] Inspect repo purpose/structure')
    expect(note).toContain('[in_progress] Draft README.md via subagent')
    expect(note).toContain('[pending] Review README and mark todos done')

    // Only the merged ones carry the marker
    expect(
      note.includes(
        '[completed] Inspect repo purpose/structure for README content ← updated',
      ),
    ).toBe(true)
    expect(
      note.includes('[in_progress] Draft README.md via subagent ← updated'),
    ).toBe(true)
    expect(note).not.toContain('Review README and mark todos done ← updated')
  })

  it('renders an empty list as just the header', () => {
    const note = renderCursorTodoNote([], new Set())
    expect(note).toBe('Cursor todos')
  })

  // MUTATION: render only the payload's todos → red.
  it('MUTATION: note has every item of the full list, not just the payload', () => {
    const afterFull = applyCursorTodoUpdate([], fullParams())
    const afterMerge = applyCursorTodoUpdate(afterFull, mergeParams())
    const changedIds = getCursorTodoUpdateChangedIds(mergeParams(), afterFull)

    const note = renderCursorTodoNote(afterMerge, changedIds)

    // If we rendered only the merge payload's todos, item 3 (unchanged)
    // would not appear. The test verifies it IS present.
    expect(note).toContain('Review README and mark todos done')
  })
})
