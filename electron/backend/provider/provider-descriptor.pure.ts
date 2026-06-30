import type {
  MidRunInputMode,
  ProviderAttachmentCapability,
  ProviderDescriptor,
  ProviderEffortOption,
  ProviderMidRunInputCapability,
  ProviderSkillsCapability,
  ReasoningEffort,
} from './provider.types'
import { buildFallbackAntigravityModelOptions } from './antigravity/antigravity-models.pure'
import {
  CURSOR_ACP_ATTACHMENT_CAPABILITY,
  CURSOR_ACP_INTERACTION_CAPABILITY,
  CURSOR_ACP_MID_RUN_INPUT_CAPABILITY,
  CURSOR_ACP_SETTINGS_INFO,
  CURSOR_ACP_SKILLS_CAPABILITY,
  CURSOR_ACP_TELEMETRY_CAPABILITY,
} from './cursor/cursor-acp-contract.pure'

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

const ANTIGRAVITY_ATTACHMENT_CAPABILITY: ProviderAttachmentCapability = {
  supportsImage: false,
  supportsPdf: false,
  supportsText: true,
  maxImageBytes: 0,
  maxPdfBytes: 0,
  maxTextBytes: 1 * MB,
  maxTotalBytes: 1 * MB,
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

const ANTIGRAVITY_SKILLS_CAPABILITY: ProviderSkillsCapability = {
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
    supportsAnswer: true,
    supportsNativeFollowUp: false,
    supportsAppQueuedFollowUp: true,
    supportsSteer: false,
    supportsInterrupt: false,
    defaultRunningMode: 'follow-up',
    notes:
      'Claude Code supports app-managed answers for deferred AskUserQuestion requests and app-managed follow-up queueing until the adapter moves to a long-lived streaming input process.',
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

const ANTIGRAVITY_MID_RUN_INPUT_CAPABILITY: ProviderMidRunInputCapability = {
  supportsAnswer: false,
  supportsNativeFollowUp: false,
  supportsAppQueuedFollowUp: true,
  supportsSteer: false,
  supportsInterrupt: false,
  defaultRunningMode: 'follow-up',
  notes:
    'Antigravity CLI print mode does not expose live tool streams or native mid-run input. Convergence can queue follow-up text for the next serialized print-mode turn.',
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
    case 'cursor':
      return CURSOR_ACP_MID_RUN_INPUT_CAPABILITY
    case 'antigravity':
      return ANTIGRAVITY_MID_RUN_INPUT_CAPABILITY
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
        id: 'best',
        label: 'Claude Best',
        description: 'Uses Fable 5 when available, otherwise the latest Opus.',
        contextWindowTokens: 1_000_000,
        defaultEffort: 'high',
        effortOptions: buildEffortOptions([
          'low',
          'medium',
          'high',
          'xhigh',
          'max',
        ]),
      },
      {
        id: 'fable',
        label: 'Claude Fable 5',
        contextWindowTokens: 1_000_000,
        defaultEffort: 'high',
        effortOptions: buildEffortOptions([
          'low',
          'medium',
          'high',
          'xhigh',
          'max',
        ]),
      },
      {
        id: 'sonnet',
        label: 'Claude Sonnet',
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions(['low', 'medium', 'high']),
      },
      {
        id: 'opus',
        label: 'Claude Opus',
        contextWindowTokens: 1_000_000,
        defaultEffort: 'high',
        effortOptions: buildEffortOptions([
          'low',
          'medium',
          'high',
          'xhigh',
          'max',
        ]),
      },
      {
        id: 'haiku',
        label: 'Claude Haiku',
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions(['low', 'medium', 'high']),
      },
      {
        id: 'claude-fable-5',
        label: 'Claude Fable 5',
        contextWindowTokens: 1_000_000,
        defaultEffort: 'high',
        effortOptions: buildEffortOptions([
          'low',
          'medium',
          'high',
          'xhigh',
          'max',
        ]),
      },
      {
        id: 'claude-sonnet-5',
        label: 'Claude Sonnet 5',
        contextWindowTokens: 1_000_000,
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions(['low', 'medium', 'high', 'max']),
      },
      {
        id: 'claude-opus-4-8',
        label: 'Claude Opus 4.8',
        contextWindowTokens: 1_000_000,
        defaultEffort: 'high',
        effortOptions: buildEffortOptions([
          'low',
          'medium',
          'high',
          'xhigh',
          'max',
        ]),
      },
      {
        id: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6',
        contextWindowTokens: 1_000_000,
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions(['low', 'medium', 'high', 'max']),
      },
      {
        id: 'claude-opus-4-7',
        label: 'Claude Opus 4.7',
        contextWindowTokens: 1_000_000,
        defaultEffort: 'high',
        effortOptions: buildEffortOptions([
          'low',
          'medium',
          'high',
          'xhigh',
          'max',
        ]),
      },
      {
        id: 'claude-opus-4-6',
        label: 'Claude Opus 4.6',
        contextWindowTokens: 1_000_000,
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
        id: 'gpt-5.5',
        label: 'GPT-5.5',
        defaultEffort: 'medium',
        effortOptions: buildEffortOptions(['minimal', 'low', 'medium', 'high']),
      },
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

export function buildFallbackCursorDescriptor(): ProviderDescriptor {
  return {
    id: 'cursor',
    name: 'Cursor',
    vendorLabel: 'Anysphere',
    kind: 'conversation',
    supportsContinuation: true,
    defaultModelId: 'default[]',
    modelOptions: [
      {
        id: 'default[]',
        label: 'Auto',
        defaultEffort: null,
        effortOptions: [],
        inputModalities: ['text', 'image'],
        source: 'provider',
      },
    ],
    attachments: CURSOR_ACP_ATTACHMENT_CAPABILITY,
    midRunInput: CURSOR_ACP_MID_RUN_INPUT_CAPABILITY,
    interactions: CURSOR_ACP_INTERACTION_CAPABILITY,
    skills: CURSOR_ACP_SKILLS_CAPABILITY,
    configOptions: [],
    telemetry: CURSOR_ACP_TELEMETRY_CAPABILITY,
    settings: CURSOR_ACP_SETTINGS_INFO,
  }
}

export function buildFallbackAntigravityDescriptor(): ProviderDescriptor {
  return {
    id: 'antigravity',
    name: 'Antigravity CLI',
    vendorLabel: 'Google',
    kind: 'conversation',
    supportsContinuation: true,
    defaultModelId: 'gemini-3.5-flash',
    fastModelId: 'gemini-3.5-flash',
    modelOptions: buildFallbackAntigravityModelOptions(),
    attachments: ANTIGRAVITY_ATTACHMENT_CAPABILITY,
    midRunInput: ANTIGRAVITY_MID_RUN_INPUT_CAPABILITY,
    skills: ANTIGRAVITY_SKILLS_CAPABILITY,
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
