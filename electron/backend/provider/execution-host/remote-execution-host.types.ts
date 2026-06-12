/**
 * Types for the Remote Execution Host: the ProviderExecutionHost adapter that
 * runs Providers on an agents-daemon behind the execution host wire protocol
 * (see execution-host-protocol.types.ts and ADR 0006).
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
