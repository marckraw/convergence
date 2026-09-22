import type { ContextAlertSettings } from './context-alert-settings.pure'
import type { SessionContextWindow } from '../types/electron-api'

export type ContextAlertReading =
  | { over: false }
  | { over: true; by: 'percent' | 'tokens' }

/**
 * Whether a conversation has passed the threshold Marcin set (MAR-3250).
 *
 * The one predicate every surface shares: the dot's colour, the toast's
 * crossing map and the popover's wording all ask this function, so there is no
 * second place where "over" could be spelled differently and the dot could
 * disagree with the toast.
 *
 * Both limits are live at once and the first one crossed wins, because percent
 * and tokens answer different questions: 75 % of a 200k window is a
 * conversation nearly full, and 75 % of a 1M window is 750k tokens paid for on
 * every single message.
 */
export function readContextAlert(
  contextWindow: SessionContextWindow | null | undefined,
  alert: ContextAlertSettings,
): ContextAlertReading {
  if (!alert.enabled) return { over: false }
  // A provider that reports no usage (Cursor today) is never over: there is no
  // figure to be over, and guessing one would colour a dot and raise a toast
  // about a number nobody measured.
  if (!contextWindow || contextWindow.availability === 'unavailable') {
    return { over: false }
  }

  const overTokens =
    alert.tokens !== null && contextWindow.usedTokens >= alert.tokens
  const overPercent = contextWindow.usedPercentage >= alert.percent

  if (!overTokens && !overPercent) return { over: false }
  if (overTokens && !overPercent) return { over: true, by: 'tokens' }
  if (overPercent && !overTokens) return { over: true, by: 'percent' }

  // Both limits are behind us, so the answer is which one this window reached
  // first: the token cap expressed as a share of this window, against the
  // percent. On a 1M window a 400k cap is 40 %, so tokens came first; on a
  // 200k window the same cap is 200 %, so the percent did.
  const tokensAsPercent =
    alert.tokens !== null && contextWindow.windowTokens > 0
      ? (alert.tokens / contextWindow.windowTokens) * 100
      : Number.POSITIVE_INFINITY
  return {
    over: true,
    by: tokensAsPercent <= alert.percent ? 'tokens' : 'percent',
  }
}
