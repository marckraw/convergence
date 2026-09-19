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
 * The seat a row belongs to is decided by `rowBelongsToSeat` -- the same
 * join MAR-3191 uses for the cards -- so a queue and the horse card above it
 * can never disagree about whose work a row is. Crew is part of that join:
 * two crews may name a seat the same, and matching on the name alone would
 * hand one crew's work to another crew's horse.
 */
export function loomNext(
  rows: readonly WaveRow[],
  horses: readonly LoomHorse[],
): LoomNext {
  const claimed = new Set<WaveRow>()
  const seats: LoomNextSeat[] = []

  for (const horse of horses) {
    const mine = rows.filter(
      (row) =>
        !claimed.has(row) &&
        rowBelongsToSeat(
          row,
          { sessionId: horse.sessionId, batonName: horse.seat },
          horse.crewId,
        ),
    )
    for (const row of mine) claimed.add(row)
    // A seat with nothing queued is not drawn: Now already lists every
    // horse, and an empty group here would say "this horse has a queue".
    if (mine.length === 0) continue

    const ready: WaveRow[] = []
    const preparing: WaveRow[] = []
    for (const row of mine) {
      if (loomMissingLabels(row.entry.fact).length === 0) ready.push(row)
      else preparing.push({ ...row, action: preparingAction(row) })
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
