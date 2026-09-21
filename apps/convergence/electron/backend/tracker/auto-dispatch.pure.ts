import type {
  DispatchLane,
  DispatchPlan,
  DispatchWord,
  SeatAvailability,
  WorkLedgerRecord,
} from '../../../src/shared/types/tracker.types'
import { dispatchQueueCompare } from '../../../src/shared/lib/dispatch-order.pure'
import type { SessionCrewMember } from '../crew/crew.types'

export interface DispatchSeat extends Pick<
  SessionCrewMember,
  'batonName' | 'sessionId' | 'role' | 'wipLimit'
> {
  availability: SeatAvailability
  lane: DispatchLane
  wire: { id: string; opener: string | null } | null
}
export interface AutoDispatchInput {
  plannedAt: string
  entries: readonly WorkLedgerRecord[]
  seats: readonly DispatchSeat[]
  firstSeen: ReadonlyMap<string, string>
}

/** Pure decision boundary: the plan describes a send but has no delivery door. */
export function planAutoDispatch(input: AutoDispatchInput): DispatchPlan {
  const { entries, seats, firstSeen } = input
  const plan: DispatchPlan = {
    plannedAt: input.plannedAt,
    words: {},
    order: {},
    warnings: [],
  }
  const masters = seats.filter((s) => s.role === 'mastermind' && s.sessionId)
  if (masters.length > 1)
    plan.warnings.push(
      `Multiple mastermind seats; using ${masters[0].batonName ?? masters[0].sessionId} (first in seat order).`,
    )
  const ordered = entries
    .filter((e) => e.state === 'assigned' && e.seat !== null)
    .sort((a, b) =>
      dispatchQueueCompare(
        {
          priority: a.fact.priority,
          firstSeenAt: firstSeen.get(a.issueId),
          identifier: a.issueIdentifier,
        },
        {
          priority: b.fact.priority,
          firstSeenAt: firstSeen.get(b.issueId),
          identifier: b.issueIdentifier,
        },
      ),
    )
  for (const entry of ordered) {
    const seatName = entry.seat!
    const missing = (['groomed', 'grounded', 'dispatch'] as const).filter(
      (label) => !(entry.fact[label] === true),
    )
    if (missing.length === 0 && !entry.blocked) {
      ;(plan.order[seatName] ??= []).push(entry.issueId)
    }
    const seat = seats.find((s) => s.batonName === seatName)
    const held = entries.filter(
      (e) =>
        e.seat === seatName &&
        (e.state === 'working' || e.state === 'returned'),
    )
    const candidates = plan.order[seatName] ?? []
    let word: DispatchWord
    if (missing.length) word = { kind: 'needs-labels', missing }
    else if (entry.blocked) word = { kind: 'blocked' }
    else if (!seat) word = { kind: 'seat-not-in-crew' }
    else if (!seat.sessionId || seat.availability === 'unknown')
      word = { kind: 'seat-no-conversation' }
    else if (masters.length === 0) word = { kind: 'no-mastermind' }
    else if (!seat.wire) word = { kind: 'no-wire' }
    else if (seat.availability !== 'idle')
      word = { kind: 'seat-busy', why: seat.availability }
    else if (held.length >= seat.wipLimit && held.length > 0)
      word = { kind: 'seat-holds', identifier: held[0].issueIdentifier }
    else if (seat.lane !== 'clean') word = { kind: 'lane', state: seat.lane }
    else if (candidates.length > Math.max(0, seat.wipLimit - held.length)) {
      const ahead = ordered.find(
        (e) => e.issueId === candidates[candidates.length - 2],
      )!
      word = { kind: 'queued-behind', identifier: ahead.issueIdentifier }
    } else word = { kind: 'would-start', wire: seat.wire }
    plan.words[entry.issueId] = word
  }
  return plan
}
