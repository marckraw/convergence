import type { SessionContextWindow } from '../provider.types'

export type PiStopReason = 'stop' | 'length' | 'toolUse' | 'aborted' | 'error'

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizePercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function derivePiContextWindow(
  data: unknown,
): SessionContextWindow | null {
  if (!data || typeof data !== 'object') return null
  const record = data as { contextUsage?: unknown }
  const usage = record.contextUsage
  if (!usage || typeof usage !== 'object') return null

  const usageRecord = usage as {
    tokens?: unknown
    contextWindow?: unknown
    percent?: unknown
  }

  const tokens = readNumber(usageRecord.tokens)
  const windowTokens = readNumber(usageRecord.contextWindow)
  if (tokens === null || windowTokens === null || windowTokens <= 0) {
    return null
  }

  const rawPercent = readNumber(usageRecord.percent)
  const usedPercentage =
    rawPercent !== null
      ? normalizePercentage(rawPercent)
      : normalizePercentage((tokens / windowTokens) * 100)

  return {
    availability: 'available',
    source: 'provider',
    usedTokens: Math.max(0, Math.min(windowTokens, tokens)),
    windowTokens,
    usedPercentage,
    remainingPercentage: normalizePercentage(100 - usedPercentage),
  }
}

export function extractToolResultText(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  const record = result as { content?: unknown }
  const content = record.content
  if (!Array.isArray(content)) return ''

  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const itemRec = item as { type?: unknown; text?: unknown }
      if (itemRec.type === 'text' && typeof itemRec.text === 'string') {
        return itemRec.text
      }
      return null
    })
    .filter((text): text is string => text !== null)
    .join('\n')
}

export function extractLastAssistantStopReason(
  event: unknown,
): PiStopReason | null {
  if (!event || typeof event !== 'object') return null
  const record = event as { messages?: unknown }
  const messages = record.messages
  if (!Array.isArray(messages)) return null

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg || typeof msg !== 'object') continue
    const msgRec = msg as { role?: unknown; stopReason?: unknown }
    if (msgRec.role !== 'assistant') continue

    const reason = msgRec.stopReason
    if (
      reason === 'stop' ||
      reason === 'length' ||
      reason === 'toolUse' ||
      reason === 'aborted' ||
      reason === 'error'
    ) {
      return reason
    }
    return null
  }

  return null
}

export function extractToolCallFromEnd(event: unknown): {
  id: string | null
  name: string
  input: string
} {
  const record =
    event && typeof event === 'object' ? (event as Record<string, unknown>) : {}
  const tc =
    record.toolCall && typeof record.toolCall === 'object'
      ? (record.toolCall as {
          id?: unknown
          name?: unknown
          arguments?: unknown
        })
      : null

  const id =
    tc && typeof tc.id === 'string'
      ? tc.id
      : typeof record.toolCallId === 'string'
        ? record.toolCallId
        : null
  const name = tc && typeof tc.name === 'string' ? tc.name : 'tool'

  let input = ''
  if (tc && 'arguments' in tc && tc.arguments !== undefined) {
    input =
      typeof tc.arguments === 'string'
        ? tc.arguments
        : JSON.stringify(tc.arguments)
  }

  return { id, name, input }
}
