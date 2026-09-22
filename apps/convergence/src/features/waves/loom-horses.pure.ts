import type { SessionCrew, SessionCrewMember } from '@/entities/session-crew'
import {
  COMPACTING_CONTEXT_LABEL,
  isSessionCompacting,
  type ActivitySignal,
  type AttentionState,
  type SessionStatus,
} from '@/entities/session'
import type { WorkLedgerState } from '@/entities/work-ledger'
import type { LoomSheets } from './loom-sheets.pure'
import type { WaveRow } from './wave-sections.pure'

/**
 * What a seat's runtime IS, in the four words the panel may say (MAR-3191 R2).
 *
 * `not-seen` is the word this rule exists for: it is what the app says when it
 * does not know, and it is never spelled *idle*. An idle horse is a horse the
 * app can see, sitting still; a horse whose conversation is not loaded, or
 * whose host has stopped answering, might be riding hard on the other side of
 * a dead wire. Saying "Idle" there is the panel inventing calm.
 */
export type LoomHorseRuntime = 'working' | 'idle' | 'failed' | 'not-seen'

/** One horse seat, as the Now sheet draws it. */
export interface LoomHorse {
  /** Unique across crews: two crews may name a seat the same. */
  key: string
  crewId: string
  crewName: string | null
  /** The seat's baton name, or null when nobody has named it. */
  seat: string | null
  kind: SessionCrewMember['kind']
  runtime: LoomHorseRuntime
  hostLabel: string | null
  /** `host unreachable since 4m`, from the held row's own liveness. */
  hostMarker: string | null
  sessionId: string | null
  /**
   * Whether this seat's conversation can be opened (MAR-3191 R6).
   *
   * Not `sessionId !== null`: a resident whose conversation the store does
   * not hold has an id and nothing to open, and a card that offered a button
   * for it would be a control that does nothing when pressed. Whether the
   * store HOLDS it is a fact only this model has, so it carries it.
   */
  openable: boolean
  /** The `working` row this seat holds, newest first when it holds several. */
  held: WaveRow | null
  /**
   * Which group the held row came from (lap 2, A).
   *
   * A blocked `working` row is drawn under *Decide*, not in flight -- and it
   * stays listed there, the way a `returned` row stays under Fable's turn.
   * The card says which, so a person reading `blocked · decide` knows where
   * the row they are also seeing below came from.
   *
   * Only ever the group of a `working` row, so in practice `in-flight` or
   * `decide`; the type is the full set because the group is read from the
   * sheet rather than inferred, and inferring it is the mistake lap 3 fixed.
   */
  heldFrom: LoomNowGroup | null
  /** The record says this resident's conversation was deleted (lap 2, C). */
  conversationMissing: boolean
  /** A `returned` row of this seat, named here AND left under Fable's turn. */
  returned: WaveRow | null
  /**
   * The seat's conversation is compacting its context right now (MAR-3289 R1).
   *
   * Carried BESIDE `runtime` rather than as a fifth runtime value: a compacting
   * seat IS working -- it is busy, and auto-dispatch (MAR-3293) reads the four
   * words to decide who is free -- so every consumer that switches on the four
   * (the tint map, the icon map, `loomSeatCapacity`) keeps answering correctly
   * without knowing this word exists. Only the LABEL is finer, and only the
   * label reads this.
   *
   * True exactly when the compacting witness is what decided the runtime, so
   * it can never disagree with the runtime beside it: both come out of one
   * `runtimeFor` call, and a seat silenced by a dead host is `not-seen` and
   * NOT compacting, whatever its last-heard activity said.
   */
  compacting: boolean
}

/** The runtime a session's status IS (R2). */
function runtimeForStatus(status: SessionStatus): LoomHorseRuntime {
  if (status === 'running') return 'working'
  if (status === 'failed') return 'failed'
  // `idle`, `answered`, `completed`: the app can see the seat and it is not
  // moving. Three words for one runtime, because the difference between them
  // is about the last turn, not about whether the horse is riding.
  return 'idle'
}

/**
 * What a seat's runtime is (R2), from EVERY observation the app has.
 *
 * A host that has stopped answering outranks the session's own word: `status`
 * is the last thing the app HEARD, and silence since means the run may be
 * riding hard on the other side of a dead wire. Three witnesses say that
 * silence, and lap 1 read only the first (`feedback_a_witness_must_read_the
 * _state_the_invariant_is_about`): the held row's marker, the returned row's
 * marker, and the seat's own session, whose `attention` the backend derives
 * from the same liveness. Reading one and calling it the rule left a seat on
 * a dead host reading *Idle* whenever its row happened to sit elsewhere.
 *
 * No session at all is the same ignorance by a different road.
 *
 * A compaction is read AFTER all four (MAR-3289 R1) and before the status: it
 * is a thing the app watched the seat START, so it outranks the stale `status`
 * the last turn left -- but a dead wire outranks it in turn, because `activity`
 * is just as much a last-heard word as `status`, and a seat nobody can reach
 * is not observably doing anything.
 *
 * The answer carries BOTH facts so they cannot drift: `compacting` is true
 * exactly on the branch that read the predicate.
 */
function runtimeFor(input: {
  session: LoomHorseSession | null
  held: WaveRow | null
  returned: WaveRow | null
}): SeatRuntime {
  if (input.held?.hostMarker) return plainly('not-seen')
  if (input.returned?.hostMarker) return plainly('not-seen')
  if (input.session?.attention === 'host-unreachable')
    return plainly('not-seen')
  if (input.session === null) return plainly('not-seen')
  // Busy, whatever the last turn left behind: `status` still reads `completed`
  // (or `failed`) for the whole compaction window, and both of those words
  // mean "not riding" to `runtimeForStatus`.
  if (isSessionCompacting(input.session)) {
    return { runtime: 'working', compacting: true }
  }
  return plainly(runtimeForStatus(input.session.status))
}

/** What a seat's runtime is, and whether a compaction is what made it so. */
interface SeatRuntime {
  runtime: LoomHorseRuntime
  compacting: boolean
}

/** A runtime reached without reading the compaction witness. */
function plainly(runtime: LoomHorseRuntime): SeatRuntime {
  return { runtime, compacting: false }
}

/** The seat's own session, as `loomHorses` needs to read it. */
export interface LoomHorseSession {
  status: SessionStatus
  /**
   * What the app is waiting on. Only `host-unreachable` decides anything
   * here (R2): it is the session's own way of saying the wire is dead, and
   * the backend derives it from the same liveness a row's marker reports.
   */
  attention?: AttentionState
  /**
   * What the conversation is doing right now, for `isSessionCompacting`
   * (MAR-3289 R1). Optional because a seat's summary may predate the field;
   * absent reads exactly as it did before this rule.
   */
  activity?: ActivitySignal
  executionHost?: string | null
}

/**
 * Whether a row belongs to this seat (MAR-3191 lap 2, B).
 *
 * A resident claims the rows the LEDGER joined to its conversation
 * (`entry.sessionId`), never the rows that merely share its name: two
 * resident seats of one crew may carry the same `batonName` -- only recipe
 * names are unique -- and claiming by name gave both cards the same issue,
 * removed it from the list once, and collided their React keys.
 *
 * A recipe has no conversation, so a name is all it can be addressed by; it
 * claims its crew's rows for that seat, including their dispatched errands.
 */
export function rowBelongsToSeat(
  row: WaveRow,
  member: { sessionId: string | null; batonName: string | null },
  crewId: string,
): boolean {
  if (row.entry.crewId !== crewId) return false
  if (member.sessionId !== null) return row.entry.sessionId === member.sessionId
  return member.batonName !== null && row.entry.seat === member.batonName
}

/** Which of Now's four groups a row was drawn under. */
type LoomNowGroup = 'in-flight' | 'awaiting-qa' | 'fables-turn' | 'decide'

/** One of this seat's rows, with the group the sheet drew it under. */
interface SeatRow {
  row: WaveRow
  group: LoomNowGroup
}

/**
 * Every row of Now that belongs to this seat, whichever group holds it.
 *
 * A flat list on purpose (MAR-3191 lap 3, F). Lap 2 asked the GROUPS for the
 * seat's work -- in flight, else Decide -- and Decide holds blocked rows in
 * every state, so a blocked issue that was merely queued, or waiting on QA,
 * or returned for a verdict was claimed as the issue the horse is working on.
 * A group is where a row was drawn; only its STATE says what it is.
 */
function seatRowsInNow(
  sheets: LoomSheets,
  crewId: string,
  member: { sessionId: string | null; batonName: string | null },
): SeatRow[] {
  const groups: [LoomNowGroup, readonly WaveRow[]][] = [
    ['in-flight', sheets.now.inFlight],
    ['awaiting-qa', sheets.now.awaitingQa],
    ['fables-turn', sheets.now.fablesTurn],
    ['decide', sheets.now.decide],
  ]
  return groups.flatMap(([group, rows]) =>
    rows
      .filter((row) => rowBelongsToSeat(row, member, crewId))
      .map((row) => ({ row, group })),
  )
}

/**
 * This seat's newest row in one ledger state, and where it was drawn.
 *
 * The state is the question; the group only answers "where would a person
 * find this row on screen?", which the card needs so it can say `blocked ·
 * decide` about a row that is still listed under Decide.
 */
function newestInState(
  rows: readonly SeatRow[],
  state: WorkLedgerState,
): SeatRow | null {
  const mine = [...rows]
    .filter((seatRow) => seatRow.row.entry.state === state)
    .sort((a, b) => b.row.entry.seenAt.localeCompare(a.row.entry.seenAt))
  return mine[0] ?? null
}

/**
 * One card per horse seat of the bound crews (MAR-3191 R1).
 *
 * The seats come from the crew's RECORD, not from the sessions: a recipe seat
 * has no conversation until a wire spawns one, and a resident whose
 * conversation is gone still holds a place in the crew. Reading the sessions
 * instead would show exactly the horses that need no attention and hide every
 * one that does.
 *
 * `hostLabelOf` is injected because the words for a host live in the app's
 * settings, not in this slice: the pure model carries an id's MEANING no
 * further than the caller's own vocabulary.
 */
export function loomHorses(input: {
  crews: readonly SessionCrew[]
  sessionsById: ReadonlyMap<string, LoomHorseSession>
  sheets: LoomSheets
  hostLabelOf: (hostId: string | null) => string | null
}): LoomHorse[] {
  const horses: LoomHorse[] = []
  for (const crew of input.crews) {
    if (!crew.trackerBinding) continue
    let at = 0
    for (const member of crew.members) {
      if (member.role !== 'horse') continue
      at += 1
      const session =
        member.sessionId === null
          ? null
          : (input.sessionsById.get(member.sessionId) ?? null)
      // The seat's rows by STATE, wherever the sheet drew them (lap 3, F).
      // A card holds the issue the horse is WORKING, never one that merely
      // shares its seat and its blocked label.
      const mine = seatRowsInNow(input.sheets, crew.id, member)
      const working = newestInState(mine, 'working')
      const returnedRow = newestInState(mine, 'returned')
      const held = working?.row ?? null
      const returned = returnedRow?.row ?? null
      // The host the seat works on: a resident works where its conversation
      // runs, a recipe where its policy says it will be spawned.
      const hostId =
        member.sessionId === null
          ? member.hostPolicy
          : (session?.executionHost ?? member.hostPolicy)
      const seatRuntime = runtimeFor({ session, held, returned })
      horses.push({
        // The conversation is the seat's identity where it has one (lap 2,
        // B); a recipe's name is unique by the migration's own rule; an
        // unnamed recipe falls back to its place in the crew.
        key: `${crew.id}:${
          member.sessionId ??
          (member.batonName ? `recipe:${member.batonName}` : `#${at}`)
        }`,
        crewId: crew.id,
        crewName: crew.name,
        seat: member.batonName,
        kind: member.kind,
        runtime: seatRuntime.runtime,
        hostLabel: input.hostLabelOf(hostId),
        hostMarker: held?.hostMarker ?? null,
        sessionId: member.sessionId,
        openable: session !== null,
        conversationMissing: member.conversationMissing,
        held,
        heldFrom: working?.group ?? null,
        returned,
        compacting: seatRuntime.compacting,
      })
    }
  }
  return horses
}

/** What a card says where a resident says its runtime (R1). */
export const LOOM_RECIPE_LINE = 'recipe · spawns on dispatch'

/** The four runtime words, as a person reads them. */
const RUNTIME_WORDS: Readonly<Record<LoomHorseRuntime, string>> = {
  working: 'Working',
  idle: 'Idle',
  failed: 'Failed',
  'not-seen': 'Not seen',
}

/**
 * The words on a card where the runtime goes.
 *
 * Finer than `runtime` on purpose (MAR-3289 R1): a compacting seat is a
 * WORKING seat everywhere a decision is made, and says which kind of working
 * only here, where a person reads it.
 *
 * A recipe seat says what it is instead: it is not `not-seen` -- nothing is
 * missing -- it simply has no conversation yet, and the four runtime words
 * are all about one.
 */
export function loomHorseRuntimeLabel(horse: LoomHorse): string {
  if (horse.kind === 'dynamic') return LOOM_RECIPE_LINE
  // The finer word for a working seat (MAR-3289 R1). The same sentence every
  // other surface says while a conversation compacts, from the session
  // entity's own constant, so Loom cannot come to word it differently.
  if (horse.compacting) return COMPACTING_CONTEXT_LABEL
  return RUNTIME_WORDS[horse.runtime]
}

/**
 * The line above the cards: how many horses, and what they are doing.
 *
 * The numbers SUM to the count -- recipes are named too when a crew has any
 * (a departure from the brief's four-word shape, which would have left them
 * uncounted and the arithmetic quietly wrong).
 */
export function loomHorsesLine(horses: readonly LoomHorse[]): string {
  // Five zeros is arithmetic about nothing (lap 2, E). A crew with no horse
  // seats has a reason to hear that sentence, not that reckoning.
  if (horses.length === 0) return LOOM_NO_HORSES_LINE
  const residents = horses.filter((horse) => horse.kind !== 'dynamic')
  const count = (runtime: LoomHorseRuntime) =>
    residents.filter((horse) => horse.runtime === runtime).length
  const recipes = horses.length - residents.length
  return [
    `${horses.length} horse${horses.length === 1 ? '' : 's'}`,
    `${count('working')} working`,
    `${count('idle')} idle`,
    `${count('failed')} failed`,
    `${count('not-seen')} not seen`,
    ...(recipes > 0 ? [`${recipes} recipe${recipes === 1 ? '' : 's'}`] : []),
  ].join(' · ')
}

/** What a bound crew with no horse seats says instead of five zeros. */
export const LOOM_NO_HORSES_LINE = 'No horse seats in this crew'

/** How many Awaiting QA rows are shown before the reveal control (R5). */
export const LOOM_QA_PREVIEW = 3
