import type { SessionContextWindow } from './provider.types'

interface CodexTokenUsageBreakdown {
  inputTokens?: unknown
  cachedInputTokens?: unknown
}

interface CodexThreadTokenUsage {
  last?: CodexTokenUsageBreakdown | null
  modelContextWindow?: unknown
}

interface ClaudeContextWindowRecord {
  used_percentage?: unknown
  remaining_percentage?: unknown
  window_size?: unknown
  window_size_tokens?: unknown
  used_tokens?: unknown
}

interface ClaudeUsageRecord {
  input_tokens?: unknown
  cache_creation_input_tokens?: unknown
  cache_read_input_tokens?: unknown
}

function normalizePercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  return null
}

function deriveClaudeModelContextWindow(
  model: string | null | undefined,
): number | null {
  if (!model) {
    return null
  }

  const normalized = model.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  // Claude Code standard models use the 200k context tier unless an explicit
  // long-context beta is enabled, which Convergence does not manage in v1.
  if (
    normalized.includes('sonnet') ||
    normalized.includes('opus') ||
    normalized.includes('haiku')
  ) {
    return 200_000
  }

  return null
}

export function deriveCodexContextWindow(
  tokenUsage: CodexThreadTokenUsage,
): SessionContextWindow | null {
  const windowTokens = readNumber(tokenUsage.modelContextWindow)
  const inputTokens = readNumber(tokenUsage.last?.inputTokens)
  const cachedInputTokens = readNumber(tokenUsage.last?.cachedInputTokens) ?? 0

  if (!windowTokens || inputTokens === null) {
    return null
  }

  const usedTokens = Math.max(
    0,
    Math.min(windowTokens, inputTokens + cachedInputTokens),
  )
  const usedPercentage = normalizePercentage((usedTokens / windowTokens) * 100)

  return {
    availability: 'available',
    source: 'provider',
    usedTokens,
    windowTokens,
    usedPercentage,
    remainingPercentage: normalizePercentage(100 - usedPercentage),
  }
}

export function deriveClaudeContextWindow(
  value: unknown,
): SessionContextWindow | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as { context_window?: ClaudeContextWindowRecord | null }
  const contextWindow = record.context_window
  if (!contextWindow || typeof contextWindow !== 'object') {
    return null
  }

  const usedPercentage = readNumber(contextWindow.used_percentage)
  const remainingPercentage = readNumber(contextWindow.remaining_percentage)
  const usedTokens = readNumber(contextWindow.used_tokens)
  const windowTokens =
    readNumber(contextWindow.window_size_tokens) ??
    readNumber(contextWindow.window_size)

  if (
    usedPercentage === null ||
    remainingPercentage === null ||
    usedTokens === null ||
    windowTokens === null
  ) {
    return null
  }

  return {
    availability: 'available',
    source: 'provider',
    usedTokens,
    windowTokens,
    usedPercentage: normalizePercentage(usedPercentage),
    remainingPercentage: normalizePercentage(remainingPercentage),
  }
}

export function deriveClaudeEstimatedContextWindow(
  value: unknown,
  fallbackModel: string | null | undefined,
): SessionContextWindow | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as {
    message?: { usage?: ClaudeUsageRecord | null; model?: unknown } | null
    usage?: ClaudeUsageRecord | null
    model?: unknown
  }

  const usage = record.message?.usage ?? record.usage
  if (!usage || typeof usage !== 'object') {
    return null
  }

  const inputTokens = readNumber(usage.input_tokens) ?? 0
  const cacheCreationInputTokens =
    readNumber(usage.cache_creation_input_tokens) ?? 0
  const cacheReadInputTokens = readNumber(usage.cache_read_input_tokens) ?? 0

  const usedTokens =
    inputTokens + cacheCreationInputTokens + cacheReadInputTokens
  if (usedTokens <= 0) {
    return null
  }

  const messageModel =
    typeof record.message?.model === 'string' ? record.message.model : null
  const rootModel = typeof record.model === 'string' ? record.model : null
  const windowTokens = deriveClaudeModelContextWindow(
    messageModel ?? rootModel ?? fallbackModel,
  )

  if (!windowTokens) {
    return null
  }

  const clampedUsedTokens = Math.max(0, Math.min(windowTokens, usedTokens))
  const usedPercentage = normalizePercentage(
    (clampedUsedTokens / windowTokens) * 100,
  )

  return {
    availability: 'available',
    source: 'estimated',
    usedTokens: clampedUsedTokens,
    windowTokens,
    usedPercentage,
    remainingPercentage: normalizePercentage(100 - usedPercentage),
  }
}

export function createUnavailableContextWindow(
  reason: string,
): SessionContextWindow {
  return {
    availability: 'unavailable',
    source: 'provider',
    reason,
  }
}
