import type { SessionCrew, SessionCrewMember } from '@/entities/session-crew'
import type { AttentionState, SessionStatus } from '@/entities/session'
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
   * A blocked `working` row lives under *Decide*, not in flight -- and it
   * stays listed there, the way a `returned` row stays under Fable's turn.
   * Only an in-flight row leaves the list, so `loomNowRows` has to know
   * which this was rather than guess from the row.
   */
  heldFrom: 'in-flight' | 'decide' | null
  /** The record says this resident's conversation was deleted (lap 2, C). */
  conversationMissing: boolean
  /** A `returned` row of this seat, named here AND left under Fable's turn. */
  returned: WaveRow | null
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
 */
function runtimeFor(input: {
  session: LoomHorseSession | null
  held: WaveRow | null
  returned: WaveRow | null
}): LoomHorseRuntime {
  if (input.held?.hostMarker) return 'not-seen'
  if (input.returned?.hostMarker) return 'not-seen'
  if (input.session?.attention === 'host-unreachable') return 'not-seen'
  if (input.session === null) return 'not-seen'
  return runtimeForStatus(input.session.status)
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
 * claims its crew's rows for that seat which carry no session at all.
 */
function rowBelongsToSeat(
  row: WaveRow,
  member: { sessionId: string | null; batonName: string | null },
  crewId: string,
): boolean {
  if (row.entry.crewId !== crewId) return false
  if (member.sessionId !== null) return row.entry.sessionId === member.sessionId
  return (
    member.batonName !== null &&
    row.entry.seat === member.batonName &&
    row.entry.sessionId === null
  )
}

/** This seat's row in `rows`, newest by `seenAt` first. */
function newestForSeat(
  rows: readonly WaveRow[],
  crewId: string,
  member: { sessionId: string | null; batonName: string | null },
): WaveRow | null {
  const mine = rows
    .filter((row) => rowBelongsToSeat(row, member, crewId))
    .sort((a, b) => b.entry.seenAt.localeCompare(a.entry.seenAt))
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
      // The seat's `working` row wherever the sheet put it (lap 2, A): a
      // blocked one is under *Decide*, and looking only in flight told a
      // person their busiest horse held nothing.
      const inFlight = newestForSeat(input.sheets.now.inFlight, crew.id, member)
      const blocked = inFlight
        ? null
        : newestForSeat(input.sheets.now.decide, crew.id, member)
      const held = inFlight ?? blocked
      const returned = newestForSeat(
        input.sheets.now.fablesTurn,
        crew.id,
        member,
      )
      // The host the seat works on: a resident works where its conversation
      // runs, a recipe where its policy says it will be spawned.
      const hostId =
        member.sessionId === null
          ? member.hostPolicy
          : (session?.executionHost ?? member.hostPolicy)
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
        runtime: runtimeFor({ session, held, returned }),
        hostLabel: input.hostLabelOf(hostId),
        hostMarker: held?.hostMarker ?? null,
        sessionId: member.sessionId,
        openable: session !== null,
        conversationMissing: member.conversationMissing,
        held,
        heldFrom: inFlight ? 'in-flight' : blocked ? 'decide' : null,
        returned,
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
 * A recipe seat says what it is instead: it is not `not-seen` -- nothing is
 * missing -- it simply has no conversation yet, and the four runtime words
 * are all about one.
 */
export function loomHorseRuntimeLabel(horse: LoomHorse): string {
  return horse.kind === 'dynamic'
    ? LOOM_RECIPE_LINE
    : RUNTIME_WORDS[horse.runtime]
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
