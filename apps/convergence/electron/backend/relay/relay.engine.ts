import { randomUUID } from 'crypto'
import type { SessionStatus } from '../provider/provider.types'
import type {
  CreateSessionInput,
  DispatchTerminalEvent,
  SessionSettledEvent,
} from '../session/session.types'
import { resolveAccountForAutomaticTurn } from '../provider-account/provider-account-automatic-turn.pure'
import type { AutomaticTurnAccountSource } from '../provider-account/provider-account-automatic-turn.pure'
import {
  ALREADY_FIRED_MESSAGE,
  MUTED_MESSAGE,
  TERMINAL_BATON,
  TERMINAL_BATON_MESSAGE,
  batonMismatchMessage,
  buildRelayHopPreview,
  compileRelayPayload,
  flowRunBudgetMessage,
  hasFlowRunBudget,
  hasRoundBudget,
  isBudgetedOutcome,
  readEmittedBaton,
  readEmittedDeclaration,
  relayConditionMatches,
  resolveRoundCap,
  roundBudgetMessage,
  roundNumber,
} from './relay.pure'
import {
  CREW_LIVE_WINDOW_MS,
  findStalledStations,
  formatCrewHailDetail,
  resolveStallMinutes,
} from './crew-hail.pure'
import type { CrewHail, RaiseCrewHailInput } from './crew-hail.types'
import type { RelayService } from './relay.service'
import type {
  RelayHop,
  RelayHopOutcome,
  RelaySpawnSpec,
  SessionRelay,
} from './relay.types'

/**
 * The narrow face of SessionService the engine is allowed to touch.
 *
 * Relays send real prompts to real providers that spend real quota, so the
 * engine talks to sessions through this seam and nothing wider -- a test
 * substitutes it and can never accidentally start a provider process.
 */
export interface RelaySessionGateway {
  getById(sessionId: string): {
    id: string
    status: SessionStatus
    providerId: string
    /** Remote sessions cannot carry a local account (PA10). */
    executionHost: string
  } | null
  getLastAssistantMessageText(sessionId: string): string | null
  /** The account the session's newest turn ran on, or null for ambient. */
  getLastTurnProviderAccountId(sessionId: string): string | null
  /**
   * Returns the delivery receipt (MAR-2759): the dispatch id the session
   * layer minted for this input. The engine records it on the hop, and the
   * settle that consumed the input names it back -- the one causal answer to
   * "which settle owns this delivered work", stated by the layer that owns
   * the queue instead of guessed here from status snapshots.
   */
  sendMessage(
    sessionId: string,
    input: { text: string; providerAccountId?: string | null },
  ): Promise<string>
  /**
   * Sends the opener as a turn of its own and queues the payload behind it,
   * in one call so nothing can slip between the two beats (F9). An idle
   * target takes the opener now; a target carrying a turn gets the opener
   * queued behind it, on every provider -- an opener never joins somebody's
   * turn (MAR-2759, design X). Returns both beats' receipts: the payload's
   * rides the hop; the opener's is how this engine recognises the plumbing
   * settle by identity.
   */
  sendMessageWithOpener(
    sessionId: string,
    input: {
      opener: string
      text: string
      providerAccountId?: string | null
    },
  ): Promise<{ openerDispatchId: string; payloadDispatchId: string }>
  create(input: CreateSessionInput): { id: string }
  start(
    sessionId: string,
    input: { text: string; providerAccountId?: string | null },
  ): Promise<string>
}

/**
 * The three crew questions the engine is allowed to ask. Narrow on purpose: it
 * may put a session it just made into the crew that asked for it, find out
 * whose loop a settling session belongs to, and read the two knobs a crew
 * turned on its own loop. It may not touch a crew otherwise.
 */
export interface RelayCrewGateway {
  addMember(crewId: string, sessionId: string): unknown
  /**
   * Every crew this session is in. Asked because a baton nobody routed has to
   * hail the crew that was waiting on it, and that crew may own no wire
   * leaving this station at all -- which is precisely the silent drop.
   */
  crewIdsForSession(sessionId: string): string[]
  /** Null for a crew that is gone; the engine then falls back to defaults. */
  getLoopLimits(
    crewId: string,
  ): { roundCap: number | null; stallMinutes: number | null } | null
}

/**
 * The one thing the engine may do to the hail book: raise a call for Marcin.
 *
 * Answering one is his gesture, never the engine's, so it is not on this seam
 * -- an engine that could clear its own alarms would be an engine that could
 * hide from him.
 */
export interface RelayHailGateway {
  raise(input: RaiseCrewHailInput): CrewHail | null
}

interface RecordHopExtra {
  targetSessionId?: string | null
  spawnedSessionId?: string | null
  payloadPreview?: string | null
  /** The delivery receipt the session layer returned for this input. */
  dispatchId?: string | null
  error?: string | null
}

/**
 * A budgeted row -- one that actually put work into a session -- MUST carry
 * the receipt the session layer returned for it: the baton is keyed by that
 * receipt, so a budgeted hop without one would be work no settle could ever
 * continue. The type makes that row unwritable rather than checking for it.
 */
type RecordHopFn = {
  (
    outcome: 'delivered' | 'queued' | 'spawned',
    extra: RecordHopExtra & { dispatchId: string },
  ): void
  (
    outcome: Exclude<RelayHopOutcome, 'delivered' | 'queued' | 'spawned'>,
    extra?: RecordHopExtra,
  ): void
}

interface RelayEngineDeps {
  relays: RelayService
  sessions: RelaySessionGateway
  crews: RelayCrewGateway
  accounts: AutomaticTurnAccountSource
  hails: RelayHailGateway
  /** Called for every ledger row, so windows can watch the trail live. */
  onHopAppended?: (hop: RelayHop) => void
  /** Called when a loop parks, so the chair lights in every window. */
  onHailsChanged?: () => void
  /** Called when the engine disarms a wire on its own. */
  onRelaysChanged?: () => void
  /** Called after a spawn joins a crew, so the roster refreshes live. */
  onCrewsChanged?: () => void
}

/**
 * The switchboard operator.
 *
 * Convergence is the only thing that moves work between sessions -- agents
 * never call agents. This engine listens for sessions coming to rest, reads
 * the wires the user drew inside a crew, and carries the finished session's
 * last assistant message along them. Every wire that actually fires writes a
 * ledger row before this returns -- deliveries, skips and errors alike. A
 * disarmed wire does not fire, and so writes nothing.
 */
export class RelayEngine {
  private readonly relays: RelayService
  private readonly sessions: RelaySessionGateway
  private readonly crews: RelayCrewGateway
  private readonly accounts: AutomaticTurnAccountSource
  private readonly hails: RelayHailGateway
  private readonly onHopAppended?: (hop: RelayHop) => void
  private readonly onHailsChanged?: () => void
  private readonly onRelaysChanged?: () => void
  private readonly onCrewsChanged?: () => void

  /**
   * The ancestry batons: dispatch id -> the flow run whose work that dispatch
   * landed (MAR-2759).
   *
   * A hop that lands work in a session leaves a baton keyed by the receipt
   * the session layer minted for it; the settle that NAMES that receipt
   * takes the baton and continues the same run. Keyed by the dispatch, never
   * by the session, because a session is a container that may hold several
   * outstanding dispatches at once -- two wires of one run queued into the
   * same target, or two runs whose payloads joined one native turn -- and a
   * one-slot-per-session map lost every receipt but the last: the first
   * queued payload's settle could name nothing held and minted a fresh run,
   * in which every already-fired wire was live again.
   *
   * A settle takes EVERY held baton it names. When those batons belong to
   * several runs -- two runs coalesced into one native turn -- the OLDEST
   * run continues (insertion order of this map, so it is deterministic) and
   * the other named batons are consumed: the same finished message carries
   * on under one run, the wires are measured against it, and nothing is
   * dropped. A settle naming no held baton (a turn the user typed) starts a
   * fresh run, exactly as before.
   *
   * Deliberately in memory rather than inferred from the ledger, and under
   * the loop law that difference is the difference between a wire resting
   * and a wire dead forever.
   *
   * A restart drops every baton, so a chain interrupted by a restart resumes
   * in a fresh run and one wire may fire a second time. That is the direction
   * this errs on purpose: worst case one extra hop, never a loop, because
   * once-per-run still governs the new run.
   */
  private readonly batons = new Map<string, string>()

  /**
   * The dispatch ids of openers this engine has sent: the settles that
   * belong to Convergence rather than to the agent, recognised BY IDENTITY
   * when they arrive (MAR-2759).
   *
   * An opener's turn comes to rest like any other, but nothing finished --
   * the session was wiped and the work it was sent is still queued behind.
   * Treating that beat as a settle would consume the run's baton, so the real
   * settle a moment later would mint a FRESH run, and the loop law -- a wire
   * fires once per run -- would stop ending chains: A -> B -> A -> B would
   * ping-pong forever, each lap legal in its own new run.
   *
   * So a settle that is ONLY plumbing -- it names at least one id, and every
   * id it names is a held opener's -- is skipped and the baton left where it
   * is. Nothing is written to the ledger either, because no wire fired: this
   * is the same silence a disarmed wire keeps, not a hidden delivery.
   *
   * That condition is true by construction, not by luck: an opener is
   * always a turn of its own (design X). The session layer never lets it
   * join a running turn -- at a busy target it is queued behind the turn --
   * so nothing else can finish in the turn an opener's settle ends, and
   * "every named id is an opener's" really means "nothing finished". The
   * loud side is the only side a lost set can err on: a settle whose
   * receipts a restart forgot names none of ours, proceeds as somebody's
   * work and journals through its wires; a lost payload receipt leaves its
   * hop unstamped and the stall clock asks a human.
   *
   * Ids rather than a count, because a count was an anonymous claim any
   * settle could consume: a turn already running when the opener queued would
   * eat it, the opener's own settle would then take the run's baton, and an
   * already-fired wire would fire again in the fresh run the payload minted
   * -- the loop-law breach itself, not merely a wrong alarm.
   */
  private readonly plumbingDispatchIds = new Set<string>()

  /**
   * Run id -> settles carrying it right now.
   *
   * A baton names a run waiting on a session to finish; this names one already
   * in hand. Between the moment a settle takes its baton and the moment a
   * delivery leaves the next one, the run is named by neither -- and a provider
   * send is awaited inside exactly that gap, so an IPC call landing there would
   * find a live run that looks finished.
   *
   * Counted rather than flagged: one hop can leave batons on two sessions, and
   * both may settle into the same run at once.
   */
  private readonly runsInFlight = new Map<string, number>()

  constructor(deps: RelayEngineDeps) {
    this.relays = deps.relays
    this.sessions = deps.sessions
    this.crews = deps.crews
    this.accounts = deps.accounts
    this.hails = deps.hails
    this.onHopAppended = deps.onHopAppended
    this.onHailsChanged = deps.onHailsChanged
    this.onRelaysChanged = deps.onRelaysChanged
    this.onCrewsChanged = deps.onCrewsChanged
  }

  /**
   * Handles one settle. Never rejects: it is driven from the session
   * lifecycle, and a broken wire must not be able to damage a session.
   */
  async handleSettle(event: SessionSettledEvent): Promise<void> {
    try {
      // The ledger hears EVERY settle, plumbing included, and it hears it
      // first: the settle names the dispatch ids its turn consumed, and only
      // the hops carrying those ids are stamped (MAR-2759) -- so an opener's
      // finish can never stamp the payload still queued behind it, on this
      // run or after a restart, because it does not name the payload's id.
      // Above every early return for the same reason as ever: the most common
      // landing place of all is a terminal station, which has no wires,
      // belongs to no crew's outgoing list, and would otherwise leave its hop
      // looking owed forever.
      this.relays.markStationSettled(
        event.sessionId,
        event.status,
        event.settledAt,
        event.dispatchIds,
      )

      // Recognised by identity before the baton is taken: a settle that names
      // an opener's dispatch id is our own plumbing, not the session
      // finishing work.
      if (this.takePlumbingSettle(event.dispatchIds)) return

      // Taken before the wires are read, and once per settle: every wire
      // leaving this session is measured against the same run.
      const flowRunId = this.takeFlowRunId(event.dispatchIds)

      this.enterRun(flowRunId)
      try {
        const relays = this.relays.listForSourceSession(event.sessionId)
        const crewIds = this.flowCrewIds(event.sessionId, relays)
        // Not in anybody's flow: no wires leaving it and no crew that has any.
        // Nothing to carry and nobody waiting, so nothing to say.
        if (crewIds.length === 0) return

        // Read once per settle rather than once per wire. Every wire asks the
        // same message the same question, and the baton it declares is a fact
        // about the settle, not about any one switch.
        const message = this.sessions.getLastAssistantMessageText(
          event.sessionId,
        )
        const emittedBaton = message ? readEmittedBaton(message) : null

        // Which CREWS answered, not whether anything did. A settle can be a
        // beat in two loops at once, and one crew's wire matching says nothing
        // about whether the other's baton reached anybody.
        const answeredCrewIds = new Set<string>()
        for (const relay of relays) {
          const answered = await this.fire(
            relay,
            event,
            flowRunId,
            message,
            emittedBaton,
          )
          if (answered) answeredCrewIds.add(relay.crewId)
        }

        this.parkIfUnanswered({
          event,
          flowRunId,
          crewIds,
          emittedBaton,
          message,
          answeredCrewIds,
        })
      } finally {
        this.leaveRun(flowRunId)
      }
    } catch (error) {
      console.error(
        `[relay] failed to handle settle for ${event.sessionId}`,
        error,
      )
    }
  }

  /**
   * A dispatch ended without a settle (MAR-2759): the user cancelled the
   * queued input, the session holding it was deleted, or the system could
   * not run it (design P -- every dispatched receipt reaches exactly one
   * terminal, and this is where the three that are not a settle land).
   *
   * Exactly the named receipts, and nothing keyed by session: their batons
   * are released (the run leaves `liveFlowRunIds` with its last one), an
   * opener claim among them is dropped, and the hops that carried them are
   * stamped with the terminal's own word. `cancelled` and `abandoned` the
   * stall clock reads as quiet -- a station never took this work and there
   * is no silence to accuse it of. `failed` it reads as LOUD, and calls on
   * the next tick: the work did not happen and nobody chose that. A sibling
   * receipt queued into the same session is untouched: it is still owed,
   * and its own settle still continues its own run. Never rejects, for the
   * same reason `handleSettle` never does.
   */
  handleDispatchTerminal(event: DispatchTerminalEvent): void {
    try {
      for (const dispatchId of event.dispatchIds) {
        this.batons.delete(dispatchId)
        this.plumbingDispatchIds.delete(dispatchId)
      }
      this.relays.markDispatchesTerminated(
        event.dispatchIds,
        event.at,
        event.reason,
      )
    } catch (error) {
      console.error(
        `[relay] failed to handle a dispatch terminal for ${event.sessionId}`,
        error,
      )
    }
  }

  /**
   * The run a settling session's wires belong to: the run of the OLDEST
   * baton this settle names, every named baton consumed -- or a brand new
   * run when it names none.
   *
   * A held baton this settle does not name is PRESERVED, not spent: the beat
   * that just ended is some other work (a turn that was already running, a
   * turn the user typed), and the run is still waiting on its own settle.
   */
  private takeFlowRunId(dispatchIds: readonly string[]): string {
    let continued: string | null = null
    for (const [dispatchId, flowRunId] of this.batons) {
      if (!dispatchIds.includes(dispatchId)) continue
      this.batons.delete(dispatchId)
      continued ??= flowRunId
    }
    return continued ?? randomUUID()
  }

  /**
   * The crews whose loop this settling session is part of.
   *
   * Two answers unioned, because they answer different halves of the same
   * question. The crews of its outgoing wires are the ones it can hand work
   * to. The crews it merely belongs to that own wires are the ones that may be
   * WAITING on it -- a station wired only as a target has no outgoing wire at
   * all, and a baton it declares would be the silent drop this feature exists
   * to remove.
   *
   * A crew with no wires anywhere is a label, not a flow: putting a chair in
   * that room would be inventing a loop nobody drew.
   */
  private flowCrewIds(
    sessionId: string,
    relays: readonly SessionRelay[],
  ): string[] {
    const ids = new Set(relays.map((relay) => relay.crewId))
    const memberships = this.crews.crewIdsForSession(sessionId)
    if (memberships.length > 0) {
      const withRelays = new Set(this.relays.crewIdsWithRelays())
      for (const crewId of memberships) {
        if (withRelays.has(crewId)) ids.add(crewId)
      }
    }
    return [...ids]
  }

  /**
   * The loop parked: a baton was handed on and no wire answered to it.
   *
   * `BATON: marcin` is the reserved terminal -- the station said the work is
   * his -- and anything else that nothing answers is an unrouted hand-off. Both
   * park, and both are LOUD, because a silent drop is its own defect: an
   * emitted baton that simply evaporated is exactly the failure this whole
   * feature was built to make impossible.
   *
   * Which is why the question asked here is whether the last line ATTEMPTED a
   * hand-off, not which name it handed on. `BATON:` with nobody after it names
   * nobody, so there is no baton to quote -- and reading that as "no
   * declaration" dropped it through the other door: nothing to route AND
   * nothing to hail about. The hail carries a null baton and says so in its
   * own sentence. Both answers come from the one decoder in `relay.pure`, so
   * the name and the attempt can never disagree about one line.
   *
   * Only on a settle that actually finished work, and only when the human did
   * not ask for quiet. A failed session already wrote `skipped-failed` on every
   * wire, and a quiet settle is the user's explicit instruction -- hailing over
   * either would be answering a question nobody asked.
   *
   * "Answered" is deliberately about the CONDITION, not about delivery. A wire
   * whose baton matched and then declined for a reason of its own -- the loop
   * law, an error, the round cap, which hail on their own -- did answer to the
   * baton, and the trail records what happened next. Hailing there too would
   * report the same beat twice under two different names.
   *
   * And it is answered PER CREW. Whether a baton reached anybody is a question
   * each crew answers about itself: one crew's wire matching cannot speak for
   * a second crew that was waiting on the same station and heard nothing.
   */
  private parkIfUnanswered(input: {
    event: SessionSettledEvent
    flowRunId: string
    crewIds: readonly string[]
    emittedBaton: string | null
    message: string | null
    answeredCrewIds: ReadonlySet<string>
  }): void {
    const { event, emittedBaton } = input
    const declaration = input.message
      ? readEmittedDeclaration(input.message)
      : ({ kind: 'none' } as const)
    if (declaration.kind === 'none') return
    if (event.relaysMuted || event.status !== 'completed') return

    const reason = emittedBaton === TERMINAL_BATON ? 'terminal' : 'unrouted'
    let raised = false
    for (const crewId of input.crewIds) {
      if (input.answeredCrewIds.has(crewId)) continue
      const hail = this.hails.raise({
        crewId,
        flowRunId: input.flowRunId,
        reason,
        sessionId: event.sessionId,
        baton: emittedBaton,
        message: input.message,
        detail: formatCrewHailDetail(reason, { baton: emittedBaton }),
      })
      raised = raised || hail !== null
    }
    if (raised) this.onHailsChanged?.()
  }

  /**
   * Every flow run that can still be consulted by the loop law: one this
   * engine is mid-settle on, or one whose baton is waiting on a session.
   *
   * `hasFiredInFlowRun` reads the ledger, so a trail cleared underneath one of
   * these runs would tell a wire it never fired and let a closed loop reopen.
   * These are the runs whose rows a clear has to leave alone.
   *
   * Batons live in memory, so a restart empties this and a chain interrupted
   * by one becomes clearable. That is the same direction the baton already
   * errs: a restarted chain resumes in a fresh run, where once-per-run governs
   * again -- worst case one extra hop, never a loop.
   */
  liveFlowRunIds(): string[] {
    return [...new Set([...this.runsInFlight.keys(), ...this.batons.values()])]
  }

  /**
   * The stall hail: a station took a crew's work and never came back.
   *
   * Driven from a timer in main rather than from a settle, because the whole
   * point is the settle that never arrives. A station that errors or hangs
   * produces no finish, so no wire fires, so nothing is written -- and a loop
   * that dies in silence is exactly the failure this feature exists to remove.
   * A loop is loud in both directions or it is not trustworthy.
   *
   * Everything that decides is pure (`findStalledStations`); this walks the
   * crews and hands each answer to the hail book, which refuses to file a
   * second call about the same accused hop -- open OR answered. So the tick
   * may run as often as it likes: one debt, one call, and only a NEW hop
   * re-arms the alarm, which is what "re-arms after the next hop" means.
   */
  checkForStalls(now: Date = new Date()): void {
    try {
      // The trail back to the live window's edge: nothing older can stall,
      // and everything inside it must be readable, because the question is
      // per STATION -- one newer refusal row or one healthy sibling must not
      // bury an older station that still owes work.
      const cutoff = new Date(now.getTime() - CREW_LIVE_WINDOW_MS).toISOString()
      let raised = false
      for (const crewId of this.relays.crewIdsWithRelays()) {
        const minutes = resolveStallMinutes(
          this.crews.getLoopLimits(crewId)?.stallMinutes ?? null,
        )
        // Several stations may hail in one tick -- a fan-out can hang two at
        // once -- and the hail book already refuses a duplicate of each
        // accused hop.
        for (const stalled of findStalledStations({
          hops: this.relays.listRecentHops(crewId, cutoff),
          now,
          stallMinutes: minutes,
        })) {
          const hail = this.hails.raise({
            crewId,
            flowRunId: stalled.flowRunId,
            reason: 'stall',
            sessionId: stalled.sessionId,
            // The debt's identity: an answered call about THIS hop stays
            // answered, and only a new hop re-arms (MAR-2759).
            hopId: stalled.hopId,
            // The fate rides with it: a station that came back broken is loud
            // for a different reason than one that never came back at all, and
            // calling a failure "quiet" would be the sentence lying.
            detail: formatCrewHailDetail('stall', {
              minutes,
              fate: stalled.fate,
            }),
          })
          raised = raised || hail !== null
        }
      }
      if (raised) this.onHailsChanged?.()
    } catch (error) {
      // Driven from a timer, so a throw here would take the interval with it
      // and the app would lose stall hails silently for the rest of its life.
      console.error('[relay] stall check failed', error)
    }
  }

  /**
   * Raises one call and tells the windows, or stays silent because the book
   * refused a duplicate. One place, so a raising site cannot forget the second
   * half and leave a hail nobody sees until the next broadcast.
   */
  private raiseHail(input: RaiseCrewHailInput): void {
    if (this.hails.raise(input)) this.onHailsChanged?.()
  }

  private enterRun(flowRunId: string): void {
    this.runsInFlight.set(
      flowRunId,
      (this.runsInFlight.get(flowRunId) ?? 0) + 1,
    )
  }

  private leaveRun(flowRunId: string): void {
    const carrying = this.runsInFlight.get(flowRunId) ?? 0
    if (carrying <= 1) this.runsInFlight.delete(flowRunId)
    else this.runsInFlight.set(flowRunId, carrying - 1)
  }

  /** Records the opener dispatch whose settle will be plumbing, not work. */
  private expectPlumbingSettle(dispatchId: string): void {
    this.plumbingDispatchIds.add(dispatchId)
  }

  /**
   * Whether this settle is ONLY an opener's turn ending: it names at least
   * one id, and every id it names is a held opener's. Each opener claim is
   * consumed as it is recognised -- one opener, one plumbing beat. A settle
   * naming none of ours is somebody's work, however many openers are still
   * pending elsewhere. An opener never shares a turn (design X), so a settle
   * naming an opener's id beside anything else is not a case this build
   * produces; the general form stays because it is the honest reading of
   * the set, not because that case is expected.
   */
  private takePlumbingSettle(dispatchIds: readonly string[]): boolean {
    if (dispatchIds.length === 0) return false
    let onlyPlumbing = true
    for (const dispatchId of dispatchIds) {
      if (!this.plumbingDispatchIds.delete(dispatchId)) onlyPlumbing = false
    }
    return onlyPlumbing
  }

  /**
   * Runs one wire against one settle, and answers whether the wire ANSWERED
   * the baton -- its condition was satisfied -- not whether anything was
   * delivered. The caller needs the first question to know whether a baton
   * evaporated; the ledger already answers the second.
   */
  private async fire(
    relay: SessionRelay,
    event: SessionSettledEvent,
    flowRunId: string,
    message: string | null,
    emittedBaton: string | null,
  ): Promise<boolean> {
    let roundNumberForHop: number | null = null
    const record: RecordHopFn = (
      outcome: RelayHopOutcome,
      extra: RecordHopExtra = {},
    ) => {
      const hop = this.relays.appendHop({
        relayId: relay.id,
        crewId: relay.crewId,
        flowRunId,
        sourceSessionId: event.sessionId,
        triggerStatus: event.status,
        targetSessionId: extra.targetSessionId ?? relay.targetSessionId,
        spawnedSessionId: extra.spawnedSessionId ?? null,
        payloadPreview: extra.payloadPreview ?? null,
        // Written on every row, fired or refused: "what did it say, and what
        // did my wire do about it" has to be answerable from the trail alone.
        baton: emittedBaton,
        // Null until the round meter is read, which is deliberate: the mute
        // and failure rows above it are facts about the settle, not rounds of
        // a loop. Everything from the meter down carries its number.
        roundNumber: roundNumberForHop,
        dispatchId: extra.dispatchId ?? null,
        outcome,
        error: extra.error ?? null,
      })
      // A budgeted outcome is the one proof that a session actually received
      // work in this run, so it is also the only thing that hands on a baton.
      // Reusing the budget's own vocabulary keeps the two from drifting: a
      // hop that spends a turn is exactly a hop that continues the chain.
      // The baton is keyed by the landing dispatch id, so only the settle
      // that consumed THIS work can take the run onward -- and a second
      // dispatch into the same session leaves a second baton beside it
      // rather than over it.
      if (isBudgetedOutcome(outcome) && extra.dispatchId) {
        this.batons.set(extra.dispatchId, flowRunId)
      }
      this.onHopAppended?.(hop)
    }

    // A disarmed wire is a switch at rest, not a firing. "No silent hops"
    // guards deliveries the user cannot see -- it was never a promise to
    // journal every session that finishes near a switched-off wire, and doing
    // so buried the real rows under noise.
    if (!relay.armed) return false

    // The quiet send (F10). Checked here, ahead of every guard below it,
    // because everything after `armed` is a fact about the flow's state while
    // this is the human's explicit instruction about this settle -- so it
    // outranks them, the ledger says what they actually did, and the row count
    // stays predictable: one quiet settle with N armed wires writes exactly N
    // rows, always. Behind the `armed` guard rather than ahead of it, because a
    // switch at rest is not a firing and a mute is not the switch's state.
    if (event.relaysMuted) {
      record('skipped-muted', { error: MUTED_MESSAGE })
      return false
    }

    // v1 fires on completion only. A failure still writes a row, because
    // "my wire did not fire" must always have a visible answer.
    if (event.status !== 'completed') {
      record('skipped-failed', {
        error: 'The source session failed, so nothing was carried.',
      })
      return false
    }

    // The round this hop belongs to, fixed here -- above every guard that
    // records a row -- so the number the ledger records, the number a refusal
    // names and the number the receiving station reads are one value rather
    // than three computations free to disagree. Counted inside this crew,
    // because the cap it feeds is the crew's own: a session in two crews would
    // otherwise spend one crew's rounds against the other's budget.
    //
    // Below the mute and the failure guard on purpose: those two rows are
    // facts about the settle rather than beats of a loop, and stamping them
    // with a round would claim they belonged to one.
    const crewSpentHops = this.relays.countBudgetedHopsInCrew(
      relay.crewId,
      flowRunId,
    )
    roundNumberForHop = roundNumber(crewSpentHops)

    // The reserved terminal (MAR-2759). Above the condition gate, because it
    // outranks ROUTING and not merely conditions: an unconditional wire
    // answers every message, so a terminal that only beat conditioned wires
    // would deliver the one route guaranteed to reach a human onward and leave
    // the chair dark. Unanswered by construction -- no wire may carry it --
    // which is what makes `parkIfUnanswered` raise the terminal hail.
    if (emittedBaton === TERMINAL_BATON) {
      record('skipped-baton', { error: TERMINAL_BATON_MESSAGE })
      return false
    }

    // The baton (MAR-2759). Above the loop law and the budgets because those
    // are questions about a wire that is a candidate, and this is the question
    // of whether it is one at all -- a wire waiting for a route the message
    // never named has not fired, so it must not read as one that was stopped.
    //
    // Below the mute and the failure for the mirror reason: both of those are
    // facts about the settle that outrank anything the message says.
    //
    // A wire with no condition matches everything, exactly as every wire drawn
    // before conditions existed did.
    const conditionToken = relay.conditionToken
    if (
      conditionToken !== null &&
      !relayConditionMatches(conditionToken, message ?? '')
    ) {
      record('skipped-baton', {
        error: batonMismatchMessage(conditionToken, message ?? ''),
      })
      return false
    }

    // The loop law. A chain that comes back round to a wire it already used
    // has finished, so the wire declines and stays armed for the next run --
    // A -> B -> A ends at two real hops, and a cyclic crew therefore closes
    // exactly one lap per run. This is not a failure, which is why it disarms
    // nothing and reads grey in the trail.
    //
    // But if a baton was RIDING, the station handed work to a wire that cannot
    // carry it, and a chain that stops there has parked. So the row stays grey
    // and the chair is called: a silent stop is the defect class, whoever
    // stops it. Lap two is not a patch to make here -- it is an explicit
    // lap model, its own ticket, after a design talk.
    if (this.relays.hasFiredInFlowRun(relay.id, flowRunId)) {
      record('skipped-already-fired', { error: ALREADY_FIRED_MESSAGE })
      if (emittedBaton !== null) {
        this.raiseHail({
          crewId: relay.crewId,
          flowRunId,
          reason: 'loop-closed',
          sessionId: event.sessionId,
          baton: emittedBaton,
          message,
          detail: formatCrewHailDetail('loop-closed', { baton: emittedBaton }),
        })
      }
      return true
    }

    // The round budget (MAR-2759). Ahead of the hop budget because it is the
    // smaller of the two by default, and unlike it this refusal disarms
    // nothing: a loop that has gone a long way needs a human looking at it,
    // not a switch thrown behind its back. Marcin is hailed in the same beat,
    // because a wire that quietly held would be a loop that died in silence.
    const roundCap = resolveRoundCap(
      this.crews.getLoopLimits(relay.crewId)?.roundCap ?? null,
    )
    if (!hasRoundBudget(crewSpentHops, roundCap)) {
      record('skipped-round-budget', { error: roundBudgetMessage(roundCap) })
      this.raiseHail({
        crewId: relay.crewId,
        flowRunId,
        reason: 'round-budget',
        sessionId: event.sessionId,
        baton: emittedBaton,
        message,
        detail: formatCrewHailDetail('round-budget', { cap: roundCap }),
      })
      return true
    }

    // Kept as a backstop behind the loop law rather than instead of it: it is
    // the only guard left if a future trigger finds a way to mint runs faster
    // than a chain consumes them. It survives the round cap because a crew may
    // set a cap above it, and because this one disarms -- the two guards answer
    // "this loop needs eyes" and "this wire has run away" differently. It
    // counts the whole RUN, across every crew, because a runaway chain is a
    // runaway however many rooms it passes through.
    const runSpentHops = this.relays.countBudgetedHops(flowRunId)
    if (!hasFlowRunBudget(runSpentHops)) {
      this.relays.setArmed(relay.id, false)
      this.onRelaysChanged?.()
      record('skipped-budget', { error: flowRunBudgetMessage(runSpentHops) })
      return true
    }

    if (!message) {
      record('error', {
        error: 'The session finished without an assistant message to carry.',
      })
      return true
    }

    // Compiled once, here, so both actions send the same thing and the ledger
    // records what was actually sent rather than what the session happened to
    // say. A wire with no instruction compiles to the message untouched.
    const payload = compileRelayPayload(
      relay.instruction,
      message,
      roundNumberForHop,
    )
    // The opener is never compiled into the payload -- it is a separate send,
    // and an instruction glued onto a `/clear` would stop it being a command.
    // It appears in the preview because the ledger must name both beats.
    const payloadPreview = buildRelayHopPreview(relay.opener, payload)

    if (relay.action === 'spawn') {
      await this.spawn(relay, payload, payloadPreview, record)
      return true
    }

    const targetSessionId = relay.targetSessionId
    if (!targetSessionId) {
      record('error', { payloadPreview, error: 'This relay has no target.' })
      return true
    }

    const target = this.sessions.getById(targetSessionId)
    if (!target) {
      record('error', {
        payloadPreview,
        error: 'The target session no longer exists.',
      })
      return true
    }

    // Read before sending: SessionService decides on its own whether a running
    // target queues the text or takes it as a mid-run follow-up, and the
    // ledger should say which of the two the user is waiting on.
    const targetWasRunning = target.status === 'running'

    const opener = relay.action === 'hail' ? relay.opener : null

    try {
      if (opener) {
        const receipt = await this.sessions.sendMessageWithOpener(
          targetSessionId,
          {
            opener,
            text: payload,
            providerAccountId: this.resolveInheritedAccountId(target),
          },
        )
        // The settle that names the opener's id is our own plumbing, not the
        // end of any work. Claimed before the ledger row so the baton
        // survives it.
        this.expectPlumbingSettle(receipt.openerDispatchId)
        // Always queued, never delivered: the payload waits behind the opener
        // by construction, whatever the target was doing when this fired. Its
        // receipt rides the hop, so only the settle that consumed the payload
        // itself -- not the opener's, not a turn already running -- can stamp
        // it, on this run or after a restart.
        record('queued', {
          payloadPreview,
          dispatchId: receipt.payloadDispatchId,
        })
        return true
      }

      const dispatchId = await this.sessions.sendMessage(targetSessionId, {
        text: payload,
        providerAccountId: this.resolveInheritedAccountId(target),
      })
      // A payload queued behind a running turn is answered by its OWN settle,
      // not that turn's -- and the receipt on the hop is what says which one
      // that is, wherever the session layer put the input (native follow-up
      // into the running turn included: its settle names this id too).
      record(targetWasRunning ? 'queued' : 'delivered', {
        payloadPreview,
        dispatchId,
      })
    } catch (error) {
      record('error', {
        payloadPreview,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return true
  }

  /**
   * Which account a hop into an existing session should ride.
   *
   * The session's own, inherited from its last turn -- a relay is another turn
   * in a conversation already under way, not a new relationship, so it should
   * not change who is paying for it. Falls back to the enrolled default, and
   * finally to ambient, which is what every hop did before this existed.
   */
  private resolveInheritedAccountId(session: {
    id: string
    providerId: string
    executionHost: string
  }): string | null {
    return resolveAccountForAutomaticTurn({
      executionHost: session.executionHost,
      lastTurnAccountId: this.sessions.getLastTurnProviderAccountId(session.id),
      accounts: this.accounts.listByProvider(session.providerId),
    })
  }

  /**
   * Which account a session this wire is about to open should be born on.
   *
   * The wire's own choice wins; otherwise the enrolled default for the provider
   * it names. This has to be right at birth: Codex fixes a session's credential
   * when its first turn starts and refuses to change it afterwards, so there is
   * no correcting a spawn that came up on the wrong account.
   */
  private resolveSpawnAccountId(spec: RelaySpawnSpec): string | null {
    if (spec.providerAccountId) return spec.providerAccountId

    return resolveAccountForAutomaticTurn({
      // A spawn opens a local session; nothing in a spawn spec can ask for a
      // remote host today.
      executionHost: 'local',
      lastTurnAccountId: null,
      accounts: this.accounts.listByProvider(spec.providerId),
    })
  }

  /**
   * Opens a brand new session and starts it on the payload.
   *
   * The spawned session joins the crew that owns the wire. A session that
   * appeared from a relay but sat outside the crew would show up in the room
   * with no visible reason for existing -- close enough to a silent hop to be
   * worth the membership row.
   *
   * Creation and start are recorded separately on purpose: a session that was
   * created but failed to start still exists, and the ledger must name it so
   * the user can find the thing that is now sitting in their room.
   */
  private async spawn(
    relay: SessionRelay,
    payload: string,
    payloadPreview: string | null,
    record: RecordHopFn,
  ): Promise<void> {
    const spec = relay.spawnSpec
    if (!spec) {
      record('error', {
        payloadPreview,
        error: 'This spawn relay has no session spec.',
      })
      return
    }

    let spawnedSessionId: string
    try {
      const created = this.sessions.create(
        spec.projectId
          ? {
              contextKind: 'project',
              projectId: spec.projectId,
              workspaceId: null,
              providerId: spec.providerId,
              model: spec.model,
              effort: spec.effort as CreateSessionInput['effort'],
              name: spec.name,
            }
          : {
              contextKind: 'global',
              providerId: spec.providerId,
              model: spec.model,
              effort: spec.effort as CreateSessionInput['effort'],
              name: spec.name,
            },
      )
      spawnedSessionId = created.id
    } catch (error) {
      record('error', {
        payloadPreview,
        error: `Could not open the session: ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
      return
    }

    try {
      this.crews.addMember(relay.crewId, spawnedSessionId)
      this.onCrewsChanged?.()
    } catch {
      // Membership is a convenience, not the hop. A spawn that could not join
      // its crew is still a spawn, and the ledger names the session either way.
    }

    try {
      const dispatchId = await this.sessions.start(spawnedSessionId, {
        text: payload,
        providerAccountId: this.resolveSpawnAccountId(spec),
      })
      record('spawned', { spawnedSessionId, payloadPreview, dispatchId })
    } catch (error) {
      record('error', {
        spawnedSessionId,
        payloadPreview,
        error: `Opened the session but could not start it: ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
    }
  }
}
