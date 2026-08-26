import type Database from 'better-sqlite3'
import type { ProviderExecutionHost } from '../provider/execution-host/execution-host.types'
import type { RemoteExecutionHostRegistry } from '../provider/execution-host/remote-execution-host.types'

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

/**
 * A registry that hands back a host only for the Endpoint ids it was given.
 *
 * It throws for anything else rather than falling back to the one host it
 * holds: a fixture that answered every id would make the routing it stands in
 * for unobservable, which is the exact confusion Endpoint ids exist to
 * prevent (MAR-2620).
 *
 * `whenReady` resolves for an id it knows and refuses one it does not, for the
 * same reason: readiness is a question about a named machine, and a fixture
 * that answered "ready" for every id would let a caller wait on an Endpoint
 * that does not exist and proceed as though it did.
 */
export function executionHostRegistryFor(
  hosts: Record<string, ProviderExecutionHost>,
): RemoteExecutionHostRegistry {
  const require = (endpointId: string): ProviderExecutionHost => {
    const host = hosts[endpointId]
    if (!host) {
      throw new Error(
        `No execution host registered for endpoint: ${endpointId}`,
      )
    }
    return host
  }
  return {
    hostFor: require,
    whenReady: async (endpointId) => {
      require(endpointId)
    },
  }
}
