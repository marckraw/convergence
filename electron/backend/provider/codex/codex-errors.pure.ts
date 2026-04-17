import type { TranscriptEntry } from '../provider.types'

type SystemEntry = Extract<TranscriptEntry, { type: 'system' }>

export function buildTurnFailureEntry(
  err: unknown,
  timestamp: string,
): SystemEntry {
  const message = err instanceof Error ? err.message : String(err)
  return {
    type: 'system',
    text: `Turn failed: ${message}`,
    timestamp,
  }
}
