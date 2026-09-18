import { batonConditionToken } from './crew-loop.pure'

/**
 * The sentence under the seat name after a rename carry (MAR-3157 R6).
 * Zero and zero → null (nothing to say).
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
    const next = batonConditionToken(newName)
    parts.push(
      carried === 1
        ? `1 wire now waits for "${next}"`
        : `${carried} wires now wait for "${next}"`,
    )
  }
  if (left > 0 && oldName !== null && oldName.trim() !== '') {
    const previous = batonConditionToken(oldName)
    if (newName !== null && newName.trim() !== '') {
      parts.push(
        left === 1
          ? `1 wire still waits for "${previous}" (it targets another seat)`
          : `${left} wires still wait for "${previous}" (they target another seat)`,
      )
    } else {
      parts.push(
        left === 1
          ? `1 wire still waits for "${previous}"`
          : `${left} wires still wait for "${previous}"`,
      )
    }
  }
  return parts.length > 0 ? parts.join(' ') : null
}
