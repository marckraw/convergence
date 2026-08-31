export interface ProviderNoteDraft {
  text: string
  level: 'info' | 'warning' | 'error'
  timestamp: string
}

function readErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function isMissingContinuationError(
  err: unknown,
  continuationTerms: string[],
): boolean {
  const message = readErrorMessage(err).toLowerCase()
  const missingTerms = [
    'not found',
    'no such',
    'missing',
    'does not exist',
    'unknown',
    'invalid',
    'unable to resume',
    'cannot resume',
  ]

  return (
    continuationTerms.some((term) => message.includes(term.toLowerCase())) &&
    missingTerms.some((term) => message.includes(term))
  )
}

export function buildContinuationRecoveryEntry(
  providerName: string,
  timestamp: string,
): ProviderNoteDraft {
  return {
    text: `${providerName} continuation was no longer available. Started a new session; previous provider context may be missing.`,
    level: 'warning',
    timestamp,
  }
}
