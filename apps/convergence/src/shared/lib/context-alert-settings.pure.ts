/**
 * The context alert's threshold, as one shape both processes read (MAR-3250).
 *
 * Lives in `shared` rather than in either App Settings copy for the reason
 * `keyboard-shortcut.pure.ts` does: the main process parses the stored blob and
 * the renderer decides what is over the line, so a second declaration of the
 * same three fields would agree only until one of them changed.
 */
export interface ContextAlertSettings {
  enabled: boolean
  /** Percent of the window used, 1-99, at which the alert fires. */
  percent: number
  /**
   * Tokens used at which the alert fires, or null for "no absolute cap".
   *
   * Null is a real choice, not a missing value: 75 % of a 1M window is 750k
   * tokens on every message, which is why the cap exists at all, and someone
   * who does not want one must be able to say so.
   */
  tokens: number | null
}

export const DEFAULT_CONTEXT_ALERT: ContextAlertSettings = {
  enabled: true,
  percent: 75,
  tokens: 400000,
}

/** Below this a token cap would fire on a conversation that has barely begun. */
const MIN_TOKEN_CAP = 1000

/**
 * Repairs a stored context alert field by field.
 *
 * Each field falls back on its own, because a blob written by an older build
 * carries the fields it knew and nothing about the ones it did not: taking the
 * whole group back to the defaults because one number is broken would silently
 * discard a threshold the user did choose.
 */
export function parseContextAlertSettings(
  value: unknown,
): ContextAlertSettings {
  if (!value || typeof value !== 'object') return DEFAULT_CONTEXT_ALERT
  const raw = value as Partial<ContextAlertSettings>

  const percent =
    typeof raw.percent === 'number' &&
    Number.isFinite(raw.percent) &&
    raw.percent >= 1 &&
    raw.percent <= 99
      ? Math.round(raw.percent)
      : DEFAULT_CONTEXT_ALERT.percent

  // `null` is parsed before the number check, because it is the one non-number
  // that means something rather than nothing.
  const tokens =
    raw.tokens === null
      ? null
      : typeof raw.tokens === 'number' &&
          Number.isFinite(raw.tokens) &&
          raw.tokens >= MIN_TOKEN_CAP
        ? Math.round(raw.tokens)
        : DEFAULT_CONTEXT_ALERT.tokens

  return {
    enabled:
      typeof raw.enabled === 'boolean'
        ? raw.enabled
        : DEFAULT_CONTEXT_ALERT.enabled,
    percent,
    tokens,
  }
}

/**
 * The token cap as a person says it: 400000 -> "400k".
 *
 * Shared because two surfaces in two different features name the same cap --
 * the dot's popover and the alert toast -- and a number written "400k" in one
 * place and "400000" in the other reads as two different limits.
 */
export function formatTokenCap(tokens: number): string {
  if (tokens < 1000) return `${tokens}`
  const thousands = tokens / 1000
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`
}
