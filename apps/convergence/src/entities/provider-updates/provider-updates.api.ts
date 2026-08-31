import { providerApi } from '@/entities/session'
import type {
  ProviderStatusInfo,
  ProviderUpdateResult,
} from '@/entities/session'

export const providerUpdatesApi = {
  getStatuses: (): Promise<ProviderStatusInfo[]> => providerApi.getStatuses(),

  update: (providerId: string): Promise<ProviderUpdateResult> =>
    providerApi.update(providerId),

  onStatusesChanged: (
    callback: (statuses: ProviderStatusInfo[]) => void,
  ): (() => void) =>
    window.electronAPI.provider?.onStatusesChanged?.(callback) ??
    (() => undefined),
}
