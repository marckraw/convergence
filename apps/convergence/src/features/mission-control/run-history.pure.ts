import type { SessionStatus } from '@/entities/session'
import type { CrewHail } from '@/entities/crew-hail'
import type { RelayHop } from '@/entities/session-relay'
import type {
  RelayRun,
  RelayRunPage,
  RunHistoryOutcome,
  RunStatus,
} from '@/entities/run-history'
import type { ResolveSessionName } from './relay-sentence.pure'

/**
 * How loud a recorded event reads.
 *
 * Four tones for nine words, because the question a colour answers is not
 * "what happened" but "does this need me". `alarm` is reserved for things
 * this build understands to be wrong; an unrecognised word is neutral, never
 * red (the vocabulary law).
 */
export type HistoryTone =
  | 'delivered'
  | 'held'
  | 'alarm'
  | 'terminal'
  | 'unknown'

const OUTCOME_WORDS: Record<RunHistoryOutcome, string> = {
  delivered: 'Delivered',
  queued: 'Queued',
  held: 'Held',
  'delivery-failed': 'Delivery failed',
  'limit-reached': 'Limit reached',
  'handed-back': 'Handed back',
  parked: 'Nobody answered',
  'reply-overdue': 'Reply overdue',
  'loop-closed': 'Loop closed',
  unknown: 'Unknown outcome',
}

const OUTCOME_TONES: Record<RunHistoryOutcome, HistoryTone> = {
  delivered: 'delivered',
  // Queued is NOT delivered (promise 4): the recipient has the work in its
  // queue and has not started it. Same tone, different word, on purpose —
  // the difference is real but it is not an alarm.
  queued: 'delivered',
  held: 'held',
  'delivery-failed': 'alarm',
  'limit-reached': 'alarm',
  'handed-back': 'terminal',
  parked: 'alarm',
  'reply-overdue': 'alarm',
  // A legacy row, and it was the loop law behaving. Grey, so old history
  // does not read as a wall of faults.
  'loop-closed': 'held',
  unknown: 'unknown',
}

export function historyOutcomeWord(outcome: RunHistoryOutcome): string {
  return OUTCOME_WORDS[outcome]
}

export function historyOutcomeTone(outcome: RunHistoryOutcome): HistoryTone {
  return OUTCOME_TONES[outcome]
}

/** Delivery-bearing laps for display; ledger generations remain untouched. */
function displayRunLaps(run: RelayRun): RelayRun['laps'] {
  const groups: RelayRun['laps'] = []
  let lapNumber = 0
  for (const lap of run.laps) {
    const carried = lap.hops.some(
      (hop) =>
        hop.outcome === 'delivered' ||
        hop.outcome === 'spawned' ||
        hop.outcome === 'queued',
    )
    const previous = groups.at(-1)
    if (carried) {
      lapNumber += 1
      if (previous?.lap === 0) {
        previous.lap = lapNumber
        previous.hops.push(...lap.hops)
      } else groups.push({ lap: lapNumber, hops: [...lap.hops] })
    } else if (previous) previous.hops.push(...lap.hops)
    else groups.push({ lap: 0, hops: [...lap.hops] })
  }
  return groups
}

function displayLapCount(run: RelayRun): number {
  return displayRunLaps(run).at(-1)?.lap ?? 0
}

/**
 * What a run's row says in one line.
 *
 * The rule the design cares about: **a run that needs him never reads as one
 * he was handed back.** The status the backend derived already answers that;
 * this only puts words on it, and leads with the count that matters — a run
 * with a failure says so before it says how many laps it ran.
 */
export function formatRunStatusLine(run: RelayRun): string {
  if (run.status.word === 'needs-you') {
    switch (run.status.reason) {
      case 'failed':
        return run.counts.failures === 1
          ? '1 delivery error'
          : `${run.counts.failures} delivery errors`
      case 'limit':
        return 'Delivery limit reached'
      case 'parked':
        return 'Nobody answered'
      case 'stalled':
        return 'Waiting for a reply'
      default:
        return 'Needs you'
    }
  }

  if (run.status.word === 'handed-back') {
    return displayLapCount(run) > 1
      ? `${displayLapCount(run)} laps · handed back`
      : 'Handed back'
  }
  if (run.status.word === 'running') return 'Running'
  // Three different runs land on `unknown` -- one recorded in another build's
  // words, one with no records at all, and one whose last delivery has no
  // ending written down -- so the sentence has to be true of all three.
  // "Recorded by another build" was true of only the first, and the third
  // became reachable the moment an unreceipted delivery stopped reading as
  // "Running" forever.
  if (run.status.word === 'unknown') return 'Ending not recorded'

  return run.counts.deliveries === 1
    ? '1 delivery'
    : `${run.counts.deliveries} deliveries`
}

/** One row in the run list. */
export interface HistoryRunRow {
  flowRunId: string
  /** "14:32", or "Yesterday · 17:46" for anything older than today. */
  timeLabel: string
  lastActivityLabel: string
  debt: { name: string; since: string; live: SessionStatus | null } | null
  activityLine: string
  /** The conversation the run started from, named, or null. */
  startingStation: string | null
  statusLine: string
  tone: HistoryTone
  /** True when this run is one of the ones the filter "needs you" keeps. */
  needsYou: boolean
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** "14:32" for today, "Yesterday · 17:46", or "6 Sep · 17:46". */
export function formatRunTime(startedAt: string, now: Date): string {
  const at = new Date(startedAt)
  if (Number.isNaN(at.getTime())) return 'unknown time'
  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`

  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate()
  if (sameDay) return clock

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const wasYesterday =
    at.getFullYear() === yesterday.getFullYear() &&
    at.getMonth() === yesterday.getMonth() &&
    at.getDate() === yesterday.getDate()
  if (wasYesterday) return `Yesterday · ${clock}`

  return `${at.getDate()} ${at.toLocaleString('en-GB', { month: 'short' })} · ${clock}`
}

/** "14:32:10" — an event row is scanned against its neighbours. */
export function formatEventTime(at: string): string {
  const time = new Date(at)
  if (Number.isNaN(time.getTime())) return '--:--:--'
  return `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`
}

/**
 * The conversation a run started from.
 *
 * Read off the FIRST recorded hop rather than from anything current: a run is
 * a historical fact, and the crew it ran in may have changed since.
 */
export function runStartingStation(
  run: RelayRun,
  resolveName: ResolveSessionName,
): string | null {
  const first = run.laps[0]?.hops[0]
  if (first) return resolveName(first.sourceSessionId)
  const hail = run.hails[0]
  return hail ? resolveName(hail.sessionId) : null
}

export function buildRunRow(
  run: RelayRun,
  resolveName: ResolveSessionName,
  now: Date,
  resolveStatus: (id: string) => SessionStatus | null = () => null,
): HistoryRunRow {
  const owed = run.owedBy
  const debt = owed
    ? {
        name: owed.targetSessionId
          ? (resolveName(owed.targetSessionId) ?? 'a conversation that is gone')
          : 'a conversation that is gone',
        since: formatRunTime(owed.firedAt, now),
        live: owed.targetSessionId ? resolveStatus(owed.targetSessionId) : null,
      }
    : null
  const lastActivityLabel = formatRunTime(run.lastActivityAt, now)
  const activityLine = debt
    ? `Waiting · ${debt.name} · since ${debt.since}${debt.live ? ` · ${debt.live}` : ''}`
    : run.handedBackAt
      ? `Handed back · ${formatRunTime(run.handedBackAt, now)}`
      : `${formatRunStatusLine(run)} · ${lastActivityLabel}`

  return {
    flowRunId: run.flowRunId,
    timeLabel: formatRunTime(run.startedAt, now),
    lastActivityLabel,
    debt,
    activityLine,
    startingStation: runStartingStation(run, resolveName),
    statusLine: formatRunStatusLine(run),
    tone: runTone(run.status),
    needsYou: run.status.word === 'needs-you',
  }
}

export function runTone(status: RunStatus): HistoryTone {
  switch (status.word) {
    case 'handed-back':
      return 'terminal'
    case 'needs-you':
      return 'alarm'
    case 'running':
      return 'delivered'
    case 'finished-quiet':
      return 'held'
    default:
      return 'unknown'
  }
}

/** Which runs the list is showing. */
export type HistoryFilter = 'all' | 'needs-you' | 'handed-back' | 'failed'

export const HISTORY_FILTERS: readonly {
  value: HistoryFilter
  label: string
}[] = [
  { value: 'all', label: 'All runs' },
  { value: 'needs-you', label: 'Needs you' },
  { value: 'handed-back', label: 'Handed back' },
  { value: 'failed', label: 'Failed' },
]

/**
 * The filter narrows the VIEW, never the record (frame 10-05).
 *
 * Which is why "no matching events" and "no history available yet" are
 * different states: one is a question about what is on screen, the other
 * about what happened.
 */
export function filterRuns(
  runs: readonly RelayRun[],
  filter: HistoryFilter,
): RelayRun[] {
  switch (filter) {
    case 'needs-you':
      return runs.filter((run) => run.status.word === 'needs-you')
    case 'handed-back':
      return runs.filter((run) => run.status.word === 'handed-back')
    case 'failed':
      return runs.filter(
        (run) => run.status.reason === 'failed' || run.counts.failures > 0,
      )
    default:
      return [...runs]
  }
}

/**
 * What the panel is showing, as one word.
 *
 * Four states, deliberately distinct (promise 7). Merging "no records" with
 * "no matches" would tell somebody their crew has never run when in fact
 * they had simply narrowed the list.
 */
export type HistoryPanelState =
  | 'loading'
  | 'error'
  | 'empty'
  | 'no-match'
  | 'ready'

export function historyPanelState(input: {
  loading: boolean
  error: string | null
  page: RelayRunPage | null
  visibleRuns: number
}): HistoryPanelState {
  if (input.error) return 'error'
  if (input.loading && !input.page) return 'loading'
  if (!input.page) return 'loading'
  const recorded =
    input.page.runs.length > 0 || input.page.unattributedHails.length > 0
  if (!recorded) return 'empty'
  if (input.visibleRuns === 0 && input.page.unattributedHails.length === 0) {
    return 'no-match'
  }
  return 'ready'
}

/** One recorded event, ready to render. */
export interface HistoryEventRow {
  id: string
  kind: 'hop' | 'hail' | 'held-group'
  timeLabel: string
  /** "Fable → Opus", or "Sol asked for Marcin" for a call. */
  title: string
  outcome: RunHistoryOutcome
  outcomeLabel: string
  tone: HistoryTone
  /**
   * The one-line reason, taken from the RECORD.
   *
   * Shown on the row rather than behind an expander (promise 4): a failure
   * reason nobody can see without clicking is a failure most people never
   * read.
   */
  reason: string | null
  preview?: string | null
  /** The stored wire this event names, when it names one. */
  relayId: string | null
}

/** One lap of a run, with the deliveries it made. */
export interface HistoryLapGroup {
  lap: number
  /**
   * "Lap 2 · horse", from the lap's FIRST delivery's baton — the route the
   * lap actually declared. "Lap 2" alone when nothing declared one.
   */
  label: string
  deliveries: number
  events: HistoryEventRow[]
}

function hopTitle(hop: RelayHop, resolveName: ResolveSessionName): string {
  const from = resolveName(hop.sourceSessionId) ?? 'a conversation that is gone'
  const landedIn = hop.spawnedSessionId ?? hop.targetSessionId
  const to = landedIn
    ? (resolveName(landedIn) ?? 'a conversation that is gone')
    : 'nobody'
  return `${from} → ${to}`
}

/**
 * A hop, as one row.
 *
 * The design word is LOOKED UP rather than computed: the page carries one
 * word per event, decided by the layer that owns the vocabulary. A row this
 * side cannot name falls to `unknown` — the same neutral landing every
 * unreadable record gets, never a blank and never red.
 */
export function buildHopEventRow(
  hop: RelayHop,
  input: {
    resolveName: ResolveSessionName
    outcomes: Record<string, RunHistoryOutcome>
  },
): HistoryEventRow {
  const outcome = input.outcomes[hop.id] ?? 'unknown'
  return {
    id: hop.id,
    kind: 'hop',
    timeLabel: formatEventTime(hop.firedAt),
    title: hopTitle(hop, input.resolveName),
    outcome,
    outcomeLabel: historyOutcomeWord(outcome),
    tone: historyOutcomeTone(outcome),
    reason: hop.error,
    preview: hop.payloadPreview,
    relayId: hop.relayId,
  }
}

export function buildHailEventRow(
  hail: CrewHail,
  input: {
    resolveName: ResolveSessionName
    outcomes: Record<string, RunHistoryOutcome>
  },
): HistoryEventRow {
  const outcome = input.outcomes[hail.id] ?? 'unknown'
  const who = input.resolveName(hail.sessionId) ?? 'A conversation that is gone'
  const title =
    outcome === 'handed-back'
      ? `${who} handed the run back to you`
      : `${who} needs you`
  return {
    id: hail.id,
    kind: 'hail',
    timeLabel: formatEventTime(hail.raisedAt),
    title,
    outcome,
    outcomeLabel: historyOutcomeWord(outcome),
    tone: historyOutcomeTone(outcome),
    // A call always says what it is about; that sentence is the record.
    reason: hail.detail,
    relayId: null,
  }
}

function foldHeldRows(
  hops: RelayHop[],
  input: {
    resolveName: ResolveSessionName
    outcomes: Record<string, RunHistoryOutcome>
  },
): HistoryEventRow[] {
  const groups = new Map<string, RelayHop[]>()
  const key = (hop: RelayHop) =>
    `${hop.sourceSessionId}:${Math.floor(Date.parse(hop.firedAt) / 1000)}`
  for (const hop of hops) {
    if (!Number.isFinite(Date.parse(hop.firedAt))) continue
    const group = groups.get(key(hop)) ?? []
    group.push(hop)
    groups.set(key(hop), group)
  }
  const result: HistoryEventRow[] = []
  for (const hop of hops) {
    const group = groups.get(key(hop)) ?? []
    const deliveries = group.filter((h) =>
      ['delivered', 'queued'].includes(input.outcomes[h.id]),
    )
    const held = group.filter((h) => h.outcome === 'skipped-baton')
    if (deliveries.length && held.includes(hop)) continue
    result.push(buildHopEventRow(hop, input))
    if (held.length && hop === deliveries.at(-1)) {
      const targets = [
        ...new Set(
          deliveries.map(
            (h) =>
              h.baton ??
              input.resolveName(
                h.spawnedSessionId ?? h.targetSessionId ?? '',
              ) ??
              'a conversation that is gone',
          ),
        ),
      ]
      result.push({
        id: `held:${hop.id}`,
        kind: 'held-group',
        timeLabel: formatEventTime(hop.firedAt),
        title: `${held.length} ${held.length === 1 ? 'wire' : 'wires'} held — the message went to ${targets.join(', ')}`,
        outcome: 'held',
        outcomeLabel: 'Held',
        tone: 'held',
        reason: held
          .map(
            (h) =>
              `${input.resolveName(h.targetSessionId ?? '') ?? 'a conversation that is gone'}${h.error ? `: ${h.error}` : ''}`,
          )
          .join('; '),
        preview: null,
        relayId: null,
      })
    }
  }
  return result
}

/**
 * One run's laps, in order, with its calls placed after the deliveries.
 *
 * Calls sit at the end rather than interleaved by clock, because a call is
 * about the RUN and a delivery is about a wire — putting a terminal row in
 * the middle of lap 2 would read as if the run continued past it. The header
 * says how many events there are, so nothing is hidden by the arrangement.
 */
export function buildRunEvents(
  run: RelayRun,
  input: {
    resolveName: ResolveSessionName
    outcomes: Record<string, RunHistoryOutcome>
  },
): { laps: HistoryLapGroup[]; calls: HistoryEventRow[] } {
  const laps = displayRunLaps(run).map((lap) => {
    const events = foldHeldRows(lap.hops, input)
    const baton = lap.hops.find((hop) => hop.baton !== null)?.baton ?? null
    return {
      lap: lap.lap,
      label:
        lap.lap === 0
          ? 'Recorded events'
          : baton
            ? `Lap ${lap.lap} · ${baton}`
            : `Lap ${lap.lap}`,
      deliveries: events.filter(
        (event) => event.outcome === 'delivered' || event.outcome === 'queued',
      ).length,
      events,
    }
  })

  const calls = run.hails.map((hail) =>
    buildHailEventRow(hail, {
      resolveName: input.resolveName,
      outcomes: input.outcomes,
    }),
  )

  return { laps, calls }
}

/** "One run · 3 laps · 9 deliveries", or the single-lap form. */
export function formatRunSummary(run: RelayRun): string {
  const deliveries =
    run.counts.deliveries === 1
      ? '1 delivery'
      : `${run.counts.deliveries} deliveries`
  if (displayLapCount(run) > 1) {
    return `One run · ${displayLapCount(run)} laps · ${deliveries}`
  }
  const events =
    run.counts.events === 1
      ? '1 recorded event'
      : `${run.counts.events} recorded events`
  return run.counts.failures > 0
    ? `${events} · ${run.counts.failures === 1 ? '1 delivery error' : `${run.counts.failures} delivery errors`}`
    : events
}

/**
 * How each wire on the CURRENT layout should read while a run is selected.
 *
 * Keyed by relay id, and only for wires the run actually used: everything
 * else is drawn dashed with "No event in this run". The graph is labelled the
 * current layout on purpose (promise 6) — these are today's wires wearing
 * yesterday's outcomes, not a reconstruction of the topology at the time.
 */
export function buildRunHighlight(
  run: RelayRun,
  outcomes: Record<string, RunHistoryOutcome>,
): Map<
  string,
  { outcome: RunHistoryOutcome; tone: HistoryTone; label: string }
> {
  const highlight = new Map<
    string,
    { outcome: RunHistoryOutcome; tone: HistoryTone; label: string }
  >()
  for (const lap of displayRunLaps(run)) {
    for (const hop of lap.hops) {
      const outcome = outcomes[hop.id] ?? 'unknown'
      // The NEWEST event on a wire wins: a wire that failed on lap 1 and
      // delivered on lap 3 is a wire that ended up working, and the failure
      // is still its own row in the list.
      highlight.set(hop.relayId, {
        outcome,
        tone: historyOutcomeTone(outcome),
        label:
          displayLapCount(run) > 1
            ? `Lap ${lap.lap} · ${historyOutcomeWord(outcome).toLowerCase()}`
            : historyOutcomeWord(outcome),
      })
    }
  }
  return highlight
}

/**
 * One page of older runs joined onto the page already on screen (L2).
 *
 * Appended rather than swapped in, because the panel is a list the person is
 * reading: replacing it would move the run under their cursor. The older
 * page's `hasMore` becomes the list's, since it is the one that saw the
 * bottom.
 *
 * Runs already held are dropped rather than repeated. A first-page refresh
 * starts a fresh snapshot cursor while keeping older rows on screen, so its
 * continuation can overlap those retained rows. `outcomes` is a map by event
 * id, so merging is
 * the only work it needs; the older page carries no unattributed calls by
 * construction (they ride the first page only).
 */
export function appendRunPage(
  current: RelayRunPage,
  older: RelayRunPage,
): RelayRunPage {
  const held = new Set(current.runs.map((run) => run.flowRunId))
  return {
    ...current,
    runs: [
      ...current.runs,
      ...older.runs.filter((run) => !held.has(run.flowRunId)),
    ],
    outcomes: { ...current.outcomes, ...older.outcomes },
    hasMore: older.hasMore,
    nextCursor: older.nextCursor,
  }
}
