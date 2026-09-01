import type { ProviderExecutionHost } from './execution-host.types'

/**
 * The Endpoint-keyed lookup every remote run goes through (MAR-2620).
 *
 * A session records the id of the machine it runs on, and this is what turns
 * that id back into the host that speaks to that machine. It is a lookup and
 * not a single host precisely because the id must survive the round trip:
 * validating the id and then handing back an ambient singleton would run the
 * session on whichever daemon was configured first, with the session's own
 * record still asserting the one it named.
 */
export interface RemoteExecutionHostRegistry {
  hostFor(endpointId: string): ProviderExecutionHost

  /**
   * Settles when this Endpoint has a provider listing read from the address it
   * points at now, and rejects with why when it never did.
   *
   * `hostFor` hands back a host whose capability cache may still be empty
   * because the daemon has not answered yet, or filled from a base URL this
   * Endpoint has since been edited away from; `start()` reads that cache
   * synchronously and cannot tell either case from an answer. Anything about
   * to start a session awaits this first, so a turn is never refused for a
   * provider the daemon has, and never allowed by one the daemon does not.
   */
  whenReady(endpointId: string): Promise<void>
}
