import type { SessionContextWindow } from '../provider.types'

export interface AntigravityStatusLineModel {
  id: string
  displayName: string
}

export interface AntigravityStatusLineCurrentUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
}

export interface AntigravityStatusLineContextWindow {
  totalInputTokens: number
  totalOutputTokens: number
  contextWindowSize: number
  usedPercentage: number
  remainingPercentage: number
  currentUsage: AntigravityStatusLineCurrentUsage | null
}

export interface AntigravityStatusLineSnapshot {
  conversationId: string | null
  model: AntigravityStatusLineModel | null
  product: string | null
  version: string | null
  planTier: string | null
  contextWindow: AntigravityStatusLineContextWindow | null
  agentState: string | null
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function parseModel(value: unknown): AntigravityStatusLineModel | null {
  const record = readRecord(value)
  if (!record) return null

  const id = readString(record.id)
  const displayName =
    readString(record.display_name) ?? readString(record.displayName)
  if (!id || !displayName) return null

  return { id, displayName }
}

function parseCurrentUsage(
  value: unknown,
): AntigravityStatusLineCurrentUsage | null {
  const record = readRecord(value)
  if (!record) return null

  const inputTokens = readNumber(record.input_tokens)
  const outputTokens = readNumber(record.output_tokens)
  const cacheCreationInputTokens = readNumber(
    record.cache_creation_input_tokens,
  )
  const cacheReadInputTokens = readNumber(record.cache_read_input_tokens)

  if (
    inputTokens === null ||
    outputTokens === null ||
    cacheCreationInputTokens === null ||
    cacheReadInputTokens === null
  ) {
    return null
  }

  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
  }
}

function parseContextWindow(
  value: unknown,
): AntigravityStatusLineContextWindow | null {
  const record = readRecord(value)
  if (!record) return null

  const totalInputTokens = readNumber(record.total_input_tokens)
  const totalOutputTokens = readNumber(record.total_output_tokens)
  const contextWindowSize = readNumber(record.context_window_size)
  const usedPercentage = readNumber(record.used_percentage)
  const remainingPercentage = readNumber(record.remaining_percentage)

  if (
    totalInputTokens === null ||
    totalOutputTokens === null ||
    contextWindowSize === null ||
    usedPercentage === null ||
    remainingPercentage === null
  ) {
    return null
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    contextWindowSize,
    usedPercentage: clampPercentage(usedPercentage),
    remainingPercentage: clampPercentage(remainingPercentage),
    currentUsage: parseCurrentUsage(record.current_usage),
  }
}

export function parseAntigravityStatusLinePayload(
  payload: unknown,
): AntigravityStatusLineSnapshot | null {
  const record = readRecord(payload)
  if (!record) return null

  return {
    conversationId: readString(record.conversation_id),
    model: parseModel(record.model),
    product: readString(record.product),
    version: readString(record.version),
    planTier: readString(record.plan_tier),
    contextWindow: parseContextWindow(record.context_window),
    agentState: readString(record.agent_state),
  }
}

export function parseAntigravityStatusLineJson(
  line: string,
): AntigravityStatusLineSnapshot | null {
  try {
    return parseAntigravityStatusLinePayload(JSON.parse(line))
  } catch {
    return null
  }
}

export function mapAntigravityContextWindow(
  contextWindow: AntigravityStatusLineContextWindow | null,
): SessionContextWindow {
  if (!contextWindow) {
    return {
      availability: 'unavailable',
      source: 'provider',
      reason:
        'Antigravity status-line telemetry did not include context window data.',
    }
  }

  if (contextWindow.contextWindowSize <= 0) {
    return {
      availability: 'unavailable',
      source: 'provider',
      reason: 'Antigravity reported an invalid context window size.',
    }
  }

  return {
    availability: 'available',
    source: 'provider',
    usedTokens:
      contextWindow.totalInputTokens + contextWindow.totalOutputTokens,
    windowTokens: contextWindow.contextWindowSize,
    usedPercentage: contextWindow.usedPercentage,
    remainingPercentage: contextWindow.remainingPercentage,
  }
}
