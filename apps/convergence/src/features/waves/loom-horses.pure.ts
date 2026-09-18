import type { SessionCrew, SessionCrewMember } from '@/entities/session-crew'
import type { SessionStatus } from '@/entities/session'
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
 * What a seat's runtime is, from the only two facts that may decide it (R2).
 *
 * The held row's host marker outranks the session's own word: `status` is the
 * last thing the app HEARD, and an unreachable host means nothing has been
 * heard since -- the run may be riding hard on the other side of a dead wire.
 * No session at all is the same ignorance by a different road.
 */
function runtimeFor(
  session: LoomHorseSession | null,
  held: WaveRow | null,
): LoomHorseRuntime {
  if (held?.hostMarker) return 'not-seen'
  if (session === null) return 'not-seen'
  return runtimeForStatus(session.status)
}

/** The seat's own session, as `loomHorses` needs to read it. */
export interface LoomHorseSession {
  status: SessionStatus
  executionHost?: string | null
}

/** A row of `rows` whose seat is `seat`, newest by `seenAt` first. */
function newestForSeat(
  rows: readonly WaveRow[],
  crewId: string,
  seat: string | null,
): WaveRow | null {
  if (seat === null) return null
  const mine = rows
    .filter((row) => row.entry.crewId === crewId && row.entry.seat === seat)
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
      const held = newestForSeat(
        input.sheets.now.inFlight,
        crew.id,
        member.batonName,
      )
      const returned = newestForSeat(
        input.sheets.now.fablesTurn,
        crew.id,
        member.batonName,
      )
      // The host the seat works on: a resident works where its conversation
      // runs, a recipe where its policy says it will be spawned.
      const hostId =
        member.sessionId === null
          ? member.hostPolicy
          : (session?.executionHost ?? member.hostPolicy)
      horses.push({
        key: `${crew.id}:${member.batonName ?? `#${at}`}`,
        crewId: crew.id,
        crewName: crew.name,
        seat: member.batonName,
        kind: member.kind,
        runtime: runtimeFor(session, held),
        hostLabel: input.hostLabelOf(hostId),
        hostMarker: held?.hostMarker ?? null,
        sessionId: member.sessionId,
        openable: session !== null,
        held,
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

/** How many Awaiting QA rows are shown before the reveal control (R5). */
export const LOOM_QA_PREVIEW = 3
