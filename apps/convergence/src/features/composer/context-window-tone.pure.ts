import { readContextAlert, type SessionContextWindow } from '@/entities/session'
import {
  formatTokenCap,
  type ContextAlertSettings,
} from '@/shared/lib/context-alert-settings.pure'

export type ContextWindowTone = 'green' | 'amber' | 'red' | 'muted'

/**
 * What colour the context dot is (MAR-3250).
 *
 * Red is still the provider's own "nearly out of room" figure, untouched.
 * Amber is now the threshold Marcin set, so the one place that decides whether
 * a conversation is over the line is `readContextAlert` -- the dot cannot
 * disagree with the toast about it.
 *
 * With the alert switched off, amber falls back to the fixed 35 %-remaining
 * mark it used before the setting existed: switching the alert off asks for
 * the old behaviour back, not for the amber band to disappear.
 */
export function getContextTone(
  contextWindow: SessionContextWindow | null | undefined,
  alert: ContextAlertSettings,
): ContextWindowTone {
  if (!contextWindow || contextWindow.availability === 'unavailable') {
    return 'muted'
  }

  // Red outranks amber: a conversation that is both over the threshold and
  // nearly out of room is the more urgent of the two facts.
  if (contextWindow.remainingPercentage <= 15) return 'red'
  if (alert.enabled) {
    return readContextAlert(contextWindow, alert).over ? 'amber' : 'green'
  }
  return contextWindow.remainingPercentage <= 35 ? 'amber' : 'green'
}

/**
 * The popover's one extra line when a conversation is over the threshold, or
 * null when it is not. Named by the limit that was reached first, so the line
 * says which of the two numbers to change if it fired too early.
 */
export function describeContextAlert(
  contextWindow: SessionContextWindow | null | undefined,
  alert: ContextAlertSettings,
): string | null {
  const reading = readContextAlert(contextWindow, alert)
  if (!reading.over) return null
  return reading.by === 'tokens' && alert.tokens !== null
    ? `Over your alert threshold (${formatTokenCap(alert.tokens)} tokens)`
    : `Over your alert threshold (${alert.percent} %)`
}
