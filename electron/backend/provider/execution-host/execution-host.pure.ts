import type { Provider } from '../provider.types'
import type { ExecutionHostProviderCapabilities } from './execution-host.types'

export function capabilitiesForProvider(
  provider: Pick<Provider, 'id' | 'name' | 'supportsContinuation' | 'oneShot'>,
): ExecutionHostProviderCapabilities {
  return {
    providerId: provider.id,
    name: provider.name,
    supportsContinuation: provider.supportsContinuation,
    supportsOneShot: typeof provider.oneShot === 'function',
  }
}
