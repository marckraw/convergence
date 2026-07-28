import type {
  ProviderEffortOption,
  ProviderInputModality,
  ProviderModelOption,
  ReasoningEffort,
} from '../provider.types'
import { buildEffortOptions } from '../provider-descriptor.pure'

export interface PiModel {
  id: string
  name?: string
  provider: string
  reasoning?: boolean
  inputModalities?: ProviderInputModality[]
  /**
   * Per-model thinking gating, exactly as pi ships it in
   * `get_available_models`. A level mapped to `null` is unsupported; `xhigh`
   * and `max` are only available when the model maps them at all.
   */
  thinkingLevelMap?: Record<string, string | null> | null
}

const VENDOR_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  gemini: 'Google',
  groq: 'Groq',
  cerebras: 'Cerebras',
  xai: 'xAI',
  openrouter: 'OpenRouter',
  mistral: 'Mistral',
  minimax: 'MiniMax',
  opencode: 'OpenCode',
  kimi: 'Kimi',
  azure: 'Azure OpenAI',
  bedrock: 'Amazon Bedrock',
  'ai-gateway': 'Vercel AI Gateway',
  zai: 'Z.AI',
  ollama: 'Ollama',
}

function formatProviderLabel(provider: string): string {
  return (
    VENDOR_LABELS[provider.toLowerCase()] ??
    provider.charAt(0).toUpperCase() + provider.slice(1)
  )
}

/**
 * Pi's own thinking ladder, in pi's order. `off` is pi's name for our `none`;
 * every other level is shared verbatim.
 */
const PI_THINKING_LADDER: Array<{ level: string; effort: ReasoningEffort }> = [
  { level: 'off', effort: 'none' },
  { level: 'minimal', effort: 'minimal' },
  { level: 'low', effort: 'low' },
  { level: 'medium', effort: 'medium' },
  { level: 'high', effort: 'high' },
  { level: 'xhigh', effort: 'xhigh' },
  { level: 'max', effort: 'max' },
]

/**
 * Mirrors pi's `getSupportedThinkingLevels(model)` — the same function that
 * backs the `get_available_thinking_levels` RPC — against the
 * `thinkingLevelMap` pi already ships with every model in
 * `get_available_models`. Deriving it here keeps the ladder per-model without
 * paying an RPC round trip (and a model switch) per catalog entry.
 */
function effortsFromThinkingLevelMap(
  thinkingLevelMap: Record<string, string | null>,
): ReasoningEffort[] {
  return PI_THINKING_LADDER.filter(({ level }) => {
    const mapped = thinkingLevelMap[level]
    if (mapped === null) return false
    if (level === 'xhigh' || level === 'max') return mapped !== undefined
    return true
  }).map(({ effort }) => effort)
}

/**
 * Only reached for pi builds (or custom models) that predate per-model
 * thinking gating and therefore ship no `thinkingLevelMap`.
 */
function heuristicEfforts(model: PiModel): ReasoningEffort[] {
  const ladder: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high']
  if (model.provider.toLowerCase() === 'openai') {
    ladder.push('xhigh')
  }
  return ladder
}

function effortOptionsFor(model: PiModel): ProviderEffortOption[] {
  if (!model.reasoning) return []

  const ladder =
    model.thinkingLevelMap && typeof model.thinkingLevelMap === 'object'
      ? effortsFromThinkingLevelMap(model.thinkingLevelMap)
      : heuristicEfforts(model)

  return buildEffortOptions(ladder)
}

function parseThinkingLevelMap(
  raw: unknown,
): Record<string, string | null> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined

  const parsed: Record<string, string | null> = {}
  for (const [level, mapped] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (mapped === null || typeof mapped === 'string') {
      parsed[level] = mapped
    }
  }
  return parsed
}

function parseInputModalities(
  raw: unknown,
): ProviderInputModality[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const modalities = raw.filter(
    (item): item is ProviderInputModality =>
      item === 'text' || item === 'image',
  )
  return modalities.length > 0 ? [...new Set(modalities)] : undefined
}

export function collectPiModelsJsonModelIds(raw: unknown): Set<string> {
  const ids = new Set<string>()
  if (!raw || typeof raw !== 'object') return ids

  const providers = (raw as { providers?: unknown }).providers
  if (!providers || typeof providers !== 'object') return ids

  for (const [providerId, providerConfig] of Object.entries(
    providers as Record<string, unknown>,
  )) {
    if (!providerConfig || typeof providerConfig !== 'object') continue
    const models = (providerConfig as { models?: unknown }).models
    if (!Array.isArray(models)) continue

    for (const model of models) {
      if (!model || typeof model !== 'object') continue
      const id = (model as { id?: unknown }).id
      if (typeof id === 'string' && id.length > 0) {
        ids.add(`${providerId}/${id}`)
      }
    }
  }

  return ids
}

export function mapPiModel(
  raw: unknown,
  modelsJsonModelIds: Set<string> = new Set(),
): ProviderModelOption | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id : null
  const provider = typeof record.provider === 'string' ? record.provider : null
  if (!id || !provider) return null

  const name = typeof record.name === 'string' && record.name ? record.name : id
  const reasoning = record.reasoning === true
  const inputModalities = parseInputModalities(record.input)

  const model: PiModel = {
    id,
    name,
    provider,
    reasoning,
    inputModalities,
    thinkingLevelMap: parseThinkingLevelMap(record.thinkingLevelMap),
  }
  const effortOptions = effortOptionsFor(model)
  const defaultEffort: ReasoningEffort | null = effortOptions.length
    ? (effortOptions.find((option) => option.id === 'medium')?.id ??
      effortOptions[0]!.id)
    : null

  return {
    id: `${provider}/${id}`,
    label: `${formatProviderLabel(provider)} · ${name}`,
    defaultEffort,
    effortOptions,
    inputModalities,
    source: modelsJsonModelIds.has(`${provider}/${id}`)
      ? 'pi-models-json'
      : 'provider',
  }
}

export function mapPiModels(
  raw: unknown,
  modelsJsonModelIds: Set<string> = new Set(),
): ProviderModelOption[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const mapped = mapPiModel(item, modelsJsonModelIds)
    return mapped ? [mapped] : []
  })
}

export function mapPiModelsJsonFallbackModels(
  modelsJsonModelIds: Set<string>,
): ProviderModelOption[] {
  return [...modelsJsonModelIds].flatMap((modelId) => {
    const separatorIndex = modelId.indexOf('/')
    if (separatorIndex <= 0 || separatorIndex === modelId.length - 1) {
      return []
    }

    const provider = modelId.slice(0, separatorIndex)
    const id = modelId.slice(separatorIndex + 1)
    return [
      {
        id: modelId,
        label: `${formatProviderLabel(provider)} · ${id}`,
        defaultEffort: null,
        effortOptions: [],
        source: 'pi-models-json',
      },
    ]
  })
}

const PI_THINKING_LEVELS = new Set(PI_THINKING_LADDER.map(({ level }) => level))

/**
 * Pass-through: pi's thinking levels are our effort ids, except that pi spells
 * "no thinking" as `off`. `max` is a real pi level, so it is never clamped —
 * pi itself narrows a level the selected model cannot serve.
 */
export function mapEffortToPiThinking(
  effort: ReasoningEffort | null,
): string | null {
  if (!effort) return null
  if (effort === 'none') return 'off'
  return PI_THINKING_LEVELS.has(effort) ? effort : null
}
