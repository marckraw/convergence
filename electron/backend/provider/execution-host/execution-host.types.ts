import type {
  OneShotInput,
  OneShotResult,
  ProviderDescriptor,
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
   * <providerId>` for unknown Providers.
   */
  start(providerId: string, config: SessionStartConfig): SessionHandle

  /**
   * Run a non-conversational one-shot execution on the named Provider.
   * Rejects for unknown Providers and for Providers without one-shot
   * support.
   */
  oneShot(providerId: string, input: OneShotInput): Promise<OneShotResult>

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
}
