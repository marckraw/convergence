import type Database from 'better-sqlite3'
import type { ExecutionHostEndpointRow } from '../database/database.types'
import {
  normalizeExecutionHostEndpoints,
  requireExecutionHostEndpointId,
} from './execution-host-endpoint.pure'
import type {
  ExecutionHostEndpoint,
  ExecutionHostEndpointInput,
} from './execution-host-endpoint.types'

/**
 * A stored row, read back as the Endpoint it claims to be (MAR-2642).
 *
 * The id is checked here and not only where it is written, because writing is
 * not the only way a row arrives: this database is a file on disk, rows predate
 * the bound the write path now applies, and an id read back off it reaches
 * `security` exactly like one typed today. Refusing loudly is the honest
 * answer — the alternative is dropping the row, which hides a machine whose
 * sessions still name it, or repairing the id, which is that machine's Keychain
 * account silently becoming somebody else's.
 */
function fromRow(row: ExecutionHostEndpointRow): ExecutionHostEndpoint {
  return {
    id: requireExecutionHostEndpointId(row.id),
    label: row.label,
    baseUrl: row.base_url,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Persistence for the Endpoints a session can name (MAR-2620).
 *
 * Deliberately the only place that reads or writes the table, so the id a
 * session records and the id the settings surface edits are always the same
 * fact rather than two encodings of it.
 */
export class ExecutionHostEndpointRepository {
  constructor(private readonly db: Database.Database) {}

  list(): ExecutionHostEndpoint[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM execution_host_endpoints ORDER BY position ASC, id ASC',
      )
      .all() as ExecutionHostEndpointRow[]
    return rows.map(fromRow)
  }

  getById(id: string): ExecutionHostEndpoint | null {
    const row = this.db
      .prepare('SELECT * FROM execution_host_endpoints WHERE id = ?')
      .get(id) as ExecutionHostEndpointRow | undefined
    return row ? fromRow(row) : null
  }

  /**
   * Makes the stored list exactly the one supplied.
   *
   * One transaction, because a half-applied list is a list nobody asked for:
   * between the delete and the insert a session's Endpoint would be missing and
   * a turn started in that gap would fail for a reason that is not true.
   * Endpoints keep their `created_at` across a save so an edit to a label or a
   * URL does not read as a different machine.
   */
  replaceAll(inputs: readonly ExecutionHostEndpointInput[]): void {
    const normalized = normalizeExecutionHostEndpoints(inputs)
    const apply = this.db.transaction(() => {
      const keep = normalized.map((endpoint) => endpoint.id)
      const placeholders = keep.map(() => '?').join(', ')
      this.db
        .prepare(
          keep.length
            ? `DELETE FROM execution_host_endpoints WHERE id NOT IN (${placeholders})`
            : 'DELETE FROM execution_host_endpoints',
        )
        .run(...keep)

      const upsert = this.db.prepare(
        `INSERT INTO execution_host_endpoints (id, label, base_url, position)
         VALUES (@id, @label, @baseUrl, @position)
         ON CONFLICT(id) DO UPDATE SET
           label = excluded.label,
           base_url = excluded.base_url,
           position = excluded.position,
           updated_at = datetime('now')`,
      )
      for (const endpoint of normalized) upsert.run(endpoint)
    })
    apply()
  }
}
