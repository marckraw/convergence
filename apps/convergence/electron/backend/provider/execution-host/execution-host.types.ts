import type { ExecutionSessionWorkspace } from '@mrck-labs/execution-host-protocol'
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
 * Three words, and they are not interchangeable: a Provider is *listed* when
 * this host knows about it, *runnable* when this host will actually start it,
 * and *blocked* when it is listed and not runnable — a daemon that has the CLI
 * and refuses to run it. `capabilities`, `capabilitiesFor` and `describe`
 * answer the listing question; `assertProviderRunnable` is the only one that
 * answers permission. The word "available" said both at once, and a caller
 * read a descriptive method as a gate because of it (MAR-2682).
 *
 * Invariants every adapter must uphold:
 *
 * - What a host lists is evaluated at call time. Providers may be registered
 *   after the host is constructed; `capabilities()` and all other methods
 *   reflect the set of Providers listed at the moment of the call.
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
  /** Capability summaries for every Provider this host currently lists. */
  capabilities(): ExecutionHostProviderCapabilities[]

  /**
   * Capability summary for one Provider, or null when this host does not list
   * it. This is the existence check callers should use before branching on
   * capabilities — it says whether a Provider is listed, never whether it is
   * runnable.
   */
  capabilitiesFor(providerId: string): ExecutionHostProviderCapabilities | null

  /** Full descriptors for every Provider this host currently lists. */
  describe(): Promise<ProviderDescriptor[]>

  /**
   * Refuses this Provider, in this host's own words, or returns for one this
   * host will actually run (MAR-2682).
   *
   * The permission question, and the only method that answers it. Everything
   * else here is descriptive: `capabilitiesFor` says what a Provider is *like*,
   * and callers used it as a gate -- `if (!capabilitiesFor(id)) throw 'Provider
   * not found'` -- which reads a listed-but-refused Provider as an absent one
   * and tells the human the wrong thing about their own machine. A host that
   * lists a Provider its daemon will not run (deliberately: the option row
   * shows it disabled, with the reason) has to be able to say *why* here, and
   * a null-or-not answer has nowhere to put the reason.
   *
   * Throws rather than returning a verdict, because every caller's next line is
   * to start something, and the message is the product: it is the same sentence
   * the disabled row upstairs already showed. Unknown Providers get the
   * canonical `Provider not found: <providerId>` that `start` and `oneShot`
   * throw, and an adapter whose Provider set arrives over a wire may only make
   * that claim once the set has arrived -- see the invariant above.
   */
  assertProviderRunnable(providerId: string): void

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
   * process implement this; the Local Execution Host does not. Synchronous like
   * `start`, and post-attach failures surface through the handle rather than as
   * thrown errors.
   *
   * It deliberately asks no provider question -- neither the listing one nor
   * `assertProviderRunnable` (MAR-2682). An attach can happen at boot before
   * the listing has arrived, and the run it rejoins was already validated when
   * it started; refusing here would strand a turn the daemon is running on a
   * verdict about whether a *new* one could be started. `RemoteExecutionHost
   * .attach` says the same thing at the code.
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
