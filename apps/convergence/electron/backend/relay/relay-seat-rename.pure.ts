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
 * Which wires move with a seat rename, and which are listed as left —
 * fan-outs that still wait on the old token, or the seat's own waiters
 * when the name is cleared.
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
 *
 * A wire has one recipient: the conversation it targets, or the recipe seat
 * its spawn spec names. Every reference to the renamed seat on a wire whose
 * recipient IS that seat moves together. `null === null` is never a match —
 * a recipe rename does not treat every target-less wire as inbound.
 */
export function planSeatRenameCarry(input: {
  oldName: string | null
  newName: string | null
  /** Conversation seat this rename belongs to; null for a recipe seat. */
  renamedMemberSessionId: string | null
  wires: SeatRenameCarryWire[]
}): SeatRenameCarryPlan {
  const { oldName, newName, renamedMemberSessionId } = input

  // First naming, or nothing to leave behind: there is no old token to move.
  if (oldName === null || oldName.trim() === '') {
    return { updates: [], carried: [], left: [] }
  }

  const oldToken = batonConditionToken(oldName)
  const clearing = newName === null || newName.trim() === ''
  const newToken = clearing ? null : batonConditionToken(newName)
  const isRecipe = renamedMemberSessionId === null

  const updatesById = new Map<string, SeatRenameCarryUpdate>()
  const left = new Set<string>()

  for (const wire of input.wires) {
    // Recipient is M ⇔ conversation∧target===sessionId ∨ recipe∧spawnMember===old.
    const recipientIsM = isRecipe
      ? wire.spawnMember === oldName
      : wire.targetSessionId === renamedMemberSessionId
    const waitsOnOld = sameCondition(wire.conditionToken, oldToken)

    if (recipientIsM) {
      if (!clearing && newName !== null) {
        const existing = updatesById.get(wire.id) ?? { id: wire.id }
        let changed = false
        if (waitsOnOld && newToken !== null) {
          existing.conditionToken = newToken
          changed = true
        }
        if (isRecipe && wire.spawnMember === oldName) {
          existing.spawnMember = newName
          changed = true
        }
        if (changed) updatesById.set(wire.id, existing)
      } else if (waitsOnOld || (isRecipe && wire.spawnMember === oldName)) {
        left.add(wire.id)
      }
    } else if (waitsOnOld) {
      left.add(wire.id)
    }
  }

  const updates = [...updatesById.values()]
  return {
    updates,
    carried: updates.map((update) => update.id),
    left: [...left],
  }
}
