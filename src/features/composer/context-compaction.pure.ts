import { isRemoteExecutionHost } from '@/entities/execution-host'
import type { ProviderInfo, SessionSummary } from '@/entities/session'

export interface ContextCompactionActionState {
  visible: boolean
  enabled: boolean
  reason: string | null
}

export function resolveContextCompactionAction(
  session: SessionSummary,
  provider: ProviderInfo | null | undefined,
  options: { hasPendingQueuedInput?: boolean } = {},
): ContextCompactionActionState {
  const capability = provider?.contextManagement?.compact
  if (!capability) {
    return { visible: false, enabled: false, reason: null }
  }
  if (capability.availability === 'unavailable') {
    return {
      visible: true,
      enabled: false,
      reason:
        capability.notes ??
        `${provider?.name ?? 'This provider'} does not support manual context compaction.`,
    }
  }
  if (isRemoteExecutionHost(session.executionHost)) {
    return {
      visible: true,
      enabled: false,
      reason:
        'Manual context compaction is not available for remote sessions yet.',
    }
  }
  if (session.activity === 'compacting') {
    return {
      visible: true,
      enabled: false,
      reason: 'Context compaction is in progress.',
    }
  }
  if (session.status !== 'completed') {
    return {
      visible: true,
      enabled: false,
      reason: 'Wait for the active turn to finish before compacting context.',
    }
  }
  if (
    session.attention === 'needs-input' ||
    session.attention === 'needs-approval'
  ) {
    return {
      visible: true,
      enabled: false,
      reason: 'Resolve the pending provider request before compacting context.',
    }
  }
  if (options.hasPendingQueuedInput) {
    return {
      visible: true,
      enabled: false,
      reason: 'Send or cancel queued input before compacting context.',
    }
  }
  if (!session.continuationToken) {
    return {
      visible: true,
      enabled: false,
      reason: 'This session has no resumable provider context yet.',
    }
  }
  return { visible: true, enabled: true, reason: capability.notes ?? null }
}
