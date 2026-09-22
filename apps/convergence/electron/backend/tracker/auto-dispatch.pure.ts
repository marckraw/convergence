import type {
  AutoDispatchRecord,
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
  'batonName' | 'sessionId' | 'role' | 'wipLimit' | 'paused'
> {
  availability: SeatAvailability
  lanePath: string | null
  lane: DispatchLane
  wire: { id: string; opener: string | null } | null
}
export interface AutoDispatchInput {
  plannedAt: string
  autoDispatch?: boolean
  records?: readonly AutoDispatchRecord[]
  entries: readonly WorkLedgerRecord[]
  seats: readonly DispatchSeat[]
  firstSeen: ReadonlyMap<string, string>
}

/** Pure decision boundary: the plan describes a send but has no delivery door. */
export function planAutoDispatch(input: AutoDispatchInput): DispatchPlan {
  const { entries, seats, firstSeen } = input
  const plan: DispatchPlan = {
    plannedAt: input.plannedAt,
    autoDispatch: input.autoDispatch ?? false,
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
    const sent = input.records?.find(
      (r) => r.issueId === entry.issueId && r.lap === entry.lap,
    )
    if (missing.length === 0 && !entry.blocked && entry.lap <= 1 && !sent) {
      ;(plan.order[seatName] ??= []).push(entry.issueId)
    }
    const seat = seats.find((s) => s.batonName === seatName)
    const held = entries.filter(
      (e) =>
        e.seat === seatName &&
        (e.state === 'working' ||
          e.state === 'returned' ||
          (e.state === 'assigned' &&
            input.records?.some(
              (r) => r.issueId === e.issueId && r.lap === e.lap,
            ))),
    )
    const candidates = plan.order[seatName] ?? []
    let word: DispatchWord
    if (sent)
      word =
        sent.error !== null
          ? { kind: 'send-failed', reason: sent.error }
          : { kind: 'sent', at: sent.sentAt }
    else if (missing.length) word = { kind: 'needs-labels', missing }
    else if (entry.blocked) word = { kind: 'blocked' }
    else if (entry.lap > 1) word = { kind: 'later-lap', lap: entry.lap }
    else if (!seat) word = { kind: 'seat-not-in-crew' }
    else if (!seat.sessionId || seat.availability === 'unknown')
      word = { kind: 'seat-no-conversation' }
    else if (masters.length === 0) word = { kind: 'no-mastermind' }
    else if (!seat.wire) word = { kind: 'no-wire' }
    else if (seat.paused) word = { kind: 'seat-paused' }
    else if (seat.availability === 'failed') word = { kind: 'seat-failed' }
    else if (seat.availability !== 'idle')
      word = { kind: 'seat-busy', why: seat.availability }
    else if (held.length >= seat.wipLimit && held.length > 0)
      word = {
        kind: held[0].state === 'assigned' ? 'queued-behind' : 'seat-holds',
        identifier: held[0].issueIdentifier,
      }
    else if (seat.lane !== 'clean')
      word = { kind: 'lane', state: seat.lane, path: seat.lanePath }
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

/** MAR-3149 tracks a crew lap cap; round_cap is the unrelated hop budget. */
export const AUTO_DISPATCH_LAP_CAP = 6

export function autoDispatchText(input: {
  roleCard: string | null
  instruction: string | null
  issueUrl: string
  mastermind: string
}): string {
  return [
    input.roleCard,
    input.instruction,
    `Issue: ${input.issueUrl}\nRead the body first; it is the whole brief. Lap 1 of ${AUTO_DISPATCH_LAP_CAP}.\nYour reply's last line is exactly: BATON: ${input.mastermind}`,
  ]
    .filter((part) => part !== null && part !== '')
    .join('\n\n')
}

export function autoDispatchTime(at: string): string {
  return new Date(at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Loom's send-failed word is a sentence, not the raw terminal token
 * (MAR-3298 lap 2 E). Mapped once so the row and the Next chip agree.
 */
export function autoDispatchTerminalError(
  reason: 'failed' | 'cancelled' | 'abandoned',
): string {
  switch (reason) {
    case 'failed':
      return 'the delivery failed before the seat took it'
    case 'cancelled':
      return 'the queued delivery was cancelled'
    case 'abandoned':
      return "the seat's conversation was deleted"
  }
}
