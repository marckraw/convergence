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
 * The floor under a run's hop ceiling (R1/R2, MAR-2966).
 *
 * **This number crosses the tree boundary too**, for the same reason and under
 * the same barrier as the two above: the engine owns it in
 * `electron/backend/relay/relay.pure.ts` (`MIN_FLOW_RUN_HOP_CEILING`), the
 * renderer cannot import from `electron/`, and
 * `electron/backend/relay/cross-tree-agreement.test.ts` is what makes the two
 * halves an agreement rather than two literals.
 *
 * The renderer needs it because the settings panel must say what the ceiling
 * ACTUALLY is. A crew under the floor has a delivery limit that is not its
 * ceiling, and a note that claimed otherwise would blur the one distinction
 * the two guards exist for: the limit hails, the ceiling disarms.
 */
export const MIN_FLOW_RUN_HOP_CEILING = 20

/** The engine's derivation, mirrored: `Math.max` of the floor and the cap. */
export function flowRunCeiling(roundCap: number): number {
  return Math.max(MIN_FLOW_RUN_HOP_CEILING, roundCap)
}

/**
 * What the delivery limit box says about the run's hard ceiling (R3).
 *
 * Two sentences because there are two truths. At or above the floor the crew's
 * stated limit IS the ceiling, and saying so is the whole point of MAR-2966.
 * Below it the ceiling is the floor, and the honest sentence names the number
 * rather than letting the box imply that twelve deliveries switch a wire off --
 * they do not; they hail, and the wire stays armed.
 */
export function flowRunCeilingNote(deliveryLimit: number): string {
  const ceiling = flowRunCeiling(deliveryLimit)
  return ceiling === deliveryLimit
    ? "This is also the run's hard ceiling: past it the wire is disarmed."
    : `Past ${ceiling} deliveries in one run the wire is disarmed, whatever this says.`
}

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

/**
 * The sentence a refused baton rename shows under the field.
 *
 * The door that refuses a name throws in the MAIN process, and Electron hands
 * the renderer its own plumbing wrapped around it:
 * `Error invoking remote method 'crew:setMemberBatonName': Error: <sentence>`.
 * Nobody typing a name should have to read that, so the last `Error: ` is
 * where the sentence starts. Anything that does not look like a wrapped throw
 * is shown whole rather than guessed at, and a throw with nothing to say
 * still gets a sentence -- a refusal nobody can read is the swallow this
 * exists to end, one layer further down.
 */
export function batonNameRefusal(error: unknown): string {
  const raw = error instanceof Error ? error.message : ''
  const marker = 'Error: '
  const at = raw.lastIndexOf(marker)
  const sentence = (at === -1 ? raw : raw.slice(at + marker.length)).trim()
  return sentence.length > 0 ? sentence : 'That baton name was refused.'
}
