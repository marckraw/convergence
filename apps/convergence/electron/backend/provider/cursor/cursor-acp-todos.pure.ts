/**
 * Pure reducer and renderer for Cursor `cursor/update_todos` (MAR-3241).
 *
 * The first call of a turn carries `merge: false` with the complete list;
 * later calls carry `merge: true` with only the todos that changed. The
 * reducer keeps the full list across calls; the renderer marks what moved.
 */
export interface CursorAcpTodo {
  id: string
  content: string
  status: string
}

export interface CursorAcpTodoUpdateParams {
  toolCallId?: unknown
  todos?: unknown
  merge?: unknown
}

/**
 * Applies a Cursor `cursor/update_todos` payload to the accumulated list.
 *
 * R1: `merge: false` (or missing `merge`) replaces the list with the
 * payload's todos in the payload's order. `merge: true` updates todos by
 * `id` (content and status), appends any id it has not seen, and leaves
 * every other todo exactly where it was. A todo without a string `id`
 * in a `merge: true` payload is appended, never dropped. A payload
 * whose `todos` is not an array leaves the list unchanged. Never throws.
 */
export function applyCursorTodoUpdate(
  current: readonly CursorAcpTodo[],
  params: CursorAcpTodoUpdateParams | null | undefined,
): CursorAcpTodo[] {
  if (!params || typeof params !== 'object') {
    return [...current]
  }

  const incoming = normalizeTodoArray(params.todos)

  if (params.todos !== undefined && !Array.isArray(params.todos)) {
    return [...current]
  }

  // merge: false or missing → full replace
  if (params.merge !== true) {
    return incoming
  }

  // merge: true → update by id, append unknowns
  const result = [...current]

  for (const todo of incoming) {
    const todoId = typeof todo.id === 'string' && todo.id ? todo.id : null
    if (todoId) {
      const idx = result.findIndex((t) => t.id === todoId)
      if (idx >= 0) {
        result[idx] = todo
      } else {
        result.push(todo)
      }
    } else {
      result.push(todo)
    }
  }

  return result
}

/**
 * Returns the set of todo `id`s that an update payload changed or added.
 * For a `merge: false` payload every incoming id counts as changed; for a
 * `merge: true` payload only the ids in the payload are changes.
 */
export function getCursorTodoUpdateChangedIds(
  params: CursorAcpTodoUpdateParams | null | undefined,
): Set<string> {
  if (!params || typeof params !== 'object') return new Set()
  const incoming = normalizeTodoArray(params.todos)
  const changed = new Set<string>()
  for (const todo of incoming) {
    if (typeof todo.id === 'string' && todo.id) {
      changed.add(todo.id)
    }
  }
  return changed
}

/**
 * Renders the full todo list as a transcript note.
 *
 * R2: the header is `Cursor todos`; every todo gets one `[status] content`
 * line; todos whose `id` is in `changedIds` end with ` ← updated`.
 */
export function renderCursorTodoNote(
  todos: readonly CursorAcpTodo[],
  changedIds: ReadonlySet<string>,
): string {
  const lines = todos.map((todo) => {
    const marker = changedIds.has(todo.id) ? ' ← updated' : ''
    return `[${todo.status}] ${todo.content}${marker}`
  })
  return ['Cursor todos', ...lines].join('\n')
}

function normalizeTodoArray(value: unknown): CursorAcpTodo[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    if (typeof item !== 'object' || item === null) {
      return { id: '', content: String(item), status: 'pending' }
    }
    const record = item as Record<string, unknown>
    return {
      id: typeof record.id === 'string' ? record.id : '',
      content:
        typeof record.content === 'string'
          ? record.content
          : String(record.content ?? ''),
      status: typeof record.status === 'string' ? record.status : 'pending',
    }
  })
}
