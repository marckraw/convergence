import { batonConditionToken, sameCondition } from './relay.pure'

/**
 * One crew wire as the seat-rename carry planner sees it (MAR-3157).
 *
 * Structural on purpose: the planner never touches the database, and the
 * service maps rows into this shape so a column the carry has no business
 * with cannot reach the plan by accident.
 */
export interface SeatRenameCarryWire {
  id: string
  targetSessionId: string | null
  conditionToken: string | null
  /** `spawn_spec_json.member`, or null when the wire is not a named spawn. */
  spawnMember: string | null
}

export interface SeatRenameCarryUpdate {
  id: string
  conditionToken?: string
  spawnMember?: string
}

/**
 * Which wires move with a seat rename, and which stay waiting on the old
 * name because they target someone else (or still name a seat that holds it).
 */
export interface SeatRenameCarryPlan {
  updates: SeatRenameCarryUpdate[]
  carried: string[]
  left: string[]
}

/**
 * Plans the wire edits a seat rename must carry in the same act (MAR-3157).
 *
 * Pattern: Planner — pure decide-then-apply so the service's transaction is
 * a dumb write of an already-settled list, and the recipient / exact-token /
 * spawn-name rules stay testable without a database.
 */
export function planSeatRenameCarry(input: {
  oldName: string | null
  newName: string | null
  /** Conversation seat this rename belongs to; null for a recipe seat. */
  renamedMemberSessionId: string | null
  /**
   * How many other members of the crew still hold `oldName` after this
   * rename. When > 0, a spawn that names `old` may mean the other seat.
   */
  remainingOldHolders: number
  wires: SeatRenameCarryWire[]
}): SeatRenameCarryPlan {
  const { oldName, newName, renamedMemberSessionId, remainingOldHolders } =
    input

  // First naming, or nothing to leave behind: there is no old token to move.
  if (oldName === null || oldName.trim() === '') {
    return { updates: [], carried: [], left: [] }
  }

  const oldToken = batonConditionToken(oldName)
  const clearing = newName === null || newName.trim() === ''
  const newToken = clearing ? null : batonConditionToken(newName)

  const updatesById = new Map<string, SeatRenameCarryUpdate>()
  const left = new Set<string>()

  for (const wire of input.wires) {
    const waitsOnOld = sameCondition(wire.conditionToken, oldToken)
    if (waitsOnOld) {
      if (
        !clearing &&
        newToken !== null &&
        renamedMemberSessionId !== null &&
        wire.targetSessionId === renamedMemberSessionId
      ) {
        const existing = updatesById.get(wire.id) ?? { id: wire.id }
        existing.conditionToken = newToken
        updatesById.set(wire.id, existing)
      } else {
        left.add(wire.id)
      }
    }

    if (wire.spawnMember !== null && wire.spawnMember === oldName) {
      if (!clearing && newName !== null && remainingOldHolders === 0) {
        const existing = updatesById.get(wire.id) ?? { id: wire.id }
        existing.spawnMember = newName
        updatesById.set(wire.id, existing)
        left.delete(wire.id)
      } else if (!updatesById.has(wire.id)) {
        left.add(wire.id)
      }
    }
  }

  const updates = [...updatesById.values()]
  return {
    updates,
    carried: updates.map((update) => update.id),
    left: [...left],
  }
}
