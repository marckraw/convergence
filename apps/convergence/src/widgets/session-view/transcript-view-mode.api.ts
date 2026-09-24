/**
 * How a conversation is drawn (MAR-3391 R5): Compact folds runs of tool
 * calls into work blocks; Full draws every entry as it always was. A view
 * preference only, remembered per conversation in this window's storage.
 */
export type TranscriptViewMode = 'compact' | 'full'

export const DEFAULT_TRANSCRIPT_VIEW_MODE: TranscriptViewMode = 'compact'

const STORAGE_PREFIX = 'convergence-transcript-view:'

/** Anything this build does not know reads as the default, Compact. */
export function parseTranscriptViewMode(
  raw: string | null,
): TranscriptViewMode {
  return raw === 'full'
    ? 'full'
    : raw === 'compact'
      ? 'compact'
      : DEFAULT_TRANSCRIPT_VIEW_MODE
}

export function loadTranscriptViewMode(sessionId: string): TranscriptViewMode {
  try {
    return parseTranscriptViewMode(
      localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`),
    )
  } catch {
    return DEFAULT_TRANSCRIPT_VIEW_MODE
  }
}

export function saveTranscriptViewMode(
  sessionId: string,
  mode: TranscriptViewMode,
): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${sessionId}`, mode)
  } catch {
    // localStorage not available; the conversation opens Compact next time.
  }
}
