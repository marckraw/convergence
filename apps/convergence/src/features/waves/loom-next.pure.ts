import { rowBelongsToSeat, type LoomHorse } from './loom-horses.pure'
import type { WaveRow } from './wave-sections.pure'

/**
 * What the order is made of, said on the sheet (MAR-3193 R3).
 *
 * The frame's own footer named a dispatcher's rule. That dispatcher is not
 * ridden, its rule is not ratified, and one half of it -- when an issue was
 * FIRST seen -- is not a fact this renderer holds: `seenAt` is the newest
 * observation and moves whenever an issue changes. So the line says the two
 * facts the sort actually uses, and the second sentence says where running
 * work is, because a queue that omitted it would read as the whole picture.
 */
export const LOOM_NEXT_ORDER_LINE =
  'Order: priority, then issue number · running work stays in Now'

/**
 * What a queued row says when its seat exists but its conversation does not
 * (lap 2, A). The seat IS in the crew -- saying otherwise was the lap's bug.
 */
export const LOOM_NEXT_NO_CONVERSATION = 'seat has no conversation'

/** The group for queued rows whose seat is not a seat of their crew. */
export const LOOM_NEXT_UNSEATED_TITLE = 'No seat named in this crew'

/** The three labels a queued issue needs before it could run, in order. */
const READY_LABELS = ['groomed', 'grounded', 'dispatch'] as const

/** The label facts a queue row is judged on; absent is not true. */
export interface LoomQueueFact {
  groomed?: boolean
  grounded?: boolean
  dispatch?: boolean
}

/**
 * Which of the three labels this issue still lacks (MAR-3193 R2).
 *
 * `=== true` rather than `!== false`: on a row written before MAR-3190 the
 * keys are ABSENT, and absent means the app has never read a label -- not
 * that the label is there. Reading unknown as yes would put an issue nobody
 * cleared at the top of a queue as ready to run.
 */
export function loomMissingLabels(fact: LoomQueueFact): string[] {
  return READY_LABELS.filter((label) => fact[label] !== true)
}

/** Linear's priority as a sort rank: 1 urgent … 4 low, then none, last. */
function priorityRank(priority: number | null | undefined): number {
  // 0 is Linear's own word for "no priority", and null is "the tracker did
  // not say". Neither is an ordering claim, so both sit after every issue
  // somebody did rank -- together, not as two tiers.
  if (priority === null || priority === undefined || priority === 0) return 5
  return priority
}

/**
 * The number in an issue identifier (`MAR-3189` -> 3189), or null.
 *
 * Read as a NUMBER, not as text: `MAR-999` and `MAR-1000` are one character
 * apart in length and in the wrong order in every string comparison.
 */
function issueNumber(identifier: string): number | null {
  const match = /(\d+)$/.exec(identifier)
  return match ? Number(match[1]) : null
}

/**
 * The queue order (MAR-3193 R3) -- the one function P4a replaces.
 *
 * It is exported and used by both halves of a seat's queue so that when the
 * dispatcher's rule is ratified there is a single place where the order
 * lives, and the sheet's footer keeps describing what the sort does.
 */
export function loomQueueCompare(a: WaveRow, b: WaveRow): number {
  const byPriority =
    priorityRank(a.entry.fact.priority) - priorityRank(b.entry.fact.priority)
  if (byPriority !== 0) return byPriority

  const aNumber = issueNumber(a.entry.issueIdentifier)
  const bNumber = issueNumber(b.entry.issueIdentifier)
  if (aNumber !== null && bNumber !== null && aNumber !== bNumber) {
    return aNumber - bNumber
  }
  // An identifier with no number cannot be ranked by one; it falls to the
  // text, which is at least stable.
  if (aNumber === null && bNumber !== null) return 1
  if (aNumber !== null && bNumber === null) return -1
  return a.entry.issueIdentifier.localeCompare(b.entry.issueIdentifier)
}

/** One horse's queue, as Next draws it. */
export interface LoomNextSeat {
  key: string
  title: string
  capacity: string
  ready: WaveRow[]
  preparing: WaveRow[]
}

/** Next's whole answer: whose queue holds what, and what nobody's does. */
export interface LoomNext {
  seats: LoomNextSeat[]
  unseated: WaveRow[]
  ready: number
  preparing: number
}

/**
 * What this horse is doing, and how much is waiting on it (MAR-3193 R4).
 *
 * Every phrase is something the app can back from the seat's own runtime.
 * A null host label drops its segment and its separator rather than printing
 * the word `null`, and the count is the WHOLE queue -- ready and preparing
 * -- because "how much is waiting on this horse" is not a question about
 * labels.
 */
export function loomSeatCapacity(horse: LoomHorse, queued: number): string {
  const doing =
    horse.runtime === 'working'
      ? horse.held
        ? `Working on ${horse.held.entry.issueIdentifier}`
        : 'Working'
      : horse.runtime === 'idle'
        ? 'Idle'
        : horse.runtime === 'failed'
          ? 'Last turn failed'
          : 'Not seen yet'
  const parts = horse.hostLabel === null ? [] : [horse.hostLabel]
  parts.push(doing, `${queued} queued`)
  return parts.join(' · ')
}

/** `needs grounded · dispatch`, the labels this row still wants (R2). */
function preparingAction(row: WaveRow): string {
  return `needs ${loomMissingLabels(row.entry.fact).join(' · ')}`
}

/**
 * The queues, one per horse that has anything waiting (MAR-3193).
 *
 * The seat a row belongs to is decided in two passes, and they answer two
 * different questions (lap 2, A): `rowBelongsToSeat` -- the same join
 * MAR-3191 uses for the cards -- answers *whose conversation carries this
 * row*, and the narrower fallback answers *whose name is on it*. The second
 * exists because a seat can outlive its conversation, and only the first
 * question changes its answer when that happens. Crew is half of both: two
 * crews may name a seat the same.
 */
export function loomNext(
  rows: readonly WaveRow[],
  horses: readonly LoomHorse[],
): LoomNext {
  const claimed = new Set<WaveRow>()
  const mine = new Map<string, WaveRow[]>()
  // Rows a seat owns by NAME while its conversation is gone (lap 2, A).
  // They are queued on that horse and cannot run, whatever their labels
  // say, so they are tracked apart from the rows the label check judges.
  const nameOnly = new Set<WaveRow>()

  const take = (horse: LoomHorse, row: WaveRow) => {
    claimed.add(row)
    const list = mine.get(horse.key)
    if (list) list.push(row)
    else mine.set(horse.key, [row])
  }

  // Pass one: whose CONVERSATION carries this row.
  for (const horse of horses) {
    for (const row of rows) {
      if (claimed.has(row)) continue
      if (
        rowBelongsToSeat(
          row,
          { sessionId: horse.sessionId, batonName: horse.seat },
          horse.crewId,
        )
      ) {
        take(horse, row)
      }
    }
  }

  // Pass two: whose NAME is on it (lap 2, A).
  //
  // A resident seat whose conversation was deleted keeps its `sessionId` on
  // the crew member while the backend nulls it on the row
  // (`workLedgerEntryFromJoinedRow`), so the first join refuses a row that
  // plainly belongs to that horse -- and the sheet said the seat was not in
  // the crew, which was false. The crew is still half the match: two crews
  // may name a seat the same, and a name alone would hand one crew's work
  // to the other's horse.
  for (const horse of horses) {
    if (horse.seat === null) continue
    for (const row of rows) {
      if (claimed.has(row)) continue
      if (
        row.entry.crewId === horse.crewId &&
        row.entry.seat !== null &&
        row.entry.seat === horse.seat
      ) {
        take(horse, row)
        nameOnly.add(row)
      }
    }
  }

  const seats: LoomNextSeat[] = []
  for (const horse of horses) {
    const queue = mine.get(horse.key) ?? []
    // A seat with nothing queued is not drawn: Now already lists every
    // horse, and an empty group here would say "this horse has a queue".
    if (queue.length === 0) continue

    const ready: WaveRow[] = []
    const preparing: WaveRow[] = []
    for (const row of queue) {
      // A seat with no conversation cannot start anything, so its rows are
      // never Ready and never numbered -- the number is a promise about
      // what runs next, and nothing runs through a door that is gone.
      if (nameOnly.has(row)) {
        preparing.push({ ...row, action: LOOM_NEXT_NO_CONVERSATION })
      } else if (loomMissingLabels(row.entry.fact).length === 0) {
        ready.push(row)
      } else {
        preparing.push({ ...row, action: preparingAction(row) })
      }
    }
    ready.sort(loomQueueCompare)
    preparing.sort(loomQueueCompare)

    seats.push({
      key: horse.key,
      title: horse.seat ?? horse.key,
      capacity: loomSeatCapacity(horse, ready.length + preparing.length),
      // The position is said in the row's own word, so the queue can be
      // numbered without `WaveRowView` learning what a queue is.
      ready: ready.map((row, at) => ({ ...row, action: `${at + 1} · ready` })),
      preparing,
    })
  }

  const unseated = rows
    .filter((row) => !claimed.has(row))
    .sort(loomQueueCompare)
    .map((row) => ({
      ...row,
      action: `seat "${row.entry.seat ?? ''}" not in the crew`,
    }))

  return {
    seats,
    unseated,
    ready: seats.reduce((sum, seat) => sum + seat.ready.length, 0),
    // A row no seat claims cannot run whatever its labels say, so it is
    // counted with the work that is still being prepared.
    preparing:
      seats.reduce((sum, seat) => sum + seat.preparing.length, 0) +
      unseated.length,
  }
}
