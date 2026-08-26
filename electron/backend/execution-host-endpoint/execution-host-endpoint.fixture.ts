import type Database from 'better-sqlite3'

/**
 * A configured Endpoint for tests that need a session to run somewhere other
 * than this machine (MAR-2620).
 *
 * Deliberately not `'default'`: a test that passes only because it happened to
 * name the migrated id would not prove that a session resolves to the Endpoint
 * it recorded, which is the whole point of Endpoints having ids.
 */
export const TEST_EXECUTION_HOST_ENDPOINT_ID = 'daemon-a'

export function seedExecutionHostEndpoint(
  db: Database.Database,
  id: string = TEST_EXECUTION_HOST_ENDPOINT_ID,
  baseUrl = `https://${id}.example.com`,
): string {
  db.prepare(
    `INSERT OR REPLACE INTO execution_host_endpoints (id, label, base_url, position)
     VALUES (?, ?, ?, 0)`,
  ).run(id, id, baseUrl)
  return id
}
