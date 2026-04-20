import type { TranscriptEntry } from '../provider.types'

type SystemEntry = Extract<TranscriptEntry, { type: 'system' }>

function readErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function buildTurnFailureEntry(
  err: unknown,
  timestamp: string,
): SystemEntry {
  return {
    type: 'system',
    text: `Turn failed: ${readErrorMessage(err)}`,
    timestamp,
  }
}

export function isCodexThreadNotFoundError(err: unknown): boolean {
  const message = readErrorMessage(err).toLowerCase()
  return message.includes('thread') && message.includes('not found')
}

export function buildCodexThreadRecoveryEntry(timestamp: string): SystemEntry {
  return {
    type: 'system',
    text: 'Codex thread was no longer available. Started a new thread; previous provider context may be missing.',
    timestamp,
  }
}
