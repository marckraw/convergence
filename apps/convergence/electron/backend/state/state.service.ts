import type Database from 'better-sqlite3'
import type { AppStateRow } from '../database/database.types'

export class StateService {
  constructor(private db: Database.Database) {}

  get(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM app_state WHERE key = ?')
      .get(key) as AppStateRow | undefined

    return row?.value ?? null
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO app_state (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value)
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM app_state WHERE key = ?').run(key)
  }
}
