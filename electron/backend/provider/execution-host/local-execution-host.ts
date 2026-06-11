import type { ProviderRegistry } from '../provider-registry'
import type {
  OneShotInput,
  OneShotResult,
  Provider,
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
 * registered after construction become available immediately.
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

  private requireProvider(providerId: string): Provider {
    const provider = this.registry.get(providerId)
    if (!provider) throw new Error(`Provider not found: ${providerId}`)
    return provider
  }
}
