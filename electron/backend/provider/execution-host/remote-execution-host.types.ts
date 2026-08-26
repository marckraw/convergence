import type { ProviderExecutionHost } from './execution-host.types'

/**
 * Types for the Remote Execution Host: the ProviderExecutionHost adapter that
 * runs Providers on an agents-daemon behind the execution host wire protocol
 * (see the `@mrck-labs/execution-host-protocol` package,
 * execution-host-wire-mapping.pure.ts and ADR 0006).
 *
 * Error classification mirrors the remote-daemon-guide pattern: every failure
 * carries a kind the caller can branch on without parsing messages.
 */
export type RemoteExecutionHostErrorKind =
  | 'configuration'
  | 'auth'
  | 'network'
  | 'http'
  | 'malformed'

export class RemoteExecutionHostError extends Error {
  constructor(
    message: string,
    public readonly kind: RemoteExecutionHostErrorKind,
    public readonly status?: number,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'RemoteExecutionHostError'
  }
}

/** Resolved daemon endpoint: base URL plus the bearer token to present. */
export interface RemoteExecutionHostConnection {
  baseUrl: string
  token: string
}

/**
 * Supplies the daemon connection at call time so settings changes apply
 * without rebuilding the host. Implementations throw
 * RemoteExecutionHostError('configuration') when base URL or token is
 * missing or invalid.
 */
export interface RemoteExecutionHostConnectionResolver {
  resolveConnection(): Promise<RemoteExecutionHostConnection>
}

/**
 * The slice of the daemon's /v0/meta provider listing the Remote Execution
 * Host consumes. Provider IDs live in the daemon's namespace (e.g. `claude`,
 * `codex`), not the local registry's.
 */
export interface RemoteExecutionHostProviderInfo {
  providerId: string
  name: string
  available: boolean
  authenticated: boolean
  supportsContinuation: boolean
  models: { id: string; label: string }[]
}

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
