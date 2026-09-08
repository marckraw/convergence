import { afterEach, expect, it } from 'vitest'
import { getDatabase, closeDatabase, resetDatabase } from './database'

afterEach(() => {
  closeDatabase()
  resetDatabase()
})
it('adds both stop-reason columns — omit either ALTER turns red', () => {
  const db = getDatabase()
  expect(
    ['session_tasks', 'session_agent_runs'].map((table) =>
      (
        db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
      ).some((column) => column.name === 'stop_reason'),
    ),
  ).toEqual([true, true])
})
