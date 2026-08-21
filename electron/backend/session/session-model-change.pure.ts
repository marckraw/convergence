/**
 * The words and the wire tag for a session changing model between turns
 * (MAR-2551, riding MAR-2550).
 *
 * Once a conversation can swap model mid-flight — Fable until the quota runs
 * out, then Opus, in the same transcript — scrolling back a week gives no way
 * to tell which answer came from which. The difference is usually the whole
 * reason the switch happened.
 *
 * The mechanism is run 20's (`provider/session-restart.pure.ts`): one literal
 * the renderer matches on, named once here rather than spelled out on both
 * sides of the tree boundary.
 */
export const MODEL_CHANGED_EVENT_TYPE = 'session.model-changed'

interface ModelSelectionSnapshot {
  model: string | null
  effort: string | null
}

function describeModel(model: string | null): string {
  return model ?? "the provider's default"
}

/**
 * What to write in the transcript when a session's model selection moves, or
 * `null` when there is nothing a reader would need to know.
 *
 * Returns `null` unless the **model** changed. An effort-only change alters how
 * hard the same author thinks rather than who the author is, and it is already
 * recorded per turn; drawing a boundary for it would make a long session that
 * nudges effort read as a session that keeps changing hands.
 */
export function describeModelChange(
  previous: ModelSelectionSnapshot,
  next: ModelSelectionSnapshot,
): string | null {
  if (previous.model === next.model) return null

  const from = describeModel(previous.model)
  const to = describeModel(next.model)
  const effortSuffix =
    previous.effort !== next.effort && next.effort
      ? `, effort ${previous.effort ?? 'default'} → ${next.effort}`
      : ''

  return (
    `Model changed — ${from} → ${to}${effortSuffix}. Everything above this ` +
    `point was written by ${from}; everything below runs on ${to}.`
  )
}
