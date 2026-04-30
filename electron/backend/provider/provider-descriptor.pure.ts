import type {
  MidRunInputMode,
  ProviderAttachmentCapability,
  ProviderDescriptor,
  ProviderEffortOption,
  ProviderMidRunInputCapability,
  ProviderSkillsCapability,
  ReasoningEffort,
} from './provider.types'

const MB = 1024 * 1024

const CLAUDE_CODE_ATTACHMENT_CAPABILITY: ProviderAttachmentCapability = {
  supportsImage: true,
  supportsPdf: true,
  supportsText: true,
  maxImageBytes: 10 * MB,
  maxPdfBytes: 20 * MB,
  maxTextBytes: 1 * MB,
  maxTotalBytes: 50 * MB,
}

export const CODEX_ATTACHMENT_CAPABILITY: ProviderAttachmentCapability = {
  supportsImage: true,
  supportsPdf: false,
  supportsText: true,
  maxImageBytes: 10 * MB,
  maxPdfBytes: 0,
  maxTextBytes: 1 * MB,
  maxTotalBytes: 50 * MB,
}

const PI_ATTACHMENT_CAPABILITY: ProviderAttachmentCapability = {
  supportsImage: true,
  supportsPdf: false,
  supportsText: true,
  maxImageBytes: 10 * MB,
  maxPdfBytes: 0,
  maxTextBytes: 1 * MB,
  maxTotalBytes: 50 * MB,
}

const CLAUDE_CODE_SKILLS_CAPABILITY: ProviderSkillsCapability = {
  catalog: 'filesystem',
  invocation: 'native-command',
  activationConfirmation: 'native-event',
}

const CODEX_SKILLS_CAPABILITY: ProviderSkillsCapability = {
  catalog: 'native-rpc',
  invocation: 'structured-input',
  activationConfirmation: 'none',
}

const PI_SKILLS_CAPABILITY: ProviderSkillsCapability = {
  catalog: 'filesystem',
  invocation: 'native-command',
  activationConfirmation: 'none',
}

const UNSUPPORTED_SKILLS_CAPABILITY: ProviderSkillsCapability = {
  catalog: 'unsupported',
  invocation: 'unsupported',
  activationConfirmation: 'none',
}

export const NO_MID_RUN_INPUT_CAPABILITY: ProviderMidRunInputCapability = {
  supportsAnswer: false,
  supportsNativeFollowUp: false,
  supportsAppQueuedFollowUp: false,
  supportsSteer: false,
  supportsInterrupt: false,
  defaultRunningMode: null,
}

export const CLAUDE_CODE_MID_RUN_INPUT_CAPABILITY: ProviderMidRunInputCapability =
  {
    supportsAnswer: false,
    supportsNativeFollowUp: false,
    supportsAppQueuedFollowUp: true,
    supportsSteer: false,
    supportsInterrupt: false,
    defaultRunningMode: 'follow-up',
    notes:
      'Claude Code uses app-managed follow-up queueing until the adapter moves to a long-lived streaming input process.',
  }

export const CODEX_MID_RUN_INPUT_CAPABILITY: ProviderMidRunInputCapability = {
  supportsAnswer: true,
  supportsNativeFollowUp: false,
  supportsAppQueuedFollowUp: true,
  supportsSteer: true,
  supportsInterrupt: true,
  defaultRunningMode: 'follow-up',
}

const PI_MID_RUN_INPUT_CAPABILITY: ProviderMidRunInputCapability = {
  supportsAnswer: false,
  supportsNativeFollowUp: true,
  supportsAppQueuedFollowUp: false,
  supportsSteer: true,
  supportsInterrupt: false,
  defaultRunningMode: 'follow-up',
}

export function getMidRunInputCapabilityForProviderId(
  providerId: string,
): ProviderMidRunInputCapability {
  switch (providerId) {
    case 'claude-code':
      return CLAUDE_CODE_MID_RUN_INPUT_CAPABILITY
    case 'codex':
      return CODEX_MID_RUN_INPUT_CAPABILITY
    case 'pi':
      return PI_MID_RUN_INPUT_CAPABILITY
    default:
      return NO_MID_RUN_INPUT_CAPABILITY
  }
}

export function supportsMidRunInputMode(
  capability: ProviderMidRunInputCapability,
  mode: MidRunInputMode,
): boolean {
  switch (mode) {
    case 'normal':
      return true
    case 'answer':
      return capability.supportsAnswer
    case 'follow-up':
      return (
        capability.supportsNativeFollowUp ||
        capability.supportsAppQueuedFollowUp
      )
    case 'steer':
      return capability.supportsSteer
    case 'interrupt':
      return capability.supportsInterrupt
  }
}

const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  max: 'Max',
  xhigh: 'Very High',
}

export function buildEffortOptions(
  ids: ReasoningEffort[],
  descriptions: Partial<Record<ReasoningEffort, string>> = {},
): ProviderEffortOption[] {
  return ids.map((id) => ({
    id,
    label: EFFORT_LABELS[id],
    description: descriptions[id],
  }))
}

export function buildClaudeDescriptor(): ProviderDescriptor {
  return {
    id: 'claude-code',
    name: 'Claude Code',
    vendorLabel: 'Anthropic',
    kind: 'conversation',
    supportsContinuation: true,
    defaultModelId: 'sonnet',
    fastModelId: 'haiku',
    modelOptions: [
      {
        id: 'sonnet',
        label: 'Claude Sonnet',
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions(['low', 'medium', 'high']),
      },
      {
        id: 'opus',
        label: 'Claude Opus',
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions(['low', 'medium', 'high', 'max']),
      },
      {
        id: 'haiku',
        label: 'Claude Haiku',
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions(['low', 'medium', 'high']),
      },
      {
        id: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6',
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions(['low', 'medium', 'high']),
      },
      {
        id: 'claude-opus-4-7',
        label: 'Claude Opus 4.7',
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions(['low', 'medium', 'high', 'max']),
      },
      {
        id: 'claude-opus-4-6',
        label: 'Claude Opus 4.6',
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions(['low', 'medium', 'high', 'max']),
      },
      {
        id: 'claude-haiku-4-5',
        label: 'Claude Haiku 4.5',
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions(['low', 'medium', 'high']),
      },
    ],
    attachments: CLAUDE_CODE_ATTACHMENT_CAPABILITY,
    midRunInput: CLAUDE_CODE_MID_RUN_INPUT_CAPABILITY,
    skills: CLAUDE_CODE_SKILLS_CAPABILITY,
  }
}

export function buildFallbackCodexDescriptor(): ProviderDescriptor {
  return {
    id: 'codex',
    name: 'Codex',
    vendorLabel: 'OpenAI',
    kind: 'conversation',
    supportsContinuation: true,
    defaultModelId: 'gpt-5.4',
    fastModelId: 'gpt-5.4-mini',
    modelOptions: [
      {
        id: 'gpt-5.4',
        label: 'GPT-5.4',
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions(['minimal', 'low', 'medium', 'high']),
      },
      {
        id: 'gpt-5.4-mini',
        label: 'GPT-5.4 Mini',
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions(['low', 'medium', 'high']),
      },
      {
        id: 'gpt-5.3-codex',
        label: 'GPT-5.3 Codex',
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions(['low', 'medium', 'high', 'xhigh']),
      },
      {
        id: 'gpt-5.3-codex-spark',
        label: 'GPT-5.3 Codex Spark',
        defaultEffort: 'high',
        effortOptions: buildEffortOptions(['low', 'medium', 'high', 'xhigh']),
      },
      {
        id: 'gpt-5.2',
        label: 'GPT-5.2',
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions(['low', 'medium', 'high', 'xhigh']),
      },
    ],
    attachments: CODEX_ATTACHMENT_CAPABILITY,
    midRunInput: CODEX_MID_RUN_INPUT_CAPABILITY,
    skills: CODEX_SKILLS_CAPABILITY,
  }
}

export function buildFallbackPiDescriptor(): ProviderDescriptor {
  return {
    id: 'pi',
    name: 'Pi Agent',
    vendorLabel: 'Pi',
    kind: 'conversation',
    supportsContinuation: true,
    defaultModelId: 'default',
    modelOptions: [
      {
        id: 'default',
        label: 'Pi default',
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions([
          'none',
          'minimal',
          'low',
          'medium',
          'high',
          'xhigh',
        ]),
      },
    ],
    attachments: PI_ATTACHMENT_CAPABILITY,
    midRunInput: PI_MID_RUN_INPUT_CAPABILITY,
    skills: PI_SKILLS_CAPABILITY,
  }
}

export function normalizeProviderDescriptor(
  descriptor: ProviderDescriptor,
): ProviderDescriptor {
  const defaultModelId =
    descriptor.modelOptions.find(
      (option) => option.id === descriptor.defaultModelId,
    )?.id ??
    descriptor.modelOptions[0]?.id ??
    descriptor.defaultModelId

  return {
    ...descriptor,
    midRunInput: descriptor.midRunInput ?? NO_MID_RUN_INPUT_CAPABILITY,
    skills: descriptor.skills ?? UNSUPPORTED_SKILLS_CAPABILITY,
    defaultModelId,
    modelOptions: descriptor.modelOptions.map((option) => ({
      ...option,
      defaultEffort:
        option.effortOptions.find(
          (effort) => effort.id === option.defaultEffort,
        )?.id ??
        option.effortOptions.find((effort) => effort.id === 'medium')?.id ??
        option.effortOptions[0]?.id ??
        null,
    })),
  }
}
