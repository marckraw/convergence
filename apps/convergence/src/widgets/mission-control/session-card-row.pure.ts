/**
 * Where the Hail panel belongs when it opens below a card.
 *
 * The room is a responsive grid, so which cards share a row is a question only
 * the browser can answer — but once it has (as each card's offset from the top
 * of the grid), the answer is arithmetic. Cards in one row share an offset and
 * are contiguous, so the row ends at the last card that still matches.
 *
 * Returning the row's last index rather than the hailed card's own keeps the
 * row intact: the panel slides in under the whole row instead of cutting it in
 * half and pushing that card's neighbours down.
 */
export function findRowEndIndex(
  offsetTops: readonly number[],
  index: number,
): number | null {
  if (index < 0 || index >= offsetTops.length) return null

  const rowTop = offsetTops[index]
  let end = index
  while (end + 1 < offsetTops.length && offsetTops[end + 1] === rowTop) {
    end += 1
  }

  return end
}
