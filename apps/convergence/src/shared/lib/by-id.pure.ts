/**
 * A list of records keyed by `id`, kept by the stores that hold them (spaces
 * and their attempts, project scripts and their runs). One copy, so the
 * stores agree on where a new record goes: first.
 */

/** The record replaced where it is, or put first when it's new. */
export function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  return items.some((item) => item.id === next.id)
    ? items.map((item) => (item.id === next.id ? next : item))
    : [next, ...items]
}

/** The list without the record of that id. */
export function removeById<T extends { id: string }>(
  items: T[],
  id: string,
): T[] {
  return items.filter((item) => item.id !== id)
}
