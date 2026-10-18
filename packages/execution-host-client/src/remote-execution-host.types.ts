import type {
  ExecutionProviderInteractions,
  ExecutionProviderPermissions,
  ExecutionProviderUsage,
  ExecutionSessionWorkspace,
} from '@mrck-labs/execution-host-protocol'

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
 * A model a daemon's provider offers, with the efforts the host says it takes
 * (`models[].efforts`, `models[].defaultEffort`, MAR-4272).
 */
export interface RemoteExecutionHostProviderModel {
  id: string
  label: string
  /** The effort ids it takes; empty when the host names none. */
  efforts: string[]
  /** The effort it runs with when none is named; null when the host names none. */
  defaultEffort: string | null
}

/**
 * The slice of the daemon's provider catalogue (`GET /v0/providers`) the
 * Remote Execution Host consumes. Provider IDs live in the daemon's namespace
 * (e.g. `claude`, `codex`), not the local registry's.
 *
 * The provider's `account` is not here, by decision rather than omission: it
 * is personal data the protocol says to show owners only, and Marcin's ruling
 * of 18 Oct keeps it to the super-admin. A client holding a daemon token
 * cannot tell whether its reader is one, so the account is dropped where the
 * catalogue is read and never reaches an app. Usage and credits are not
 * personal and may be shown to anyone, so they are kept (MAR-4272).
 */
export interface RemoteExecutionHostProviderInfo {
  providerId: string
  name: string
  /**
   * Installed on the host. Null when the host does not say, which the
   * protocol reads as unknown and never as `false`.
   */
  available: boolean | null
  /** Signed in on the host; null when the host does not say. */
  authenticated: boolean | null
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
  models: RemoteExecutionHostProviderModel[]
  /**
   * The permission choices a session of this provider can ask for, and the
   * sandbox each Codex choice really runs as here. Null when the host does not
   * say: unknown, not none.
   */
  permissions: ExecutionProviderPermissions | null
  /** The request kinds the provider asks with, or never does; null when unknown. */
  interactions: ExecutionProviderInteractions | null
  /**
   * How much of the host account's limits is used, credits included, as the
   * host last heard it. Null when the host does not say: never "0%".
   */
  usage: ExecutionProviderUsage | null
}

/**
 * The workspace slice of a daemon's session snapshot: where a session actually
 * runs. Only hosts that materialize their own workspace report one --
 * Convergence's Local Execution Host runs in a directory the app already knows.
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
}
