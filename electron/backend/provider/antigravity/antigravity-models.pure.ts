import type {
  ProviderEffortOption,
  ProviderModelOption,
  ReasoningEffort,
} from '../provider.types'

export interface AntigravityModelLabelMapping {
  modelId: string
  modelLabel: string
  effortId: ReasoningEffort
  effortLabel: string
  antigravityLabel: string
  isDefault: boolean
}

const TEXT_ONLY_MODALITIES: ProviderModelOption['inputModalities'] = ['text']

const DEFAULT_EFFORT_OPTION: ProviderEffortOption = {
  id: 'medium',
  label: 'Default',
}

const THINKING_EFFORT_OPTION: ProviderEffortOption = {
  id: 'high',
  label: 'Thinking',
}

export const ANTIGRAVITY_MODEL_LABEL_MAPPINGS: AntigravityModelLabelMapping[] =
  [
    {
      modelId: 'gemini-3.1-pro',
      modelLabel: 'Gemini 3.1 Pro',
      effortId: 'low',
      effortLabel: 'Low',
      antigravityLabel: 'Gemini 3.1 Pro (low)',
      isDefault: false,
    },
    {
      modelId: 'gemini-3.1-pro',
      modelLabel: 'Gemini 3.1 Pro',
      effortId: 'high',
      effortLabel: 'High',
      antigravityLabel: 'Gemini 3.1 Pro (high)',
      isDefault: true,
    },
    {
      modelId: 'gemini-3.5-flash',
      modelLabel: 'Gemini 3.5 Flash',
      effortId: 'medium',
      effortLabel: 'Default',
      antigravityLabel: 'Gemini 3.5 Flash',
      isDefault: true,
    },
    {
      modelId: 'gemini-3-flash',
      modelLabel: 'Gemini 3 Flash',
      effortId: 'medium',
      effortLabel: 'Default',
      antigravityLabel: 'Gemini 3 Flash',
      isDefault: true,
    },
    {
      modelId: 'claude-sonnet-4.6-thinking',
      modelLabel: 'Claude Sonnet 4.6',
      effortId: 'high',
      effortLabel: 'Thinking',
      antigravityLabel: 'Claude Sonnet 4.6 (Thinking)',
      isDefault: true,
    },
    {
      modelId: 'claude-opus-4.6-thinking',
      modelLabel: 'Claude Opus 4.6',
      effortId: 'high',
      effortLabel: 'Thinking',
      antigravityLabel: 'Claude Opus 4.6 (Thinking)',
      isDefault: true,
    },
    {
      modelId: 'gpt-oss-120b',
      modelLabel: 'GPT-OSS-120b',
      effortId: 'medium',
      effortLabel: 'Default',
      antigravityLabel: 'GPT-OSS-120b',
      isDefault: true,
    },
  ]

function effortOptionForMapping(
  mapping: AntigravityModelLabelMapping,
): ProviderEffortOption {
  if (mapping.effortId === 'medium' && mapping.effortLabel === 'Default') {
    return DEFAULT_EFFORT_OPTION
  }
  if (mapping.effortId === 'high' && mapping.effortLabel === 'Thinking') {
    return THINKING_EFFORT_OPTION
  }
  return { id: mapping.effortId, label: mapping.effortLabel }
}

function mappingsForModel(modelId: string): AntigravityModelLabelMapping[] {
  return ANTIGRAVITY_MODEL_LABEL_MAPPINGS.filter(
    (mapping) => mapping.modelId === modelId,
  )
}

export function resolveAntigravityModelLabel(input: {
  modelId: string | null | undefined
  effortId?: ReasoningEffort | null
}): string | null {
  const modelId = input.modelId?.trim()
  if (!modelId) return null

  const mappings = mappingsForModel(modelId)
  if (mappings.length === 0) return null

  const effortId = input.effortId ?? null
  const selected =
    (effortId
      ? mappings.find((mapping) => mapping.effortId === effortId)
      : null) ??
    mappings.find((mapping) => mapping.isDefault) ??
    mappings[0]

  return selected?.antigravityLabel ?? null
}

export function buildFallbackAntigravityModelOptions(): ProviderModelOption[] {
  const seen = new Set<string>()
  const options: ProviderModelOption[] = []

  for (const mapping of ANTIGRAVITY_MODEL_LABEL_MAPPINGS) {
    if (seen.has(mapping.modelId)) continue
    seen.add(mapping.modelId)

    const modelMappings = mappingsForModel(mapping.modelId)
    const defaultMapping =
      modelMappings.find((item) => item.isDefault) ?? modelMappings[0]

    options.push({
      id: mapping.modelId,
      label: mapping.modelLabel,
      defaultEffort: defaultMapping?.effortId ?? null,
      effortOptions: modelMappings.map(effortOptionForMapping),
      inputModalities: TEXT_ONLY_MODALITIES,
    })
  }

  return options
}
