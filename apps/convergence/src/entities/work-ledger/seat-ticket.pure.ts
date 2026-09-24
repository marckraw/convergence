import type { WorkLedgerEntry } from './work-ledger.types'

export interface LedgerSeat {
  sessionId: string | null
  batonName: string | null
}

/** Residents match the ledger's conversation join; recipes match their name. */
export function entryBelongsToSeat(
  entry: WorkLedgerEntry,
  member: LedgerSeat,
  crewId: string,
): boolean {
  if (entry.crewId !== crewId) return false
  if (member.sessionId !== null) return entry.sessionId === member.sessionId
  return member.batonName !== null && entry.seat === member.batonName
}

export const LOOM_NO_ACTIVE_TICKET = 'No active ticket'

/** The issue on a Loom card: newest working, else newest dispatch in Next. */
export function seatTicket(
  entries: readonly WorkLedgerEntry[],
  crewId: string,
  member: LedgerSeat,
): WorkLedgerEntry | null {
  const mine = entries.filter((entry) =>
    entryBelongsToSeat(entry, member, crewId),
  )
  // On equal timestamps the card reads In Flight before Decide.
  const working = mine
    .filter((entry) => entry.state === 'working')
    .sort(
      (a, b) =>
        b.seenAt.localeCompare(a.seenAt) ||
        Number(a.blocked) - Number(b.blocked),
    )[0]
  if (working) return working
  // Next excludes blocked and unseated entries. Preserve the card's scope.
  return (
    mine
      .filter(
        (entry) =>
          entry.state === 'assigned' &&
          !entry.blocked &&
          entry.seat !== null &&
          entry.dispatch !== null &&
          entry.dispatch.seat === member.batonName,
      )
      .sort((a, b) =>
        b.dispatch!.sentAt.localeCompare(a.dispatch!.sentAt),
      )[0] ?? null
  )
}
