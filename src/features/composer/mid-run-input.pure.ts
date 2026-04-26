import type {
  AttentionState,
  MidRunInputMode,
  ProviderInfo,
  SessionStatus,
} from '@/entities/session'

export interface ResolveMidRunInputPolicyInput {
  status: SessionStatus | null
  attention: AttentionState | null
  provider: Pick<ProviderInfo, 'midRunInput'> | null
}

export interface MidRunInputPolicy {
  disabled: boolean
  defaultMode: MidRunInputMode
  availableModes: MidRunInputMode[]
  reason: string | null
}

export function resolveMidRunInputPolicy({
  status,
  attention,
  provider,
}: ResolveMidRunInputPolicyInput): MidRunInputPolicy {
  if (attention === 'needs-input') {
    return {
      disabled: false,
      defaultMode: 'answer',
      availableModes: ['answer'],
      reason: null,
    }
  }

  if (status !== 'running') {
    return {
      disabled: false,
      defaultMode: 'normal',
      availableModes: ['normal'],
      reason: null,
    }
  }

  const capability = provider?.midRunInput
  if (!capability) {
    return {
      disabled: true,
      defaultMode: 'normal',
      availableModes: [],
      reason: 'Provider does not support messages while running',
    }
  }

  const modes: MidRunInputMode[] = []
  if (
    capability.supportsNativeFollowUp ||
    capability.supportsAppQueuedFollowUp
  ) {
    modes.push('follow-up')
  }
  if (capability.supportsSteer) {
    modes.push('steer')
  }

  if (modes.length === 0) {
    return {
      disabled: true,
      defaultMode: 'normal',
      availableModes: [],
      reason: 'Provider does not support messages while running',
    }
  }

  const defaultMode =
    capability.defaultRunningMode &&
    modes.includes(capability.defaultRunningMode)
      ? capability.defaultRunningMode
      : modes[0]!

  return {
    disabled: false,
    defaultMode,
    availableModes: modes,
    reason: null,
  }
}
