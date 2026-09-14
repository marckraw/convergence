import type { Provider } from '../provider.types'
import type { ExecutionHostProviderCapabilities } from './execution-host.types'

export function capabilitiesForProvider(
  provider: Pick<
    Provider,
    | 'id'
    | 'name'
    | 'supportsContinuation'
    | 'oneShot'
    | 'manageContext'
    | 'accountHandoff'
  >,
): ExecutionHostProviderCapabilities {
  return {
    providerId: provider.id,
    ...(provider.accountHandoff
      ? { accountHandoff: provider.accountHandoff }
      : {}),
    name: provider.name,
    supportsContinuation: provider.supportsContinuation,
    supportsOneShot: typeof provider.oneShot === 'function',
    supportsContextManagement: typeof provider.manageContext === 'function',
  }
}
