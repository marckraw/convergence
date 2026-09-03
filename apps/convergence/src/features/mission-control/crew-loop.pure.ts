/**
 * What a crew's loop knobs mean when nobody has turned them.
 *
 * **These numbers cross the tree boundary.** The engine resolves them in
 * `electron/backend/relay/relay.pure.ts` (`DEFAULT_CREW_ROUND_CAP`) and
 * `electron/backend/relay/crew-hail.pure.ts` (`DEFAULT_CREW_STALL_MINUTES`);
 * the renderer shows them as the placeholder in an empty box, because a
 * renderer cannot import from `electron/`.
 *
 * A test on each side pins its own literal, and that alone is NOT an
 * agreement: editing one side together with its own assertion leaves every
 * suite green while the other side still promises the old number. What holds
 * them together is one canary that reads both trees at once --
 * `electron/backend/relay/cross-tree-agreement.test.ts`. Anything new that
 * crosses this boundary belongs in it.
 *
 * A placeholder is the whole reason the renderer needs them. An empty field
 * that silently meant twelve would be a setting nobody could read.
 */
export const DEFAULT_CREW_ROUND_CAP = 12
export const DEFAULT_CREW_STALL_MINUTES = 30

/**
 * The convention a wire's condition is pre-filled with.
 *
 * **This literal crosses the tree boundary.** The engine reads it in
 * `electron/backend/relay/relay.pure.ts` (`BATON_KEYWORD`, `readEmittedBaton`);
 * the renderer writes it here, because a renderer cannot import from
 * `electron/`.
 *
 * Lowercased and trimmed on the way in, because the backend matches
 * case-insensitively on a collapsed line and a suggestion that looked
 * different from what stores would read as a second convention.
 *
 * It lives in this file rather than beside the sentence it appears in for one
 * structural reason: this file imports nothing, so the barrier that pins the
 * crossing (`electron/backend/relay/cross-tree-agreement.test.ts`) can read it
 * from the other tree without dragging the renderer's aliases across.
 */
export function batonConditionToken(batonName: string): string {
  return `BATON: ${batonName.trim().toLowerCase()}`
}

/**
 * What an unset knob reads as. Says the number rather than the word "default",
 * because "default" is the one answer that does not tell you anything.
 */
export function formatCrewLoopDefault(value: number, unit: string): string {
  return `${value} ${unit}`
}
