import type {
  ProviderQuotaSnapshot,
  ProviderQuotaWindow,
} from '@/entities/provider-quota'
import type { ResolvedProviderSelection } from '@/entities/session'

export function shouldShowClaudeUsagePill(
  selection: Pick<ResolvedProviderSelection, 'providerId'>,
): boolean {
  return selection.providerId === 'claude-code'
}

export function getPrimaryClaudeWindow(
  snapshot: ProviderQuotaSnapshot | null,
): ProviderQuotaWindow | null {
  if (!snapshot || snapshot.status !== 'available') return null
  return (
    snapshot.windows.find((window) => window.kind === 'five-hour') ??
    snapshot.windows[0] ??
    null
  )
}

export function getClaudeWindow(
  snapshot: ProviderQuotaSnapshot | null,
  kind: ProviderQuotaWindow['kind'],
): ProviderQuotaWindow | null {
  if (!snapshot || snapshot.status !== 'available') return null
  return snapshot.windows.find((window) => window.kind === kind) ?? null
}

export function formatClaudeUsagePillValue(
  window: ProviderQuotaWindow | null,
): string {
  const value = window?.valueLabel?.trim()
  if (!value) return '--'

  const tokens = value.split(',')[0]?.trim()
  return tokens?.replace(/\s+tokens$/i, '') || value
}
