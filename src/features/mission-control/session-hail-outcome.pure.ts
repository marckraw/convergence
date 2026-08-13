import {
  resolveMidRunInputPolicy,
  type AttentionState,
  type MidRunInputMode,
  type ProviderInfo,
  type SessionStatus,
} from '@/entities/session'

export type HailOutcomeKind =
  | 'new-turn'
  | 'queued-input'
  | 'current-turn'
  | 'answer'
  | 'unavailable'

export interface HailOutcome {
  kind: HailOutcomeKind
  /** What the send will do, stated before the send. Never a surprise. */
  label: string
  deliveryMode: MidRunInputMode
  disabled: boolean
}

export interface ResolveHailOutcomeInput {
  status: SessionStatus | null
  attention: AttentionState | null
  provider: Pick<ProviderInfo, 'midRunInput'> | null
}

/**
 * What a Hail will actually do to this Session, in the words the composer
 * shows before the send.
 *
 * Rides the existing mid-run input capability logic rather than reinventing
 * it, then names the outcome. The running case is not one outcome but three:
 * providers that queue app-side (Claude Code, Codex) really do queue behind
 * the current turn, providers with native follow-up (Pi) deliver into the
 * turn that is already running, and a Session holding a question takes an
 * answer. Saying "queues" for all of them would be the surprise the ruling
 * exists to prevent.
 */
export function resolveHailOutcome({
  status,
  attention,
  provider,
}: ResolveHailOutcomeInput): HailOutcome {
  const policy = resolveMidRunInputPolicy({ status, attention, provider })

  if (policy.disabled) {
    return {
      kind: 'unavailable',
      label:
        policy.reason ?? 'This session cannot take a message while it runs',
      deliveryMode: policy.defaultMode,
      disabled: true,
    }
  }

  if (policy.defaultMode === 'answer') {
    return {
      kind: 'answer',
      label: 'Answers the pending question',
      deliveryMode: 'answer',
      disabled: false,
    }
  }

  if (policy.defaultMode === 'normal') {
    return {
      kind: 'new-turn',
      label: 'Starts a new turn',
      deliveryMode: 'normal',
      disabled: false,
    }
  }

  if (policy.defaultMode === 'steer') {
    return {
      kind: 'current-turn',
      label: 'Steers the current turn',
      deliveryMode: 'steer',
      disabled: false,
    }
  }

  // follow-up: queued app-side unless the provider takes it natively.
  const queuesAppSide =
    provider?.midRunInput?.supportsAppQueuedFollowUp === true &&
    provider.midRunInput.supportsNativeFollowUp !== true

  return queuesAppSide
    ? {
        kind: 'queued-input',
        label: 'Queues behind the current turn',
        deliveryMode: 'follow-up',
        disabled: false,
      }
    : {
        kind: 'current-turn',
        label: 'Delivers into the current turn',
        deliveryMode: 'follow-up',
        disabled: false,
      }
}
