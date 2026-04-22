export interface CodexNoteDraft {
  text: string
  level: 'info' | 'warning' | 'error'
  timestamp: string
}

function readErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function buildTurnFailureEntry(
  err: unknown,
  timestamp: string,
): CodexNoteDraft {
  return {
    text: `Turn failed: ${readErrorMessage(err)}`,
    level: 'error',
    timestamp,
  }
}

export function isCodexThreadNotFoundError(err: unknown): boolean {
  const message = readErrorMessage(err).toLowerCase()
  return message.includes('thread') && message.includes('not found')
}

export function buildCodexThreadRecoveryEntry(
  timestamp: string,
): CodexNoteDraft {
  return {
    text: 'Codex thread was no longer available. Started a new thread; previous provider context may be missing.',
    level: 'warning',
    timestamp,
  }
}
