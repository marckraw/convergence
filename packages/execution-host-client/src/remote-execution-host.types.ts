import type { ExecutionSessionWorkspace } from '@mrck-labs/execution-host-protocol'

/**
 * Types for the daemon client: what a machine running the execution host wire
 * protocol says about itself, and how a failure to reach it is classified (see
 * the `@mrck-labs/execution-host-protocol` package and ADR 0006).
 *
 * Everything here is the *daemon's* vocabulary. The adapter that turns it into
 * an app's own — a `ProviderExecutionHost`, a session record, a catalog row —
 * lives in the app that consumes this package, which is why
 * `RemoteExecutionHostRegistry` stayed behind in Convergence (MAR-2737).
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
  /**
   * What the daemon says about this provider's state in its own words --
   * `'ready'`, `'missing binary'` -- or null when it says nothing readable
   * (MAR-2682).
   *
   * The reason a refusal quotes. Rendering "not available" from the boolean
   * alone would throw away the only half of the answer that says *why*, and a
   * reader looking at a disabled row needs exactly that half.
   */
  details: string | null
  supportsContinuation: boolean
  models: { id: string; label: string }[]
}

/**
 * The workspace slice of a daemon's session snapshot: where a session actually
 * runs and the pull request the daemon opened for it. Only hosts that
 * materialize their own workspace report one -- Convergence's Local Execution
 * Host runs in a directory the app already knows.
 *
 * `workspace` is the protocol's own `ExecutionSessionWorkspace` (0.14), not a
 * transcription of it: a discriminated union whose Repository arm carries the
 * clone and its branch and whose Project arm carries the checkout's origin and
 * its actual HEAD. `null` means the host reported none -- a session whose
 * workspace has not been materialised yet -- and never "we could not read what
 * it sent", which is refused instead (MAR-2694).
 */
export interface RemoteSessionWorkspaceInfo {
  workspace: ExecutionSessionWorkspace | null
  pullRequest: RemoteSessionPullRequest
}

/**
 * What a host's snapshot said about the pull request, as a reading rather than
 * a nullable string (MAR-2718 round 2).
 *
 * The wire door used to answer `typeof value.prUrl === 'string' ? value.prUrl :
 * null`, so a missing key, a number, `false`, a blank string and `ftp://x` all
 * became the one value the panel is allowed to render as `None yet` -- a claim
 * that the daemon looked and opened none. The daemon emits the field
 * explicitly, so its own `null` is the negative and nothing else is: decoded
 * here, never collapsed, so the negative is only available when somebody
 * actually gave it (MAR-2619).
 */
export type RemoteSessionPullRequest =
  /** The host answered, and it has opened none. */
  | { kind: 'none' }
  /** The host answered with one. */
  | { kind: 'url'; url: string }
  /** The field was missing or was a shape no reader can turn into a URL. */
  | { kind: 'unreadable'; reason: string }
