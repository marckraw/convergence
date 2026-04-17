import type {
  ProviderEffortOption,
  ProviderModelOption,
  ReasoningEffort,
} from '../provider.types'
import { buildEffortOptions } from '../provider-descriptor.pure'

export interface PiModel {
  id: string
  name?: string
  provider: string
  reasoning?: boolean
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

function effortOptionsFor(model: PiModel): ProviderEffortOption[] {
  if (!model.reasoning) return []
  const ladder: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high']
  if (model.provider.toLowerCase() === 'openai') {
    ladder.push('xhigh')
  }
  return buildEffortOptions(ladder)
}

export function mapPiModel(raw: unknown): ProviderModelOption | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id : null
  const provider = typeof record.provider === 'string' ? record.provider : null
  if (!id || !provider) return null

  const name = typeof record.name === 'string' && record.name ? record.name : id
  const reasoning = record.reasoning === true

  const model: PiModel = { id, name, provider, reasoning }
  const effortOptions = effortOptionsFor(model)
  const defaultEffort: ReasoningEffort | null = effortOptions.length
    ? 'medium'
    : null

  return {
    id: `${provider}/${id}`,
    label: `${formatProviderLabel(provider)} · ${name}`,
    defaultEffort,
    effortOptions,
  }
}

export function mapPiModels(raw: unknown): ProviderModelOption[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const mapped = mapPiModel(item)
    return mapped ? [mapped] : []
  })
}

const PI_THINKING_LEVELS = new Set([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
])

export function mapEffortToPiThinking(
  effort: ReasoningEffort | null,
): string | null {
  if (!effort) return null
  if (effort === 'none') return 'off'
  if (effort === 'max') return 'high'
  return PI_THINKING_LEVELS.has(effort) ? effort : null
}
