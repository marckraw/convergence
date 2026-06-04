import type {
  ProviderQuotaSnapshot,
  ProviderQuotaWindow,
} from '@/entities/provider-quota'

export function getPrimaryCursorWindow(
  snapshot: ProviderQuotaSnapshot | null,
): ProviderQuotaWindow | null {
  if (!snapshot || snapshot.status !== 'available') return null
  return snapshot.windows[0] ?? null
}

export function formatCursorWindowLabel(window: ProviderQuotaWindow): string {
  if (window.label.toLowerCase().includes('on-demand')) return 'On-demand'
  return window.label
}
