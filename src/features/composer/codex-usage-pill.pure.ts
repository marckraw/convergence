import type {
  ProviderQuotaSnapshot,
  ProviderQuotaWindow,
} from '@/entities/provider-quota'
import type { ResolvedProviderSelection } from '@/entities/session'

export type CodexUsageTone = 'green' | 'amber' | 'red' | 'muted'

/**
 * The pill reports the Codex CLI's own ChatGPT quota, so it belongs to Codex
 * sessions only. A Pi session bills through Pi's own credentials even when the
 * selected model happens to be an OpenAI one.
 */
export function shouldShowCodexUsagePill(
  selection: Pick<ResolvedProviderSelection, 'providerId'>,
): boolean {
  return selection.providerId === 'codex'
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
