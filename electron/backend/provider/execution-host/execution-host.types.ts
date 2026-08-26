import type {
  OneShotInput,
  OneShotResult,
  ProviderDescriptor,
  ProviderContextManagementInput,
  ProviderContextManagementResult,
  SessionHandle,
  SessionStartConfig,
} from '../provider.types'

/**
 * Capability summary for one Provider as seen through a Provider Execution
 * Host. This is the only provider metadata callers may branch on; everything
 * else about how a Provider runs stays behind the host interface.
 */
export interface ExecutionHostProviderCapabilities {
  providerId: string
  name: string
  supportsContinuation: boolean
  supportsOneShot: boolean
  supportsContextManagement?: boolean
}

/**
 * The workspace slice of a host's session snapshot: where a session actually
 * runs and the pull request the host opened for it. Only hosts that materialize
 * their own workspace report one -- the Local Execution Host runs in a
 * directory the app already knows.
 */
export interface RemoteSessionWorkspaceInfo {
  workspace: {
    repository: string
    branchName: string
    baseRef: string | null
  } | null
  prUrl: string | null
}

/**
 * Provider Execution Host: the module that owns where and how Providers
 * actually run. Callers start Sessions and one-shot executions through this
 * interface and never touch provider process mechanics, registries, or
 * transport.
 *
 * Adapters: the Local Execution Host runs Providers inside the app process; a
 * Remote Execution Host runs them on another machine behind the same
 * interface.
 *
 * Invariants every adapter must uphold:
 *
 * - Provider availability is evaluated at call time. Providers may be
 *   registered after the host is constructed; `capabilities()` and all other
 *   methods reflect the set of Providers available at the moment of the call.
 * - `start` and `oneShot` throw/reject with an `Error` whose message is
 *   exactly `Provider not found: <providerId>` when the Provider is unknown.
 *   That sentence is a claim about what the host knows, so an adapter whose
 *   Provider set arrives over a wire may only make it once the set has
 *   arrived: before that it must refuse with why it has no listing, never with
 *   a verdict it has no basis for (MAR-2620).
 *   `oneShot` rejects with `Provider <providerId> does not support one-shot
 *   execution` when the Provider exists but is not one-shot capable.
 * - A `SessionHandle` returned by `start` follows the SessionHandle event
 *   contract from provider.types: deltas are delivered in emission order,
 *   listeners registered after events fired do not replay missed events, and
 *   `stop()` terminates the underlying run.
 * - `start` is synchronous and never returns a dead handle for a known
 *   Provider; failures after start surface through the handle's status and
 *   attention events, not as thrown errors.
 */
export interface ProviderExecutionHost {
  /** Capability summaries for every Provider currently available. */
  capabilities(): ExecutionHostProviderCapabilities[]

  /**
   * Capability summary for one Provider, or null when the Provider is not
   * available. This is the existence check callers should use before
   * branching on capabilities.
   */
  capabilitiesFor(providerId: string): ExecutionHostProviderCapabilities | null

  /** Full descriptors for every Provider currently available. */
  describe(): Promise<ProviderDescriptor[]>

  /**
   * Start a Session run on the named Provider. Throws `Provider not found:
   * <providerId>` for Providers the host knows it does not have — see the
   * invariant above for the adapter that has to find out first.
   */
  start(providerId: string, config: SessionStartConfig): SessionHandle

  /**
   * Run a non-conversational one-shot execution on the named Provider.
   * Rejects for unknown Providers and for Providers without one-shot
   * support.
   */
  oneShot(providerId: string, input: OneShotInput): Promise<OneShotResult>

  /** Run a provider-native context control without creating a chat turn. */
  manageContext?(
    providerId: string,
    config: SessionStartConfig,
    input: ProviderContextManagementInput,
  ): Promise<ProviderContextManagementResult>

  /**
   * Reattach to a run that is already executing on this host, resuming the
   * event stream after `afterSeq`. Only hosts whose runs outlive the app
   * process implement this; the Local Execution Host does not. Follows the
   * same invariants as `start`: synchronous, throws the canonical error for
   * unknown Providers, and surfaces post-attach failures through the handle.
   */
  attach?(
    providerId: string,
    config: SessionStartConfig,
    afterSeq: number,
  ): SessionHandle

  /**
   * Where this host is running the named session, when it materialized the
   * workspace itself. On the interface rather than on the remote adapter so
   * that asking about a session goes through the same host resolution a turn
   * does: a session's workspace must be read from the machine the session
   * names, never from whichever daemon a caller happens to hold (MAR-2620).
   */
  fetchSessionWorkspaceInfo?(
    sessionId: string,
  ): Promise<RemoteSessionWorkspaceInfo>
}
