/** The id of a Listbox's row, which the field's aria-activedescendant names. */
export const listboxOptionId = (listId: string, index: number): string =>
  `${listId}-option-${index}`

/**
 * Where a key moves a Listbox's active row, from the field that drives it:
 * ArrowDown and ArrowUp step one row and wrap round the ends, Home and End
 * jump to them. `undefined` for any other key, or with no rows, so the field
 * leaves the key alone (Home and End move the caret while there is no list).
 * With no active row yet, ArrowDown starts at the top and ArrowUp at the
 * bottom.
 */
export function listboxStep(
  active: number | null,
  count: number,
  key: string,
): number | undefined {
  if (count <= 0) return undefined
  switch (key) {
    case 'ArrowDown':
      return active === null ? 0 : (active + 1) % count
    case 'ArrowUp':
      return active === null ? count - 1 : (active - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return undefined
  }
}
