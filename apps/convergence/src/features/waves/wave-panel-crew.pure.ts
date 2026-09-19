/**
 * Which crew Loom shows (MAR-3225).
 *
 * Loom is one crew's loom: two bound crews are two unrelated projects, and a
 * union of their rows is a sum nobody asked for. The choice is a crew id,
 * remembered between runs like the sheet, the mode and the width.
 */

/** One crew a person can pick, in crew order. */
export interface LoomCrewOption {
  id: string
  name: string
}

/**
 * Reads a stored crew id. Anything that is not a non-empty string is "no
 * choice yet" -- resolving it to a crew is `resolveLoomCrew`'s job, because
 * only it knows which crews are bound right now.
 */
export function parseLoomCrew(raw: string | null): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

export function serializeLoomCrew(crewId: string): string {
  return crewId
}

/**
 * The crew on screen (MAR-3225 R2): the stored choice while it is still
 * bound, otherwise the first bound crew in crew order, and `null` only when
 * nothing is bound (the column is not mounted then).
 *
 * A stored id outlives its crew -- deleted, or unbound from its tracker --
 * and trusting it would leave Loom showing an empty board for a crew that is
 * not there. The stored value is NOT rewritten: a crew that is bound again
 * (or one the store has not loaded yet) is still the person's choice.
 */
export function resolveLoomCrew(
  stored: string | null,
  boundCrewIds: readonly string[],
): string | null {
  if (stored !== null && boundCrewIds.includes(stored)) return stored
  return boundCrewIds[0] ?? null
}

/**
 * Whether there is a choice to make (MAR-3225 R3). One bound crew is a name,
 * not a control: a picker with one entry is furniture.
 */
export function loomCrewHasChoice(options: readonly LoomCrewOption[]): boolean {
  return options.length > 1
}
