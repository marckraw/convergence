import type { ProviderRegistry } from '../provider-registry'
import type {
  OneShotInput,
  OneShotResult,
  Provider,
  ProviderContextManagementInput,
  ProviderContextManagementResult,
  ProviderDescriptor,
  SessionHandle,
  SessionStartConfig,
} from '../provider.types'
import { capabilitiesForProvider } from './execution-host.pure'
import type {
  ExecutionHostProviderCapabilities,
  ProviderExecutionHost,
} from './execution-host.types'

/**
 * Local Execution Host: runs Providers inside the app process by delegating
 * to the in-process ProviderRegistry. Delegation is live — Providers
 * registered after construction are listed immediately.
 *
 * Nothing this host lists is ever blocked: a Provider in this process is one
 * this process will run, so listed and runnable are the same set here. They
 * are not on a daemon, which is why they are two questions on the interface.
 */
export class LocalExecutionHost implements ProviderExecutionHost {
  constructor(private registry: ProviderRegistry) {}

  capabilities(): ExecutionHostProviderCapabilities[] {
    return this.registry.getAll().map(capabilitiesForProvider)
  }

  capabilitiesFor(
    providerId: string,
  ): ExecutionHostProviderCapabilities | null {
    const provider = this.registry.get(providerId)
    return provider ? capabilitiesForProvider(provider) : null
  }

  describe(): Promise<ProviderDescriptor[]> {
    return Promise.all(this.registry.getAll().map((p) => p.describe()))
  }

  /**
   * Registered here or not, and nothing else to weigh: this host runs whatever
   * the in-process registry holds, so "listed" and "will run" are one fact.
   * The same refusal `start` gives, from the same line.
   */
  assertProviderRunnable(providerId: string): void {
    this.requireProvider(providerId)
  }

  start(providerId: string, config: SessionStartConfig): SessionHandle {
    return this.requireProvider(providerId).start(config)
  }

  async oneShot(
    providerId: string,
    input: OneShotInput,
  ): Promise<OneShotResult> {
    const provider = this.requireProvider(providerId)
    if (!provider.oneShot) {
      throw new Error(
        `Provider ${providerId} does not support one-shot execution`,
      )
    }
    return provider.oneShot(input)
  }

  async manageContext(
    providerId: string,
    config: SessionStartConfig,
    input: ProviderContextManagementInput,
  ): Promise<ProviderContextManagementResult> {
    const provider = this.requireProvider(providerId)
    if (!provider.manageContext) {
      throw new Error(
        `Provider ${providerId} does not support context management`,
      )
    }
    return provider.manageContext(config, input)
  }

  private requireProvider(providerId: string): Provider {
    const provider = this.registry.get(providerId)
    if (!provider) throw new Error(`Provider not found: ${providerId}`)
    return provider
  }
}
