import { batonConditionToken } from './crew-loop.pure'

/**
 * The sentence under the seat name after a rename carry (MAR-3157 R6).
 * Zero and zero → null (nothing to say).
 *
 * Carried wires may have moved only a spawn member (no token), so the
 * sentence says they followed the rename — never that they "wait for" a
 * BATON the wire may not have.
 */
export function formatSeatRenameCarryNotice(input: {
  carried: number
  left: number
  oldName: string | null
  newName: string | null
}): string | null {
  const { carried, left, oldName, newName } = input
  if (carried === 0 && left === 0) return null

  const parts: string[] = []
  if (carried > 0 && newName !== null && newName.trim() !== '') {
    parts.push(
      carried === 1
        ? `1 wire followed the rename to "${newName}"`
        : `${carried} wires followed the rename to "${newName}"`,
    )
  }
  if (left > 0 && oldName !== null && oldName.trim() !== '') {
    const previous = batonConditionToken(oldName)
    parts.push(
      left === 1
        ? `1 wire still waits for "${previous}"`
        : `${left} wires still wait for "${previous}"`,
    )
  }
  return parts.length > 0 ? parts.join('; ') : null
}
