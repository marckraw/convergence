/**
 * The one execution host that is not an Endpoint: this machine (MAR-2620).
 *
 * Every other value a session's `executionHost` can hold is an Endpoint id, so
 * `'local'` is the only literal anything may compare against — the string
 * `'remote'` named a single daemon back when there could only be one, and
 * cannot name which of several. The backend constant of the same name mirrors
 * this one across the process boundary.
 *
 * It lives here, in the one place the renderer and the main process genuinely
 * share code, because the predicate below reads it and both of them call that.
 */
export const LOCAL_EXECUTION_HOST_ID = 'local'

/**
 * Whether a live request names this machine (MAR-2682).
 *
 * The rule, in one place, for every door an execution host id arrives at from
 * a caller. Exactly four values mean this machine: `undefined`, `null`, the
 * empty string, and the exact string `'local'`. A caller that has not been
 * taught about Endpoints says nothing and keeps getting exactly what it got
 * before they existed.
 *
 * Everything else is a value the caller *means*: an Endpoint id, to be
 * validated or refused by name. That includes `'   '` — whitespace is a value,
 * not an absence — and it includes anything that is not a string at all, which
 * is what a wire can deliver whatever the type annotation claims.
 *
 * Deliberately not `isLocalExecutionHost` and not `parseExecutionHostId`: those
 * read a *record*, where a blank column is a row written before Endpoints
 * existed and does mean this machine. This is the other question, and the two
 * answers differ on exactly the values that get a machine answered for about a
 * question asked of another one.
 *
 * One exported predicate rather than the rule written at each door, because
 * writing it twice is precisely how this went wrong: the renderer door and the
 * main-process door drifted three times running, and each repair fixed the door
 * that had been named. Widening one alone is now not something the code can
 * express.
 */
export function namesThisMachine(executionHostId: unknown): boolean {
  return (
    executionHostId === undefined ||
    executionHostId === null ||
    executionHostId === '' ||
    executionHostId === LOCAL_EXECUTION_HOST_ID
  )
}
