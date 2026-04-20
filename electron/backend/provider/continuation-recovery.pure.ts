import type { TranscriptEntry } from './provider.types'

type SystemEntry = Extract<TranscriptEntry, { type: 'system' }>

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
): SystemEntry {
  return {
    type: 'system',
    text: `${providerName} continuation was no longer available. Started a new session; previous provider context may be missing.`,
    timestamp,
  }
}
