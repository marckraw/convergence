import type { ProviderStatusInfo } from '@/entities/session'

export type ProviderUpdateTrigger = 'user' | 'background'

export interface ProviderUpdateActionResult {
  providerId: string
  providerName: string
  ok: boolean
  error: string | null
}

export interface ProviderUpdateSnapshot {
  statuses: ProviderStatusInfo[]
  checkedAt: string | null
}
