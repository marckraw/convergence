import type {
  ProviderQuotaSnapshot,
  ProviderQuotaWindow,
} from '@/entities/provider-quota'
import type { ResolvedProviderSelection } from '@/entities/session'

export type CodexUsageTone = 'green' | 'amber' | 'red' | 'muted'

export function shouldShowCodexUsagePill(
  selection: Pick<ResolvedProviderSelection, 'providerId' | 'modelId'>,
): boolean {
  if (selection.providerId === 'codex') return true
  if (selection.providerId !== 'pi') return false

  const providerPrefix = selection.modelId.split('/')[0]?.toLowerCase()
  return providerPrefix === 'openai'
}

export function getPrimaryCodexWindow(
  snapshot: ProviderQuotaSnapshot | null,
): ProviderQuotaWindow | null {
  if (!snapshot || snapshot.status !== 'available') return null
  return (
    snapshot.windows.find((window) => window.kind === 'five-hour') ??
    snapshot.windows[0] ??
    null
  )
}

export function getCodexWindow(
  snapshot: ProviderQuotaSnapshot | null,
  kind: ProviderQuotaWindow['kind'],
): ProviderQuotaWindow | null {
  if (!snapshot || snapshot.status !== 'available') return null
  return snapshot.windows.find((window) => window.kind === kind) ?? null
}

export function getCodexUsageTone(
  remainingPercent: number | null | undefined,
): CodexUsageTone {
  if (typeof remainingPercent !== 'number') return 'muted'
  if (remainingPercent <= 15) return 'red'
  if (remainingPercent <= 40) return 'amber'
  return 'green'
}

export function formatCodexRemainingPercent(
  remainingPercent: number | null | undefined,
): string {
  if (typeof remainingPercent !== 'number') return '--'
  return `${Math.round(remainingPercent)}%`
}
