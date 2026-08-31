import { isRemoteExecutionHost } from '@/entities/execution-host'
import type {
  ProviderQuotaSnapshot,
  ProviderQuotaWindow,
} from '@/entities/provider-quota'

export type CodexUsageTone = 'green' | 'amber' | 'red' | 'muted'

/**
 * Whether this composer governs the local Codex CLI's own billing (MAR-2682).
 *
 * Two controls hang off this: the ChatGPT quota pill, and the Fast-mode switch
 * that writes `serviceTier`. They are one predicate because they are one fact —
 * the Codex CLI installed on *this* machine, signed into *this* ChatGPT
 * account, billed to it. Neither is a claim the composer can make about a
 * daemon.
 *
 * The provider alone is not enough, and that is the correction. A Pi session
 * bills through Pi's credentials even when the model happens to be an OpenAI
 * one, so it never qualified; and a Codex session on an Endpoint runs on the
 * daemon's own installation, whose quota this app cannot read and whose service
 * tier it cannot set — `serviceTier` is on
 * `EXECUTION_HOST_UNMAPPED_START_CONFIG_FIELDS` and has never crossed the wire.
 * A switch above the strip that cannot reach the machine below it is a lie the
 * Execution Bar era exists to end (MAR-2619), and the answer is the one the
 * account picker already took: the control disappears because the fact behind
 * it is absent, not because a second predicate remembered to hide it.
 */
export function shouldShowCodexBillingControls(input: {
  providerId: string | null | undefined
  executionHostId: string | null | undefined
}): boolean {
  return (
    input.providerId === 'codex' &&
    !isRemoteExecutionHost(input.executionHostId)
  )
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
