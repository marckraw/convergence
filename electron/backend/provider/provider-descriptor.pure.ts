import type {
  ProviderAttachmentCapability,
  ProviderDescriptor,
  ProviderEffortOption,
  ReasoningEffort,
} from './provider.types'

const MB = 1024 * 1024

export const CLAUDE_CODE_ATTACHMENT_CAPABILITY: ProviderAttachmentCapability = {
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

export const PI_ATTACHMENT_CAPABILITY: ProviderAttachmentCapability = {
  supportsImage: true,
  supportsPdf: false,
  supportsText: true,
  maxImageBytes: 10 * MB,
  maxPdfBytes: 0,
  maxTextBytes: 1 * MB,
  maxTotalBytes: 50 * MB,
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
