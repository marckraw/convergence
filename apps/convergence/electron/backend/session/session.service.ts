import type { ConversationPrefix } from '../../../src/entities/session/conversation-prefix.pure'
import { recordConversationRead } from '../perf/perf-probe.service'
import { HandoffRefusedError } from '../provider/provider-account-handoff.pure'
import type { InitialDispatchReceipt } from '../provider/provider.types'
import { readSessionTurnTimings } from './session-timing.service'
import { CONVERSATION_RESET_COMMAND } from '../../../src/shared/lib/conversation-reset.pure'
import {
  readStaleResetFromQueue,
  STALE_RESET_NOTE_EVENT_TYPE,
  STALE_RESET_ROW_ERROR,
  staleResetNoteText,
} from './session-stale-reset.pure'
import { randomUUID } from 'crypto'
import { answerWindowResult } from './answer-window.pure'
import { HarnessEvidenceService } from './harness-evidence.service'
import type { ParallelWorkCounts } from '../../../src/shared/lib/parallel-work.pure'
import { mkdirSync } from 'fs'
import Database from 'better-sqlite3'
import type { ExecutionSessionWorkspace } from '@mrck-labs/execution-host-protocol'
import type {
  ConversationItemRow,
  SessionRow,
} from '../database/database.types'
import type { RemoteSessionWorkspaceInfo } from '@convergence/execution-host-client'
import type {
  ExecutionHostProviderCapabilities,
  ProviderExecutionHost,
} from '../provider/execution-host/execution-host.types'
import type { RemoteExecutionHostRegistry } from '../provider/execution-host/remote-execution-host.types'
import {
  describeMissingExecutionHostEndpoint,
  isLocalExecutionHost,
  isRemoteExecutionHost,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
} from '../execution-host-endpoint/execution-host-endpoint.pure'
import { ExecutionHostEndpointRepository } from '../execution-host-endpoint/execution-host-endpoint.repository'
import {
  namesAConcreteWorkPlace,
  type SessionWorkAddress,
} from '../../../src/shared/lib/work-address.pure'
import { REMOTE_SPAWN_PLACE_REQUIRED } from '../../../src/shared/lib/spawn-spec.pure'
import { assertLocalAccountSelection } from '../provider-account/provider-account-resolution.pure'
import { remoteProviderIdForLocalProvider } from '../provider/execution-host/remote-execution-host.pure'
import type {
  Attachment,
  MidRunInputMode,
  SessionHandle,
  SendMessageDisposition,
  SessionStatus,
  AttentionState,
  ActivitySignal,
  ProviderContextManagementResult,
} from '../provider/provider.types'
import {
  isProviderBusyError,
  ProviderBusyError,
  SessionCompactingError,
} from '../provider/provider.types'
import type { BusyWaitReason } from '../provider/provider.types'
import {
  getMidRunInputCapabilityForProviderId,
  providerSupportsConversationReset,
  parseReasoningEffort,
  supportsMidRunInputMode,
} from '../provider/provider-descriptor.pure'
import type { AttachmentsService } from '../attachments/attachments.service'
import type { SkillSelection } from '../skills/skills.types'
import {
  sessionSummaryFromRow,
  type ExecutionHostSessionCount,
  type Session,
  type SessionSummary,
  type CreateSessionInput,
  type AcceptedRecordingFailureEvent,
  type AcceptedRecordingFailureListener,
  type DispatchTerminalEvent,
  type DispatchTerminalListener,
  type DispatchRedeliveredEvent,
  type DispatchRedeliveredListener,
  type QueuedInputPatchEvent,
  type SessionQueuedInput,
  type SessionSettledEvent,
  type SessionSettledListener,
} from './session.types'
import { buildRecordingFailedNoteText } from '../../../src/shared/lib/accepted-recording-note.pure'
import type {
  ConversationItem,
  ConversationItemDraft,
  ConversationPatchEvent,
  InteractionResponse,
  SessionDelta,
} from './conversation-item.types'
import {
  conversationItemFromRow,
  conversationItemToInsertRow,
} from './conversation-item.pure'
import type { TurnCaptureService } from './turn/turn-capture.service'
import type { TurnDelta } from './turn/turn-capture.service'
import type { SessionContextInjectionService } from './context-injection/session-context-injection.service'
import { SessionRepository } from './session.repository'
import { CONVERSATION_PATCH_FLUSH_MS } from './session.constants'
import {
  describeModelSelectionRefusal,
  describeProviderIdentityRefusal,
  hasNoTurnSinceLastBoundary,
  isAttentionRequestSummary,
  isTerminalSessionStatus,
  previousAssistantMessageTexts,
  resolveAttentionRequestKind,
  RecordingError,
  type AttentionRequestRowLike,
} from './session.pure'
import {
  MODEL_CHANGED_EVENT_TYPE,
  describeModelChange,
} from './session-model-change.pure'
import {
  SessionDispatchRegistry,
  type SessionDispatch,
} from './session-dispatch-registry'
import { SessionQueuedInputService } from './session-queued-input.service'
import {
  SessionLivenessService,
  type SessionLivenessNoteKind,
} from './session-liveness.service'

interface AttentionRequestRow extends AttentionRequestRowLike {
  session_id: string
}

/**
 * What a send door is allowed to walk past (MAR-3255 R2).
 *
 * Separate from `SendMessageInput` on purpose: this is not a property of the
 * message, it is a statement about WHO is sending -- and the one caller that
 * may say it is a method on this service, not anything a renderer can reach.
 */
interface DispatchDoorOptions {
  /** Only `sendDrillBeat`. The drill's own beats run inside its own hold. */
  passesQueueHold?: boolean
}

export interface SendMessageInput {
  text: string
  attachmentIds?: string[]
  skillSelections?: SkillSelection[]
  deliveryMode?: MidRunInputMode
  interactionResponse?: InteractionResponse
  /**
   * Only consumed by `start`. Replaces the session's attached project context
   * items before computing the boot-injected block. Pass an empty array to
   * clear; omit to leave existing attachments unchanged.
   */
  contextItemIds?: string[]
  /**
   * Provider account to serve the turn this message starts (ADR 0007, PA4).
   * Omitted or null means the ambient default account. The composer's current
   * selection is not authoritative — this is, per turn.
   */
  providerAccountId?: string | null
  /**
   * Sends the text exactly as written, with no project-context block in front
   * of it (F9).
   *
   * The seam exists for one caller: the relay engine's opener. Every-turn
   * re-injection prepends a block, and a message that no longer STARTS with
   * `/` stops being a command -- the CLI reads it as prose and the recycled
   * worker never gets wiped. Nothing a person types sets this, and no other
   * caller should: a turn that quietly loses its project context is a bug
   * everywhere except here, where the whole point is that the context is
   * about to be thrown away.
   */
  skipContextInjection?: boolean
  /**
   * Asks for quiet on this session's next settle: the wires leaving it will
   * not fire when the work in flight finishes (F10, MAR-2537).
   *
   * Scoped to the SETTLE, not to this message. Any other message contributing
   * to the same finished work is covered too, and there is no way to ask for
   * quiet for one of two messages that end together -- mute wins ties on
   * purpose, because erring quiet costs one manual hail while erring loud
   * spends provider quota and wakes another agent mid-work.
   *
   * Never sticky: the settle that honours the request also clears it, so the
   * session comes back armed and omitting this is always "fire as usual". A
   * session bound to a flow is meant to fire; the exception is the gesture --
   * an ad-hoc question, a typed `/clear`, a typed `/compact`.
   *
   * Deliberately explicit. Convergence does not sniff the text for slash
   * commands and mute on its own; a wire that stops firing for reasons the
   * user did not ask for is worse than one that fires when they forgot.
   */
  muteRelays?: boolean
}

export interface SessionNamer {
  generateName(
    session: SessionSummary,
    conversation: ConversationItem[],
    options: { requestId?: string; providerAccountId: string | null },
  ): Promise<string | null>
}

export interface SessionAttentionObserver {
  onAttentionTransition(
    prev: AttentionState,
    next: AttentionState,
    session: Session,
  ): void
}

interface PendingConversationPatch {
  sessionId: string
  itemId: string
  patch: Partial<ConversationItem>
}

/**
 * The host's answer to "may this turn run?", carried instead of thrown
 * (MAR-2682).
 *
 * A caller that has to decide *after* an `await` whether the answer even
 * applies cannot ask a question that throws: the throw would settle the turn
 * before the state the decision depends on has been read. The refusal is kept
 * exactly as the host raised it -- not remade into a new `Error` -- so the
 * message the user sees is the daemon's own, whichever caller rethrows it.
 */
type TurnProviderVerdict =
  | { permitted: true }
  | { permitted: false; refusal: unknown }

/**
 * The place a remote session is being born with, or a refusal (MAR-2689).
 *
 * The third of three doors, and the innermost: the composer will not let a send
 * leave without a place and the IPC handler will not let a malformed one
 * through, but this is the one every caller of `create` passes, so this is
 * where the rule actually lives. A remote session is born with a concrete place
 * or not at all.
 *
 * `unknown` is refused here as firmly as absence, and that is the point of the
 * value: it belongs to rows the migration backfilled, written before any of
 * this existed. Nothing in this app may mint one. That is what makes the legacy
 * branch of `requireRemoteWorkPlace` -- deriving a repository from the session's
 * own project, silently, which is how a daemon came to clone Convergence itself
 * -- unreachable for anything born from here.
 *
 * *Concrete* is asked of `namesAConcreteWorkPlace` and not spelled out here,
 * because the IPC door asks the identical question of the identical value. Two
 * spellings of one rule drift, and the half that drifted would be the half that
 * writes a place into the record: this door once accepted an empty clone URL
 * and a blank label because it only checked the mode (MAR-2689 round 2).
 */
function requireStatedWorkAddress(
  address: SessionWorkAddress | null | undefined,
): SessionWorkAddress {
  if (address && namesAConcreteWorkPlace(address)) return address
  throw new Error(REMOTE_SPAWN_PLACE_REQUIRED)
}

/**
 * Facade and orchestrator for session use cases.
 *
 * Keeps the public session API in one place while delegating focused concerns
 * such as queued input persistence, liveness, repository storage, turn capture,
 * and context injection to collaborators.
 */
export class SessionService {
  private agentMeterListener?: (id: string, handle?: SessionHandle) => void

  setAgentMeterListener(
    listener: (id: string, handle?: SessionHandle) => void,
  ): void {
    this.agentMeterListener = listener
  }

  private activeHandles = new Map<string, SessionHandle>()
  private pendingHandleDisposals = new Set<Promise<void>>()
  /**
   * Handles that joined a run which had already come to rest, and so have no
   * run of their own to end yet (MAR-2582).
   *
   * A handle leaves this set the moment the session it joined reports itself
   * moving again -- from then on the run is its own and its terminal events
   * end it.
   *
   * Membership is half of a predicate, never the whole of one: it says a
   * handle has not begun its run, which is not the same as saying an event it
   * carries belongs to someone else's. `handleLifecycle` reads it together
   * with where the event came from.
   */
  private handlesAwaitingTheirRun = new WeakSet<SessionHandle>()
  private activeTurnIds = new Map<string, string>()
  private pendingConversationPatches = new Map<
    string,
    PendingConversationPatch
  >()
  private pendingConversationPatchTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >()
  private onEvidenceUpdate: ((event: { sessionId: string }) => void) | null =
    null
  private readonly evidenceCounts: HarnessEvidenceService
  private readonly beforeQueueDrainGuards = new Set<
    (sessionId: string) => boolean
  >()

  /** Synchronous turn-boundary interception: true means the caller holds the queue. */
  onBeforeQueueDrain(guard: (sessionId: string) => boolean): () => void {
    this.beforeQueueDrainGuards.add(guard)
    return () => {
      this.beforeQueueDrainGuards.delete(guard)
    }
  }
  private parallelWorkCounts = new Map<string, ParallelWorkCounts>()
  private evidenceUpdateTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >()

  private onSummaryUpdate: ((summary: SessionSummary) => void) | null = null
  private onConversationPatch:
    | ((event: ConversationPatchEvent) => void)
    | null = null
  private onTurnDelta: ((sessionId: string, delta: TurnDelta) => void) | null =
    null
  private attachments: AttachmentsService | null = null
  private namer: SessionNamer | null = null
  private attentionObserver: SessionAttentionObserver | null = null
  private turnCapture: TurnCaptureService | null = null
  private contextInjection: SessionContextInjectionService | null = null
  private onSessionTerminated: ((sessionId: string) => void) | null = null
  private readonly sessionSettledListeners = new Set<SessionSettledListener>()
  private readonly pullRequestHintListeners = new Set<
    (sessionId: string) => void
  >()
  private readonly dispatchTerminalListeners =
    new Set<DispatchTerminalListener>()
  private readonly dispatchRedeliveredListeners =
    new Set<DispatchRedeliveredListener>()
  private readonly acceptedRecordingFailureListeners =
    new Set<AcceptedRecordingFailureListener>()
  /**
   * The dispatch ids of the most recent settled turn, kept because a
   * recording write can land after its settle already consumed the set — the
   * Codex post-ack stamp is the witness (MAR-3023).
   */
  private readonly lastSettledTurn = new Map<
    string,
    { dispatchIds: string[]; turnId: string | null }
  >()
  /**
   * A turn id minted for a user message whose row could not be written
   * (MAR-3023 F). Minted in memory before the write, so the turn's later
   * items — and the boundary's note — carry the turn they belong to instead
   * of inheriting the previous turn's id from the last row that did land.
   * Held until the next user message is recorded.
   */
  private readonly unrecordedTurnIds = new Map<string, string>()
  /**
   * Queued inputs a turn accepted whose 'sent' mark could not be written
   * (MAR-3023 G): session id -> queued input ids, re-attempted at the turn's
   * settle, the next write this session makes to the same database.
   */
  private readonly unmarkedSentInputs = new Map<string, Set<string>>()
  private pendingSettleEvents: SessionSettledEvent[] = []
  private settleFlushScheduled = false
  private quitting = false
  private readonly retainingStoppedInputs = new Set<string>()
  private readonly compactingSessions = new Set<string>()
  /**
   * Sessions whose current turn is a conversation reset (MAR-3298 R2).
   *
   * Set only by `markResetInFlight`, which both doors call as a reset leaves
   * for the provider -- `withDispatchInFlight` (a direct send) and
   * `sendQueuedRow` (a row leaving the queue, MAR-3307); cleared on the next
   * lifecycle (or on hand Stop, which must not drain).
   * Distinguishes a reset's `failed` from a plain turn's without reading the
   * provider's note text.
   */
  private readonly resetsInFlight = new Set<string>()
  /**
   * Conversations whose queue is being held open by a routine (MAR-3255 R2).
   *
   * A second reason for the same door compaction already uses, and
   * deliberately a SEPARATE set: a hold lasts across three beats -- a turn,
   * a compaction, another turn -- and during the middle one the session is
   * compacting too. One set could not say which of the two is over.
   *
   * In memory only, and it fails OPEN: if the app quits mid-drill the hold is
   * gone on the next start while the rows it was holding are still `queued`.
   * Nothing drains them at boot -- `recoverDispatching` only rewrites rows
   * caught `dispatching` -- so they wait exactly as any queued row that
   * outlived a quit does, and the next drain on that session delivers them:
   * its next settle, or the next message sent into it. The other direction
   * would be a hold nobody can lift.
   */
  private readonly heldSessions = new Set<string>()
  private readonly pendingAccountHandoffs = new Set<string>()
  /**
   * True only while the constructor heals running/answered sessions left by
   * the previous app run. Those settles are bookkeeping about a process that is already
   * gone, not sessions finishing now, and must never fire relays at boot.
   */
  private recoveringStaleSessions = false
  private remoteExecutionHosts: RemoteExecutionHostRegistry | null = null
  private remoteWorkspaceSourceResolver:
    | ((workingDirectory: string) => { repository: string } | null)
    | null = null
  private readonly sessionRepository: SessionRepository
  private readonly executionHostEndpoints: ExecutionHostEndpointRepository
  private readonly queuedInputs: SessionQueuedInputService
  private readonly liveness: SessionLivenessService
  /**
   * Sends that have begun but have not yet reached a provider. Everything that
   * must not run while a session is busy asks here as well as at
   * `activeHandles`, because between them is a window where neither knows
   * (MAR-2550).
   */
  private readonly dispatches = new SessionDispatchRegistry()

  constructor(
    private db: Database.Database,
    private executionHost: ProviderExecutionHost,
    private globalWorkingDirectory: string = process.cwd(),
  ) {
    this.evidenceCounts = new HarnessEvidenceService(db)
    this.sessionRepository = new SessionRepository(db)
    this.executionHostEndpoints = new ExecutionHostEndpointRepository(db)
    this.queuedInputs = new SessionQueuedInputService(db)
    this.liveness = new SessionLivenessService({
      isOpen: () => this.db.open,
      getSummary: (sessionId) => this.getSummaryById(sessionId),
      emitNote: (sessionId, kind) => this.emitLivenessNote(sessionId, kind),
    })
    this.recoveringStaleSessions = true
    try {
      this.recoverStaleRunningSessions()
    } finally {
      this.recoveringStaleSessions = false
    }
    this.queuedInputs.recoverDispatching()
  }

  setTurnCaptureService(service: TurnCaptureService): void {
    this.turnCapture = service
    service.setTimingListener((sessionId) =>
      this.notifySummaryUpdated(sessionId),
    )
    service.setDeltaEmitter((sessionId, delta) => {
      this.onTurnDelta?.(sessionId, delta)
    })
  }

  setTurnDeltaListener(
    listener: (sessionId: string, delta: TurnDelta) => void,
  ): void {
    this.onTurnDelta = listener
  }

  setSessionContextInjectionService(
    service: SessionContextInjectionService,
  ): void {
    this.contextInjection = service
  }

  setAttachmentsService(service: AttachmentsService): void {
    this.attachments = service
  }

  setNamer(namer: SessionNamer): void {
    this.namer = namer
  }

  setAttentionObserver(observer: SessionAttentionObserver): void {
    this.attentionObserver = observer
  }

  /**
   * Supplies the Endpoint-keyed registry remote sessions resolve through. A
   * registry rather than a host, because which machine a session runs on is
   * the session's own recorded fact (MAR-2620).
   */
  setRemoteExecutionHosts(registry: RemoteExecutionHostRegistry): void {
    this.remoteExecutionHosts = registry
    this.resumeRunningRemoteSessions()
  }

  /**
   * Supplies the workspace materialization source for remote sessions: given
   * the session's local working directory, return the repository the remote
   * host should clone (or null when the directory has no usable remote).
   */
  setRemoteWorkspaceSourceResolver(
    resolver: (workingDirectory: string) => { repository: string } | null,
  ): void {
    this.remoteWorkspaceSourceResolver = resolver
  }

  /**
   * Picks the execution host and host-side provider id for a session.
   * Sessions always store the local provider id; remote execution translates
   * it to the daemon's provider namespace at this boundary.
   *
   * A session names the Endpoint it runs on, and that Endpoint must still
   * exist. Falling back to whichever daemon is configured would be the worst
   * outcome this era can produce -- a session quietly running on a machine it
   * never named, with its own record still asserting the old one -- so a
   * missing Endpoint refuses instead (MAR-2620).
   *
   * The host comes back keyed by that same id. Checking the id and then
   * handing back an ambient host would answer "is this Endpoint known?" when
   * the question is "will this run where it says?" -- two questions that agree
   * exactly until a second Endpoint exists, which is the era this slice opens.
   * Every remote call a session makes goes through here for that reason; there
   * is no other way to reach a remote host from a session id.
   */
  private resolveExecution(
    session: Pick<SessionSummary, 'executionHost' | 'providerId'>,
  ): { host: ProviderExecutionHost; providerId: string } {
    if (isLocalExecutionHost(session.executionHost)) {
      return { host: this.executionHost, providerId: session.providerId }
    }

    const endpoint = this.executionHostEndpoints.getById(session.executionHost)
    if (!endpoint) {
      throw new Error(
        describeMissingExecutionHostEndpoint(session.executionHost),
      )
    }

    if (!this.remoteExecutionHosts) {
      throw new Error('Remote execution host is not configured')
    }
    // Namespace translation only. Whether that daemon runs this provider is
    // that daemon's answer, given by the host when it checks its own listing --
    // a table here saying "unsupported" would be this process guessing about a
    // machine it never asked (MAR-2682).
    return {
      host: this.remoteExecutionHosts.hostFor(endpoint.id),
      providerId: remoteProviderIdForLocalProvider(session.providerId),
    }
  }

  /**
   * Waits for the Endpoint's provider listing before a turn is dispatched to
   * it (MAR-2620).
   *
   * The listing is a round trip to the daemon that begins when the host is
   * built, and `start()` reads its result synchronously. An Endpoint added
   * after boot -- or reached in the seconds after Convergence starts -- would
   * otherwise have its first turn refused for a provider that daemon has, one
   * round trip before it would have worked. This awaits the request already in
   * flight; it adds no retry and no sleep.
   *
   * A session naming an Endpoint that no longer exists returns quietly, so
   * `resolveExecution` still gives that refusal rather than this raising a
   * connection error about a machine that is not configured at all.
   */
  private async awaitEndpointListing(
    session: Pick<SessionSummary, 'executionHost'>,
  ): Promise<void> {
    if (isLocalExecutionHost(session.executionHost)) return
    if (!this.remoteExecutionHosts) return
    const endpoint = this.executionHostEndpoints.getById(session.executionHost)
    if (!endpoint) return
    await this.remoteExecutionHosts.whenReady(endpoint.id)
  }

  /**
   * The host's permission to run this session's provider, asked before the turn
   * it belongs to writes anything (MAR-2682).
   *
   * One preflight sequence for both entry points -- this method for
   * `openFirstTurn`, and `queryTurnProviderVerdict` below it for
   * `deliverMessage`, which must hold the answer rather than be thrown out of
   * it -- rather than the sequence written twice. It is a sequence, not a call:
   * the question is only answerable once the Endpoint's provider listing has
   * landed, so the await comes first and the refusal reads the listing it
   * waited for. Written out at each door, one of them had the writes above the
   * gate and the other below, which is exactly how a start the daemon refused
   * still un-archived its session and put a note in its transcript. Being one
   * method makes the beat easy for a third entry point to include; it does not
   * make it impossible to omit, and one caller does omit it deliberately --
   * `dispatchNextQueuedInput` reaches `startHandle` and `sendRemoteTurn`
   * without asking here, because it dispatches a turn that was permitted when
   * it was queued and it runs synchronously, with no window to reopen. What
   * covers every caller, this one included, is the barrier the two doors ask
   * for themselves.
   *
   * Not the last word, and deliberately not the barrier either. This one
   * refuses *early* -- before the turn spends anything, including the draft
   * rebind below it -- while the doors that reach the wire, `startHandle` and
   * `sendRemoteTurn`, ask again on their own first lines. Making this call the
   * whole invariant is what the earlier shape got wrong: the answer it read
   * could change during the awaits that followed, and every write between here
   * and the start would already have happened by the time it did.
   *
   * The permission question is asked by its own name. It used to read
   * `capabilitiesFor` -- a descriptive method -- and rewrite whatever it found
   * into "Provider not found", so a daemon that lists a CLI and refuses to run
   * it came back as a provider that does not exist. The descriptive answer has
   * its own reader, `turnProviderCapabilities`, so neither question can be
   * mistaken for the other.
   *
   * Provider permission only. `startHandle`'s account refusal
   * (`assertLocalAccountSelection`) is a different question and stays where it
   * is; this method does not promise that every refusal leaves no mark, it
   * promises that this one does not.
   */
  private async preflightTurnProvider(
    session: Pick<SessionSummary, 'executionHost' | 'providerId'>,
  ): Promise<void> {
    const verdict = await this.queryTurnProviderVerdict(session)
    if (!verdict.permitted) throw verdict.refusal
  }

  /**
   * The same preflight sequence, with the answer returned rather than thrown
   * (MAR-2682).
   *
   * `deliverMessage` cannot use the throwing form. Whether the answer applies
   * at all depends on something only readable after this await has returned --
   * whether the session has a live handle by then, since a live handle is
   * exempt from the question. Throwing here would settle the turn on a
   * condition read one or two awaits too early: a handle installed under those
   * awaits by a second send or a boot reattach would be refused a message it
   * must be able to receive.
   *
   * Asked for every session, live handle or not -- which is what lets the
   * caller hold the answer and decide afterwards whether it applies at all. A
   * host already carrying a run usually answers from the listing it holds, but
   * not always: `ensureListed` re-observes the Endpoint's configuration, so one
   * whose address or credentials changed under the run lists again, and one
   * that cannot be listed at all throws.
   *
   * Which is why the listing await is inside the `try`. Every failure of the
   * sequence is an answer this method carries, not a rejection it escapes
   * through: a listing that cannot be had is a refusal like any other, and a
   * session with a live handle is exempt from it for the same reason it is
   * exempt from the host's verdict -- refusing mid-run would strand a turn on a
   * machine that was willing when it started.
   */
  private async queryTurnProviderVerdict(
    session: Pick<SessionSummary, 'executionHost' | 'providerId'>,
  ): Promise<TurnProviderVerdict> {
    try {
      await this.awaitEndpointListing(session)
      this.assertTurnProviderRunnable(session)
      return { permitted: true }
    } catch (refusal) {
      return { permitted: false, refusal }
    }
  }

  /**
   * The host's permission to run this provider, asked in the host's own words
   * (MAR-2682).
   *
   * Three callers, and they are not interchangeable. `queryTurnProviderVerdict`
   * asks early and cheaply, for both entry points' preflight, before the turn
   * spends anything. The two doors that actually reach the wire --
   * `startHandle` and `sendRemoteTurn` -- ask again on their own first lines,
   * above their own writes.
   *
   * There is deliberately no fourth caller sitting between them. The doors
   * used to be guarded from the *caller's* body, with the turn's consequence
   * writes on the caller's lines below the question; anything that yielded in
   * that gap reopened the window the guard exists to close, and no test can
   * forbid every `await` a later edit might put there. Asking from inside the
   * synchronous method that starts is what makes that shape unavailable rather
   * than merely discouraged: the verdict and the writes are the same body, and
   * a caller has no line between them to write on.
   */
  private assertTurnProviderRunnable(
    session: Pick<SessionSummary, 'executionHost' | 'providerId'>,
  ): void {
    const execution = this.resolveExecution(session)
    execution.host.assertProviderRunnable(execution.providerId)
  }

  /**
   * What this provider can do on this host: a description, not a permission
   * (MAR-2682).
   *
   * `deliverMessage` has to know whether the provider resumes in order to pick
   * its branch, and it reads that here rather than as the return value of a
   * refusal. Asking a describing question is not asking to be let in, and
   * conflating the two is how a daemon that lists a CLI and refuses to run it
   * once came back as a provider that does not exist.
   */
  private turnProviderCapabilities(
    session: Pick<SessionSummary, 'executionHost' | 'providerId'>,
  ): ExecutionHostProviderCapabilities | null {
    const execution = this.resolveExecution(session)
    return execution.host.capabilitiesFor(execution.providerId)
  }

  /**
   * Where a remote session is running, read from the Endpoint the session
   * names. Resolving the host the same way a turn does is the point: a
   * workspace panel that queried an ambient daemon would describe a machine
   * the session has nothing to do with, and look exactly as convincing.
   */
  async fetchRemoteSessionWorkspaceInfo(
    sessionId: string,
  ): Promise<RemoteSessionWorkspaceInfo> {
    const session = this.getSummaryById(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    const execution = this.resolveExecution(session)
    if (!execution.host.fetchSessionWorkspaceInfo) {
      throw new Error(
        'This session runs on a host that does not report workspace information.',
      )
    }
    const info = await execution.host.fetchSessionWorkspaceInfo(sessionId)
    // The second door onto the same fact, for the sessions the first one did
    // not fill: a daemon predating the start-response echo, or a session born
    // before this shipped (MAR-2694). The record is what the surfaces read, so
    // an answer that arrives through a panel belongs in it too -- but only
    // where there is nothing already, because this door does not outrank the
    // start's (see `fillReportedWorkspaceFromFetch`).
    if (info.workspace) {
      this.fillReportedWorkspaceFromFetch(sessionId, info.workspace)
    }
    return info
  }

  /**
   * Writes what the daemon echoed with its acceptance onto the session's record
   * (MAR-2694). The authoritative door.
   *
   * A session that has since been deleted is not an error: the write is a
   * consequence of a run the daemon is holding, and it can arrive after the
   * row is gone.
   */
  recordReportedWorkspace(
    sessionId: string,
    workspace: ExecutionSessionWorkspace,
  ): void {
    if (!this.sessionRepository.findById(sessionId)) return
    this.sessionRepository.setReportedWorkspace(sessionId, workspace)
    this.notifySessionChange(sessionId)
  }

  /**
   * Writes a workspace read from a panel's snapshot fetch, onto a record that
   * has none (MAR-2694 round 2).
   *
   * Record beats fetch, and by precedence rather than by timing: the start
   * response is the daemon describing what it materialised for this session,
   * and a snapshot fetch is a later question that may have been asked before
   * the start landed or answered from an older view. Both doors used to write
   * blind, so whichever spoke last won -- which meant opening Session details
   * could durably replace the authoritative answer with a stale one, invisibly,
   * on a surface whose whole promise is that it does not lie (MAR-2619).
   *
   * The surfaces are told only when this actually filled something. A fetch
   * that changed nothing is not news.
   */
  private fillReportedWorkspaceFromFetch(
    sessionId: string,
    workspace: ExecutionSessionWorkspace,
  ): void {
    if (!this.sessionRepository.findById(sessionId)) return
    if (
      !this.sessionRepository.fillMissingReportedWorkspace(sessionId, workspace)
    ) {
      return
    }
    this.notifySessionChange(sessionId)
  }

  /**
   * Whether the session's host advertises continuation for its provider.
   * Never throws — lifecycle handling calls this for sessions whose remote
   * configuration may have gone away.
   */
  private continuationSupportedFor(
    session: Pick<SessionSummary, 'executionHost' | 'providerId'>,
  ): boolean {
    try {
      const execution = this.resolveExecution(session)
      return (
        execution.host.capabilitiesFor(execution.providerId)
          ?.supportsContinuation ?? false
      )
    } catch {
      return false
    }
  }

  /**
   * Where a remote start says it works, in the daemon's own two shapes
   * (MAR-2689).
   *
   * One function because the daemon accepts exactly one place per session and
   * refuses the two named together with an HTTP 400: a `workingDirectory` it
   * resolves as one of its Projects, or a `workspace` it clones into a fresh
   * per-session worktree. Reasoning about that exclusivity in two places is how
   * a start comes to carry both, which is what every remote session start did
   * until MAR-2576 -- so both modes are derived here, from the one field the
   * record holds, and the caller only spreads the answer.
   *
   * The record is the source, not the local checkout. The strip stated the
   * place before send and the session wrote down what it stated, so reading it
   * back is what makes "what the strip said" and "what the wire carries" the
   * same value rather than two derivations that agree until one of them is
   * edited.
   *
   * The legacy branch is for a row that predates the column, and for nothing
   * else: it worked somewhere, the record does not say where, and this
   * derivation -- the session project's origin -- is exactly what it ran under.
   * `create` refuses to mint an `unknown` address (`requireStatedWorkAddress`),
   * so the only rows that can reach it are the ones the migration backfilled.
   * It is reachable only in theory even for those: a remote session is started
   * once and every later turn attaches to the run the daemon already has
   * (`sendRemoteTurn`), so a row written before this shipped has already taken
   * its one start. It stays because deleting it would replace a known-correct
   * fallback with a refusal on a path nothing has proved unreachable.
   */
  private requireRemoteWorkPlace(
    session: Pick<SessionSummary, 'workingDirectory' | 'workAddress'>,
  ): {
    workspace?: { repository: string; branchName?: string }
    workingDirectory?: string
  } {
    const address = session.workAddress
    if (address?.mode === 'project') {
      return { workingDirectory: address.workingDirectory }
    }
    if (address?.mode === 'repository') {
      // The branch key exists only when a branch was written down. An empty
      // field means "the daemon names it", and the daemon names it by being
      // told nothing -- so a `branchName: null` on the wire would be this app
      // asking for a branch called nothing instead of asking for none
      // (MAR-2694).
      return {
        workspace: {
          repository: address.repository,
          ...(address.branchName === null
            ? {}
            : { branchName: address.branchName }),
        },
      }
    }

    const workspace =
      this.remoteWorkspaceSourceResolver?.(session.workingDirectory) ?? null
    if (!workspace) {
      throw new Error(
        'Remote sessions require a repository with an origin remote the daemon can clone',
      )
    }
    return { workspace }
  }

  setSessionTerminatedListener(listener: (sessionId: string) => void): void {
    this.onSessionTerminated = listener
  }

  /**
   * The receipt's other ending (MAR-2759): a dispatch that will never be
   * named by a settle. Delivered inline -- the listener only releases what
   * it was holding for those ids, and nothing here is mid-lifecycle.
   *
   * **The receipt lifecycle invariant (design P): every dispatched receipt
   * reaches exactly one terminal** -- `settled`, `cancelled`, `abandoned`
   * or `failed`. The first is the settle event's; the other three come
   * through here, and `failed` is emitted by `terminateQueuedInputs` on
   * every transition out of carrying a turn that does not drain the queue:
   * a dispatch attempt that failed, a stale run failed at the send door, a
   * turn that failed with rows behind it, a drain that could not send.
   * Pinned by the sweep in `session.service.test.ts`.
   */
  onDispatchTerminal(listener: DispatchTerminalListener): () => void {
    this.dispatchTerminalListeners.add(listener)
    return () => {
      this.dispatchTerminalListeners.delete(listener)
    }
  }

  /**
   * A receipt handed on to a second attempt (MAR-2971, R2).
   *
   * Beside `onDispatchTerminal` because it is the same kind of news from the
   * same owner -- the session layer holds the rows, so only it can say that
   * this errand is being carried again under a new id. The relay engine
   * re-opens the hop on the ORIGINAL flow run: a terminal already told it
   * the first attempt ended, and without this the run would be orphaned and
   * the second delivery would start a run of its own.
   */
  onDispatchRedelivered(listener: DispatchRedeliveredListener): () => void {
    this.dispatchRedeliveredListeners.add(listener)
    return () => {
      this.dispatchRedeliveredListeners.delete(listener)
    }
  }

  /**
   * A recording the local transcript could not hold for an accepted turn
   * (MAR-3023).
   *
   * Beside the dispatch listeners because it is their kind of news — a fact
   * about a receipt — but it ends nothing: the turn is still running and its
   * settle still owes the real terminal. Listeners get which dispatch the
   * loss belongs to, what was lost, and whether the provider is still
   * working, so nobody has to guess whether a retry is safe (it is not).
   */
  onAcceptedRecordingFailure(
    listener: AcceptedRecordingFailureListener,
  ): () => void {
    this.acceptedRecordingFailureListeners.add(listener)
    return () => {
      this.acceptedRecordingFailureListeners.delete(listener)
    }
  }

  private emitDispatchRedelivered(event: DispatchRedeliveredEvent): void {
    for (const listener of [...this.dispatchRedeliveredListeners]) {
      try {
        listener(event)
      } catch (error) {
        console.error(
          `[session] dispatch-redelivered listener failed for ${event.sessionId}`,
          error,
        )
      }
    }
  }

  private emitDispatchTerminal(
    sessionId: string,
    reason: DispatchTerminalEvent['reason'],
    dispatchIds: string[],
  ): void {
    // Nothing ended that anybody could be holding: input people typed, a
    // session that owed no receipt. An empty event would be a listener's
    // no-op dressed as news.
    if (dispatchIds.length === 0) return
    const event: DispatchTerminalEvent = {
      sessionId,
      reason,
      dispatchIds,
      at: new Date().toISOString(),
    }
    for (const listener of [...this.dispatchTerminalListeners]) {
      try {
        listener(event)
      } catch (error) {
        console.error(
          `[session] dispatch-terminal listener failed for ${sessionId}`,
          error,
        )
      }
    }
  }

  /**
   * The accepted-turn recording boundary (MAR-3023): once a dispatch is
   * attached to a live turn, a persistence failure while RECORDING that turn
   * is its own outcome — logged, emitted as a fact, noted on the conversation
   * best-effort — and never a failed send. Wraps a door-owned write
   * (the buffered receipt publication, the drain's 'sent' marks): on a
   * failure it announces and returns; pre-acceptance refusals
   * (`HandoffRefusedError`, `ProviderBusyError`) still leave, because a turn
   * that was never accepted owes the caller its refusal.
   */
  private recordAcceptedTurn(
    sessionId: string,
    dispatchId: string | null,
    label: string,
    write: () => void,
  ): boolean {
    try {
      write()
      return true
    } catch (error) {
      if (error instanceof HandoffRefusedError || isProviderBusyError(error))
        throw error
      this.recordingErrorFor(sessionId, label, error).announce()
      return false
    }
  }

  /**
   * Tags one persistence STATEMENT of the recording funnel (MAR-3023): the
   * INSERT/UPDATE inside `addConversationItem`, `patchConversationItem`,
   * `applySessionPatch` and the harness evidence write — never the method
   * around it, so a serializer, a row parser or a turn-capture prologue that
   * throws keeps its own raw error and is never mistaken for a lost record.
   *
   * It only tags and rethrows. Whether the turn was accepted is known by the
   * catch that sees the throw, not here — Codex's pre-ack writes run with a
   * dispatch already attached — so the catch that swallows the loss as an
   * accepted turn's outcome announces it (`RecordingError.announce`), and a
   * tagged error that propagates is an honest failure that announces nothing.
   */
  private tagAcceptedRecording<T>(
    sessionId: string,
    label: string,
    write: () => T,
  ): T {
    try {
      return write()
    } catch (error) {
      throw this.recordingErrorFor(sessionId, label, error)
    }
  }

  private recordingErrorFor(
    sessionId: string,
    label: string,
    error: unknown,
  ): RecordingError {
    if (error instanceof RecordingError) return error
    return new RecordingError(label, {
      cause: error,
      report: (recording) =>
        this.announceAcceptedRecordingFailure(sessionId, recording),
    })
  }

  /**
   * Records one lost recording: a log with the write's label, a fact per
   * attached dispatch, and a best-effort note. Reached once per error, through
   * `RecordingError.announce`. The note write is itself inside a try — a
   * second persistence failure is logged, never thrown (MAR-3023 R5).
   *
   * The dispatches named are the ones attached to the turn in flight, or —
   * with none attached — the turn that settled last, for as long as its tail
   * lasts: the next turn's user message, the next attached dispatch, or the
   * session's deletion ends it (C).
   */
  private announceAcceptedRecordingFailure(
    sessionId: string,
    recording: RecordingError,
  ): void {
    console.error(
      `[session] Accepted turn could not record ${recording.label} for ${sessionId}`,
      recording.cause,
    )
    const attached = [...(this.turnDispatchIds.get(sessionId) ?? [])]
    const settled =
      attached.length > 0 ? null : (this.lastSettledTurn.get(sessionId) ?? null)
    const dispatchIds =
      attached.length > 0 ? attached : (settled?.dispatchIds ?? [])
    if (dispatchIds.length === 0) {
      // A catch decided this loss belonged to an accepted turn, and there is
      // no turn to name: no fact, no note. Loud, because the only way here is
      // a door announcing outside the turn it thinks it owns.
      console.error(
        `[session] MAR-3023: a recording loss (${recording.label}) for ${sessionId} was announced with no accepted dispatch attached or settling — no fact and no note were written; the door that announced it is outside an accepted turn`,
      )
      return
    }
    const turnId =
      this.unrecordedTurnIds.get(sessionId) ??
      this.activeTurnIds.get(sessionId) ??
      settled?.turnId ??
      null
    const providerRunning = this.activeHandles.has(sessionId)
    const at = new Date().toISOString()
    for (const dispatchId of dispatchIds) {
      const event: AcceptedRecordingFailureEvent = {
        sessionId,
        dispatchId,
        turnId,
        label: recording.label,
        providerRunning,
        at,
      }
      for (const listener of [...this.acceptedRecordingFailureListeners]) {
        try {
          listener(event)
        } catch (error) {
          console.error(
            `[session] accepted-recording-failed listener failed for ${sessionId}`,
            error,
          )
        }
      }
    }
    try {
      const timestamp = new Date().toISOString()
      const note = this.addConversationItem(sessionId, {
        id: randomUUID(),
        turnId,
        kind: 'note',
        state: 'complete',
        level: 'warning',
        text: buildRecordingFailedNoteText({ turnId, label: recording.label }),
        createdAt: timestamp,
        updatedAt: timestamp,
        providerMeta: {
          providerId: 'convergence',
          providerItemId: null,
          providerEventType: 'recording-failed',
        },
      })
      if (note) {
        this.notifySessionChange(sessionId, {
          sessionId,
          op: 'add',
          item: note,
        })
      }
    } catch (error) {
      console.error(
        `[session] Could not record the recording-failure note (${recording.label}) for ${sessionId}`,
        error,
      )
    }
  }

  /**
   * The drain's 'sent' mark for a queued input its turn accepted (MAR-3023 G).
   * A refused mark is the turn's lost recording, and it is not left there: a
   * row still reading `dispatching` is failed at the next launch as never
   * accepted, which only moves the dishonesty. So the input is remembered and
   * the mark re-attempted when the turn settles.
   */
  private markQueuedInputSent(
    sessionId: string,
    dispatchId: string | null,
    queuedInputId: string,
  ): void {
    const marked = this.recordAcceptedTurn(
      sessionId,
      dispatchId,
      'the queued input sent mark',
      () => this.queuedInputs.patch(queuedInputId, 'sent'),
    )
    if (marked) return
    const unmarked = this.unmarkedSentInputs.get(sessionId)
    if (unmarked) unmarked.add(queuedInputId)
    else this.unmarkedSentInputs.set(sessionId, new Set([queuedInputId]))
  }

  /**
   * Re-attempts the 'sent' marks a turn could not write, at its settle — the
   * settle itself just wrote to the same database. A mark that fails again
   * stays remembered for the next settle, and is logged: its row reads
   * `dispatching`, and the launch recovery says so honestly (G).
   */
  private retryUnmarkedSentInputs(sessionId: string): void {
    const unmarked = this.unmarkedSentInputs.get(sessionId)
    if (!unmarked) return
    for (const queuedInputId of [...unmarked]) {
      try {
        this.queuedInputs.patch(queuedInputId, 'sent')
        unmarked.delete(queuedInputId)
      } catch (error) {
        console.error(
          `[session] The sent mark for queued input ${queuedInputId} of ${sessionId} still could not be recorded at the turn's settle`,
          error,
        )
      }
    }
    if (unmarked.size === 0) this.unmarkedSentInputs.delete(sessionId)
  }

  /**
   * @internal exposed for tests; do not call from production code.
   *
   * Composes two steps the real doors take separately: it attaches the
   * dispatch to the turn (`attachDispatchToTurn`, which a door does at
   * acceptance) and then runs the write through `recordAcceptedTurn` (which a
   * door does afterwards, for its publication or its 'sent' mark). A test of
   * the boundary alone needs both; a test of a door must not use this.
   */
  recordAcceptedTurnForTest(
    sessionId: string,
    dispatchId: string | null,
    label: string,
    write: () => void,
  ): void {
    this.attachDispatchToTurn(sessionId, dispatchId)
    this.recordAcceptedTurn(sessionId, dispatchId, label, write)
  }

  /**
   * The loud terminal (MAR-2759, design P): fails every input this session
   * ATTEMPTED and emits `failed` for their receipts, in one event.
   *
   * Attempted only (R1, MAR-2971). A `dispatching` row was tried and its
   * failure is its own; a `queued` row was not, so it stays queued and the
   * next turn drains it. That distinction is also what keeps the ledger
   * honest (R3): a never-attempted row's receipt never reaches this event,
   * so `markDispatchesTerminated` never stamps its hop, and the hop stays
   * unsettled and owed — `Waiting · <target> · since HH:MM` — instead of
   * claiming a delivery that was never tried.
   *
   * Called from every transition out of carrying a turn that does not drain
   * the queue. The queue drains only on `completed`; any other way out
   * leaves ATTEMPTED rows waiting for a settle that is not coming, and a row
   * nobody owns is exactly the stranded work this invariant exists to
   * remove.
   * Termination over a retry, by ruling: the failure that got here was not
   * transient as far as this process can tell, and a quiet retry would be
   * a guess.
   */
  private terminateQueuedInputs(
    sessionId: string,
    reason: string,
    options: { deferTellingToBoot?: boolean } = {},
  ): void {
    const ended = this.queuedInputs.failAttemptedForSession(sessionId, reason)
    // At boot nobody is listening yet (MAR-3307). The rows are failed now, so
    // the failure is durable, but they stay untold. `tellBootEndings` tells
    // them from the record once the listeners are wired. Stamping them here
    // would mark as told an ending that nobody heard.
    if (options.deferTellingToBoot) return
    // Emit, THEN stamp (MAR-2971 lap 3). The two orders fail differently and
    // only one of them fails safely. Stamping first, a kill between the two
    // writes leaves a row marked told that the engine never heard: its hop
    // is owed forever and the later dismissal stays silent, because the
    // stamp says the ending was already given. Emitting first, the same kill
    // leaves a told ending with no stamp -- and that is idempotent at the
    // ledger, because `markDispatchesTerminated` only stamps hops
    // `WHERE settled_at IS NULL`, so the dismissal's second telling changes
    // nothing. A lost stamp costs one redundant event; a lost event costs
    // the receipt its only ending.
    this.emitDispatchTerminal(
      sessionId,
      'failed',
      ended
        .map((item) => item.dispatchId)
        .filter((dispatchId): dispatchId is string => dispatchId !== null),
    )
    this.queuedInputs.markEndingTold(ended.map((item) => item.id))
  }

  /**
   * A dispatch attempt failed: whether the queue behind it still has an
   * owner is the question, and `isCarryingATurn` answers it. Another send
   * still in flight, or a live turn, will drain or terminate the rows on
   * its own way out; a session left idle by this failure will not, so the
   * rows end here. A session deleted under the attempt already emitted
   * `abandoned` for them.
   */
  private terminateQueueUnlessCarryingATurn(
    sessionId: string,
    reason: string,
  ): void {
    const session = this.getById(sessionId)
    if (!session || this.isCarryingATurn(session)) return
    this.terminateQueuedInputs(sessionId, reason)
  }

  /** A daemon PR URL requests verification; the URL itself is never persisted. */
  onPullRequestHint(listener: (sessionId: string) => void): () => void {
    this.pullRequestHintListeners.add(listener)
    return () => {
      this.pullRequestHintListeners.delete(listener)
    }
  }

  /**
   * Subscribes to sessions coming to rest. Fires once per status transition
   * into `completed` or `failed`.
   *
   * Every other listener seam on this service is a single-slot field whose
   * setter silently evicts whoever registered before -- and every one of those
   * slots is already taken by renderer broadcasts, notifications or provider
   * debug logging. This seam is a list handing back an unsubscribe precisely so
   * a second observer (relays) can watch settles without displacing the first.
   */
  onSessionSettled(listener: SessionSettledListener): () => void {
    this.sessionSettledListeners.add(listener)
    return () => {
      this.sessionSettledListeners.delete(listener)
    }
  }

  rename(id: string, name: string): Session {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 120) {
      throw new Error('Session name must be 1-120 characters')
    }
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)
    this.sessionRepository.rename(id, trimmed)
    this.notifySessionChange(id)
    return this.getById(id)!
  }

  setPinned(id: string, pinned: boolean): void {
    return this.sessionRepository.setPinned(id, pinned)
  }

  setPrimarySurface(id: string, surface: 'conversation' | 'terminal'): Session {
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)
    if (surface === 'conversation' && session.providerId === 'shell') {
      throw new Error(
        `Session ${id} uses the shell provider and cannot be flipped to conversation-primary without attaching a real provider`,
      )
    }
    this.sessionRepository.setPrimarySurface(id, surface)
    this.notifySessionChange(id)
    return this.getById(id)!
  }

  /**
   * Changes the model and effort a session's *next* turn will run on
   * (MAR-2550).
   *
   * The provider is deliberately not changeable here: continuation tokens are
   * provider-specific, so a session keeps the provider it was born with. Model
   * and effort are not — every adapter passes them at turn time, and
   * `startHandle` re-reads this row for every resumed turn, so persisting here
   * is the entire mechanism.
   *
   * `input.providerId` is the provider the selection was made against, and it
   * is required rather than optional: an omitted check is a check that can be
   * forgotten. It is compared against the row and nothing else — an identity
   * check, not a model catalog.
   */
  async setModelSelection(
    id: string,
    input: { providerId: unknown; model: string | null; effort: unknown },
  ): Promise<Session> {
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)
    if (session.providerId === 'shell') {
      throw new Error(
        `Session ${id} uses the shell provider and has no model to change`,
      )
    }

    const mismatch = describeProviderIdentityRefusal(
      session,
      typeof input.providerId === 'string' ? input.providerId.trim() : '',
    )
    if (mismatch) throw new Error(mismatch)

    const liveHandle = this.activeHandles.get(id)
    const refusal =
      liveHandle?.setModelSelection && !this.dispatches.isDispatching(id)
        ? null
        : describeModelSelectionRefusal({
            status: session.status,
            attention: session.attention,
            hasActiveHandle: liveHandle?.setModelSelection
              ? false
              : this.activeHandles.has(id),
            hasDispatchInFlight: this.dispatches.isDispatching(id),
          })
    if (refusal) throw new Error(refusal)

    const model = input.model?.trim() ? input.model.trim() : null
    const effort = parseReasoningEffort(input.effort)
    if (input.effort != null && effort === null) {
      throw new Error(`Unknown reasoning effort: ${String(input.effort)}`)
    }

    const boundary = describeModelChange(
      { model: session.model, effort: session.effort },
      { model, effort },
    )
    const controlDispatch = liveHandle?.setModelSelection
      ? this.dispatches.begin(id)
      : null
    try {
      await liveHandle?.setModelSelection?.(model, effort)

      // One write, because the two halves are only true together. A model that
      // moved without its divider is a transcript that silently mixes models,
      // which is the whole thing MAR-2551 exists to prevent; a divider without
      // the move announces a boundary that never happened. The same answer run
      // 22 gave the non-atomic settle.
      const applySelection = this.db.transaction(() => {
        this.sessionRepository.setModelSelection(id, model, effort)

        // The transcript would otherwise go on implying one author (MAR-2551).
        // Written here rather than at the next turn because this is the moment
        // the reader made the decision: the note lands under the last answer of
        // the old model and above whatever they type next.
        return boundary
          ? this.addConversationItem(id, {
              id: randomUUID(),
              turnId: null,
              kind: 'note',
              state: 'complete',
              level: 'info',
              text: boundary,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              providerMeta: {
                providerId: session.providerId,
                providerItemId: null,
                providerEventType: MODEL_CHANGED_EVENT_TYPE,
              },
            })
          : null
      })

      const note = applySelection()

      this.notifySessionChange(
        id,
        note ? { sessionId: id, op: 'add', item: note } : undefined,
      )
      return this.getById(id)!
    } finally {
      if (controlDispatch) this.dispatches.settle(controlDispatch)
    }
  }

  async regenerateName(
    id: string,
    requestId?: string,
  ): Promise<{ updated: boolean }> {
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)
    return { updated: await this.runNaming(session, requestId) }
  }

  markShellSessionExited(id: string, exitCode: number): void {
    const session = this.getById(id)
    if (!session) return
    if (session.providerId !== 'shell') return

    this.applySessionPatch(id, {
      status: exitCode === 0 ? 'completed' : 'failed',
      attention: exitCode === 0 ? 'finished' : 'failed',
      activity: null,
      updatedAt: new Date().toISOString(),
    })
    this.notifySessionChange(id)
  }

  private async runNaming(
    session: SessionSummary,
    requestId?: string,
  ): Promise<boolean> {
    if (!this.namer) return false
    const title = await this.namer.generateName(
      session,
      this.getConversation(session.id),
      {
        ...(requestId ? { requestId } : {}),
        providerAccountId: this.getLastTurnProviderAccountId(session.id),
      },
    )
    if (!title) return false
    this.sessionRepository.rename(session.id, title)
    this.notifySessionChange(session.id)
    return true
  }

  private hasBeenAutoNamed(id: string): boolean {
    return this.sessionRepository.isAutoNamed(id)
  }

  setEvidenceUpdateListener(
    listener: (event: { sessionId: string }) => void,
  ): void {
    this.onEvidenceUpdate = listener
  }

  private scheduleEvidenceUpdate(sessionId: string): void {
    if (this.evidenceUpdateTimers.has(sessionId)) return
    this.evidenceUpdateTimers.set(
      sessionId,
      setTimeout(() => {
        this.evidenceUpdateTimers.delete(sessionId)
        if (!this.sessionRepository.findById(sessionId)) return
        this.parallelWorkCounts.set(
          sessionId,
          this.evidenceCounts.countParallelWork([sessionId]).get(sessionId)!,
        )
        this.onEvidenceUpdate?.({ sessionId })
        this.notifySummaryUpdated(sessionId)
      }, 250),
    )
  }

  setSummaryUpdateListener(listener: (summary: SessionSummary) => void): void {
    this.onSummaryUpdate = listener
  }

  setConversationPatchListener(
    listener: (event: ConversationPatchEvent) => void,
  ): void {
    this.onConversationPatch = listener
  }

  setQueuedInputPatchListener(
    listener: (event: QueuedInputPatchEvent) => void,
  ): void {
    this.queuedInputs.setPatchListener(listener)
  }

  create(input: CreateSessionInput): Session {
    const id = randomUUID()
    let workingDirectory: string
    let projectId: string | null
    let workspaceId: string | null
    let primarySurface = input.primarySurface ?? 'conversation'

    if (input.contextKind === 'global') {
      if (input.projectId || input.workspaceId) {
        throw new Error(
          'Global sessions cannot be tied to a project or workspace',
        )
      }
      mkdirSync(this.globalWorkingDirectory, { recursive: true })
      workingDirectory = this.globalWorkingDirectory
      projectId = null
      workspaceId = null
      primarySurface = 'conversation'
    } else {
      projectId = input.projectId
      workspaceId = input.workspaceId

      if (workspaceId) {
        const ws = this.db
          .prepare('SELECT path FROM workspaces WHERE id = ?')
          .get(workspaceId) as { path: string } | undefined
        if (!ws) throw new Error(`Workspace not found: ${workspaceId}`)
        workingDirectory = ws.path
      } else {
        const proj = this.db
          .prepare('SELECT repository_path FROM projects WHERE id = ?')
          .get(projectId) as { repository_path: string } | undefined
        if (!proj) throw new Error(`Project not found: ${projectId}`)
        workingDirectory = proj.repository_path
      }
    }

    // Global sessions run in the shared local scratch directory; there is no
    // repository for a remote host to materialize, so they stay local.
    const executionHost =
      input.contextKind === 'global'
        ? LOCAL_EXECUTION_HOST_ID
        : (input.executionHost ?? LOCAL_EXECUTION_HOST_ID)

    // A local session has no work address: it works in `workingDirectory`,
    // which this row already names. A remote one is born with a *concrete*
    // place or is not born at all -- the last of the three doors that make the
    // original incident unreachable (MAR-2689).
    //
    // The refusal is here and not only in the composer because this is the
    // door every caller passes through, and the composer is one caller. It also
    // says out loud what `unknown` is for: a pre-era row, backfilled by the
    // migration, never something this app can mint. Defaulting to it here is
    // what let a session start with no place and fall through to the silent
    // derivation of its own project's origin -- a default is not a known value.
    const workAddress = isRemoteExecutionHost(executionHost)
      ? requireStatedWorkAddress(input.workAddress)
      : null

    this.sessionRepository.create({
      origin: input.origin,
      id,
      contextKind: input.contextKind ?? 'project',
      projectId,
      workspaceId,
      executionHost,
      workAddress,
      providerId: input.providerId,
      model: input.model,
      effort: input.effort,
      serviceTier: input.serviceTier ?? null,
      permissionConfig: input.permissionConfig,
      name: input.name,
      workingDirectory,
      parentSessionId: input.parentSessionId ?? null,
      forkStrategy: input.forkStrategy ?? null,
      primarySurface,
    })

    return this.getSummaryById(id)!
  }

  getByProjectId(projectId: string): Session[] {
    return this.buildSessionSummaries(
      this.sessionRepository.listByProjectId(projectId),
    )
  }

  getAll(): Session[] {
    return this.buildSessionSummaries(this.sessionRepository.listAll())
  }

  getSummariesByProjectId(projectId: string): SessionSummary[] {
    return this.buildSessionSummaries(
      this.sessionRepository.listByProjectId(projectId),
    )
  }

  getGlobalSummaries(): SessionSummary[] {
    return this.buildSessionSummaries(this.sessionRepository.listGlobal())
  }

  getAllSummaries(): SessionSummary[] {
    return this.buildSessionSummaries(this.sessionRepository.listAll())
  }

  /**
   * How many sessions name each execution host (MAR-2642).
   *
   * Blank and absent both mean this machine — that is what every row written
   * before execution hosts existed meant — so they are folded into `'local'`
   * rather than reported as a host of their own.
   *
   * Accumulated in a `Map` and returned as pairs. The ids come off session
   * rows, so they are outside data: a bare object accumulator reads
   * `counts['toString']` as an inherited function rather than a missing count,
   * and `counts['__proto__'] = n` goes to the prototype setter and is lost.
   * Both make a removal warning lie about a real Endpoint.
   */
  countSessionsByExecutionHost(): ExecutionHostSessionCount[] {
    const counts = new Map<string, number>()
    for (const row of this.sessionRepository.countByExecutionHost()) {
      const id = parseExecutionHostId(row.executionHost)
      counts.set(id, (counts.get(id) ?? 0) + row.count)
    }
    return [...counts].map(([executionHostId, sessions]) => ({
      executionHostId,
      sessions,
    }))
  }

  getById(id: string): Session | null {
    const row = this.getRowById(id)

    return row ? this.buildSessionSummary(row) : null
  }

  getSummaryById(id: string): SessionSummary | null {
    const row = this.getRowById(id)
    return row ? this.buildSessionSummary(row) : null
  }

  private cachedParallelWork(
    sessionIds: string[],
  ): Map<string, ParallelWorkCounts> {
    const missing = sessionIds.filter((id) => !this.parallelWorkCounts.has(id))
    if (missing.length)
      for (const [id, counts] of this.evidenceCounts.countParallelWork(missing))
        this.parallelWorkCounts.set(id, counts)
    return this.parallelWorkCounts
  }

  private buildSessionSummary(row: SessionRow): SessionSummary {
    const summary = {
      ...sessionSummaryFromRow(row),
      turnTiming: this.summaryTurnTiming(
        row,
        readSessionTurnTimings(this.db, [row.id]).get(row.id),
      ),
      hasActiveHandle: this.activeHandles.has(row.id),
      canStopTasks: this.activeHandles.get(row.id)?.canStopTasks === true,
      parallelWork: this.cachedParallelWork([row.id]).get(row.id)!,
    }
    // Read the request row only when the answer can use it, the same rule the
    // batched path applies (MAR-3396): a settled or idle conversation's row is
    // thrown away by resolveAttentionRequestKind, and reading it cost a scan.
    const attentionRequestKind = resolveAttentionRequestKind(
      summary,
      isAttentionRequestSummary(summary)
        ? this.readAttentionRequestRow(summary.id)
        : null,
    )
    return attentionRequestKind ? { ...summary, attentionRequestKind } : summary
  }

  private buildSessionSummaries(rows: SessionRow[]): SessionSummary[] {
    const counts = this.cachedParallelWork(rows.map((row) => row.id))
    const timings = readSessionTurnTimings(
      this.db,
      rows.map((row) => row.id),
    )
    const summaries = rows.map((row) => ({
      ...sessionSummaryFromRow(row),
      turnTiming: this.summaryTurnTiming(row, timings.get(row.id)),
      hasActiveHandle: this.activeHandles.has(row.id),
      canStopTasks: this.activeHandles.get(row.id)?.canStopTasks === true,
      parallelWork: counts.get(row.id)!,
    }))
    const attentionRowsBySessionId =
      this.readLatestAttentionRequestRows(summaries)

    return summaries.map((summary) => {
      const attentionRequestKind = resolveAttentionRequestKind(
        summary,
        attentionRowsBySessionId.get(summary.id) ?? null,
      )
      return attentionRequestKind
        ? { ...summary, attentionRequestKind }
        : summary
    })
  }

  private summaryTurnTiming(
    row: SessionRow,
    timing: SessionSummary['turnTiming'],
  ): SessionSummary['turnTiming'] {
    // Remote sessions need host-reported lifecycle facts, not a prior local turn.
    if (!isLocalExecutionHost(row.execution_host) || !timing) return null
    if (
      row.status === 'running' &&
      (timing.status !== 'running' ||
        this.activeTurnIds.get(row.id) !== timing.turnId)
    )
      return null
    return timing
  }

  private readAttentionRequestRow(
    sessionId: string,
  ): AttentionRequestRow | null {
    const row = this.db
      .prepare(
        `SELECT kind, payload_json
         FROM session_conversation_items
         WHERE session_id = ?
           AND kind IN ('approval-request', 'input-request')
         ORDER BY sequence DESC
         LIMIT 1`,
      )
      .get(sessionId) as Omit<AttentionRequestRow, 'session_id'> | undefined

    return row ? { session_id: sessionId, ...row } : null
  }

  private readLatestAttentionRequestRows(
    summaries: Array<Pick<SessionSummary, 'id' | 'attention'>>,
  ): Map<string, AttentionRequestRow> {
    const sessionIds = summaries
      .filter(isAttentionRequestSummary)
      .map((summary) => summary.id)

    if (sessionIds.length === 0) return new Map()

    const placeholders = sessionIds.map(() => '?').join(', ')
    const rows = this.db
      .prepare(
        `SELECT session_id, kind, payload_json
         FROM (
           SELECT session_id,
                  kind,
                  payload_json,
                  ROW_NUMBER() OVER (
                    PARTITION BY session_id
                    ORDER BY sequence DESC
                  ) AS request_rank
           FROM session_conversation_items
           WHERE session_id IN (${placeholders})
             AND kind IN ('approval-request', 'input-request')
         )
         WHERE request_rank = 1`,
      )
      .all(...sessionIds) as AttentionRequestRow[]

    return new Map(rows.map((row) => [row.session_id, row]))
  }

  /**
   * The provider account this session's most recent turn actually ran on.
   *
   * Sessions carry no account of their own -- the durable record is per turn --
   * so this is the same last-turn rule the composer seeds its picker from, read
   * on the backend so a turn nobody is watching can inherit it too. Null means
   * the session has no turns yet, or its last one rode the ambient credential.
   */
  getLastTurnProviderAccountId(sessionId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT provider_account_id
         FROM session_turns
         WHERE session_id = ?
         ORDER BY sequence DESC
         LIMIT 1`,
      )
      .get(sessionId) as { provider_account_id: string | null } | undefined

    return row?.provider_account_id ?? null
  }

  private readAnswerWindow(sessionId: string) {
    this.flushPendingConversationPatchesForSession(sessionId)
    const rows = this.db
      .prepare(
        `SELECT payload_json FROM session_conversation_items
      WHERE session_id=? AND agent_run_id IS NULL AND kind='message' AND state='complete'
      AND sequence >= COALESCE((SELECT answer_window_start_sequence FROM sessions WHERE id=?),0)
      ORDER BY sequence`,
      )
      .all(sessionId, sessionId) as Array<{ payload_json: string }>
    return answerWindowResult(
      rows.flatMap((row) => {
        try {
          const payload = JSON.parse(row.payload_json) as {
            actor?: unknown
            text?: unknown
          } | null
          return payload?.actor === 'assistant' &&
            typeof payload.text === 'string' &&
            payload.text.trim()
            ? [payload.text]
            : []
        } catch {
          return []
        }
      }),
    )
  }

  /**
   * The text of the newest finished assistant message in a session, or null
   * when there is none to carry.
   *
   * This is the relay payload. It reads the single row rather than
   * materializing the whole conversation because it runs on every settle, and
   * it flushes coalesced patches first so a message that finished streaming
   * moments before the session settled is not missed.
   */
  getLastAssistantMessageText(sessionId: string): string | null {
    this.flushPendingConversationPatchesForSession(sessionId)

    const row = this.db
      .prepare(
        `SELECT payload_json
         FROM session_conversation_items
         WHERE session_id = ?
           AND kind = 'message'
           AND state = 'complete'
           AND json_extract(payload_json, '$.actor') = 'assistant'
         ORDER BY sequence DESC
         LIMIT 1`,
      )
      .get(sessionId) as { payload_json: string } | undefined

    if (!row) return null

    let text: unknown
    try {
      text = (JSON.parse(row.payload_json) as { text?: unknown }).text
    } catch {
      return null
    }

    return typeof text === 'string' && text.trim().length > 0 ? text : null
  }

  /** Summarize persisted items before a future window; no IPC in O0a. */
  getConversationPrefix(
    sessionId: string,
    beforeSequence: number,
  ): ConversationPrefix {
    this.flushPendingConversationPatchesForSession(sessionId)
    // Item timestamps, not session_turns.started_at: turn records can precede
    // their first item and need not cover imported/provider-attributed turns.
    const rows = this.db
      .prepare(
        `
      SELECT spans.*, first.created_at AS startedAt
      FROM (
        SELECT turn_id AS id, MIN(sequence) AS firstSequence,
          MAX(CASE WHEN kind = 'message' AND state = 'complete'
            AND json_valid(payload_json) THEN
          CASE WHEN json_extract(payload_json, '$.actor') = 'assistant' THEN sequence END END) AS latestReplySequence,
          ROUND(MIN(unixepoch(created_at, 'subsec')) * 1000) AS startMs,
          ROUND(MAX(CASE WHEN unixepoch(created_at, 'subsec') IS NOT NULL
            THEN COALESCE(unixepoch(updated_at, 'subsec'), unixepoch(created_at, 'subsec')) END) * 1000) AS endMs
        FROM session_conversation_items
        WHERE session_id = ? AND sequence < ?
        GROUP BY turn_id
      ) spans
      JOIN session_conversation_items first ON first.session_id = ? AND first.sequence = spans.firstSequence
    `,
      )
      .all(sessionId, beforeSequence, sessionId) as {
      id: string | null
      firstSequence: number
      latestReplySequence: number | null
      startedAt: string
      startMs: number | null
      endMs: number | null
    }[]
    rows.sort((a, b) => a.firstSequence - b.firstSequence)
    const turns = rows
      .filter((row) => row.id)
      .map(({ id, startedAt, startMs, endMs }, index) => ({
        id: id!,
        ordinal: index + 1,
        startedAt,
        startMs,
        endMs,
      }))
    let totalMs: number | null = null
    for (const turn of turns) {
      if (turn.startMs !== null && turn.endMs !== null) {
        totalMs = (totalMs ?? 0) + Math.max(0, turn.endMs - turn.startMs)
      }
    }
    const latestSequence = rows.reduce<number | null>(
      (latest, row) =>
        row.latestReplySequence === null
          ? latest
          : Math.max(
              latest ?? row.latestReplySequence,
              row.latestReplySequence,
            ),
      null,
    )
    const latest =
      latestSequence === null
        ? undefined
        : (this.db
            .prepare(
              `
      SELECT id FROM session_conversation_items WHERE session_id = ? AND sequence = ?
    `,
            )
            .get(sessionId, latestSequence) as { id: string } | undefined)
    return {
      turnCount: turns.length,
      turns,
      totalMs,
      latestCompletedReplyId: latest?.id ?? null,
    }
  }

  getConversation(id: string): ConversationItem[] {
    this.flushPendingConversationPatchesForSession(id)

    const perfStart =
      process.env.CONVERGENCE_PERF === '1' ? performance.now() : null
    const rows = this.db
      .prepare(
        `SELECT items.*, sessions.provider_id, agents.description AS agent_description, agents.agent_type
         FROM session_conversation_items items
         INNER JOIN sessions ON sessions.id = items.session_id
         LEFT JOIN session_agent_runs agents ON agents.session_id=items.session_id AND agents.id=items.agent_run_id
         WHERE items.session_id = ?
         ORDER BY items.sequence ASC`,
      )
      .all(id) as ConversationItemRow[]

    if (perfStart !== null) {
      const parseStart = performance.now()
      const items = rows.map(conversationItemFromRow)
      recordConversationRead(
        id,
        parseStart - perfStart,
        performance.now() - parseStart,
        items,
      )
      return items
    }
    return rows.map(conversationItemFromRow)
  }

  async stopTask(sessionId: string, id: string): Promise<void> {
    const handle = this.activeHandles.get(sessionId)
    if (!handle?.canStopTasks || !handle.stopTask)
      throw new Error('Stop is not available on this Claude Code version')
    const row = this.db
      .prepare(
        `SELECT status FROM session_agent_runs WHERE session_id=? AND id=?
      UNION ALL SELECT status FROM session_tasks WHERE session_id=? AND task_id=? LIMIT 1`,
      )
      .get(sessionId, id, sessionId, id) as { status: string } | undefined
    if (row?.status !== 'running') throw new Error('This task is not running')
    await handle.stopTask(id)
  }

  harnessFacts(sessionId: string) {
    return new HarnessEvidenceService(this.db).harnessFacts(sessionId)
  }

  listAgentRuns(sessionId: string) {
    return new HarnessEvidenceService(this.db).listAgentRuns(sessionId)
  }
  listTasks(sessionId: string) {
    return new HarnessEvidenceService(this.db).listTasks(sessionId)
  }

  getQueuedInputs(sessionId: string): SessionQueuedInput[] {
    return this.queuedInputs.list(sessionId)
  }

  /**
   * Dismiss (✕), from `queued` or from `failed` (R3, MAR-2971).
   *
   * The terminal's word is the row's own story. A `queued` row is work the
   * user called off before anything tried it -- `cancelled`. A `failed` row
   * is work that was tried and did not land, and the user is now letting it
   * go rather than delivering it -- `abandoned`. Both read quiet to the
   * stall clock, so neither raises a false alarm; the difference is
   * observable exactly where it matters, on a row `recoverDispatching()`
   * failed across a restart, whose hop never got a terminal and is still
   * unsettled. That hop settles here, with the true word, instead of
   * hanging owed forever.
   */
  cancelQueuedInput(id: string): void {
    const before = this.queuedInputs.get(id)
    const cancelled = this.queuedInputs.cancel(id)
    // That one receipt and no other: the row's siblings are still waiting.
    // And once only: a row that reached `failed` through a path that EMITTED
    // a terminal has already had its ending told, the engine has released
    // the baton and stamped the hop, and saying it again would be a second
    // ending for one receipt -- the invariant design P is built on. A row
    // `recoverDispatching` failed at boot was never announced, so its stamp
    // is null and this dismissal is its first and only ending (MAR-2971).
    if (cancelled.dispatchId && before?.endingToldAt === null) {
      this.queuedInputs.markEndingTold([cancelled.id])
      this.emitDispatchTerminal(
        cancelled.sessionId,
        before?.state === 'failed' ? 'abandoned' : 'cancelled',
        [cancelled.dispatchId],
      )
    }
  }

  /**
   * Deliver now (R2, MAR-2971): re-enqueue a failed input as the next thing
   * this session sends.
   *
   * The NEW receipt is told nothing, because it is owed: it rides on the
   * fresh row and it is the delivery that will settle its hop. The OLD one
   * is a different question -- if nobody ever announced its ending it is
   * closed here, quietly, below.
   *
   * The fresh row keeps its predecessor's place in line rather than joining
   * the back, so "now" means the next turn this session takes and an opener
   * still leads the payload it clears for (lap 4).
   *
   * If the session is idle, nothing would otherwise drain the row until the
   * user sends again, so the drain is kicked here: "now" is the button's
   * whole promise.
   */
  redeliverQueuedInput(id: string): SessionQueuedInput {
    // Read before the re-attempt is enqueued: the old row is never rewritten,
    // but its told-ending stamp decides whether its receipt still owes one.
    const before = this.queuedInputs.get(id)
    const { input: fresh, fromDispatchId } = this.queuedInputs.redeliver(id)

    // The first attempt's ending, if nobody ever told it (MAR-2971 lap 3).
    // A row `recoverDispatching` failed at boot was rewritten in SQL and
    // announced to no one, so its hop is still unsettled. Handing the errand
    // to a new receipt without closing the old one leaves that hop reading
    // `Waiting · since ...` for the rest of the process's life, for an
    // attempt that is over -- and a receipt with no ending is the one thing
    // design P forbids. Told BEFORE the handover, so the ledger never holds
    // two live hops for one errand.
    //
    // `abandoned`, the word dismiss uses, and not `failed` (lap 4). The
    // user is superseding this attempt with another one they just asked
    // for; it is quiet to the stall clock, and `failed` here would hail a
    // chair about the very delivery being retried a line later.
    if (before && before.dispatchId && before.endingToldAt === null) {
      this.emitDispatchTerminal(fresh.sessionId, 'abandoned', [
        before.dispatchId,
      ])
      this.queuedInputs.markEndingTold([before.id])
    }

    // The engine next, before anything can drain: it has to be holding a
    // baton for the new receipt BEFORE that receipt's turn can settle, or
    // the settle finds nothing and mints a run of its own -- the whole
    // defect lap 2 exists to close (MAR-2971, R2).
    if (fromDispatchId && fresh.dispatchId) {
      this.emitDispatchRedelivered({
        sessionId: fresh.sessionId,
        fromDispatchId,
        toDispatchId: fresh.dispatchId,
        relaysMuted: fresh.relaysMuted,
        at: new Date().toISOString(),
      })
    }

    let session = this.getById(fresh.sessionId)
    if (!session) return fresh

    // A LOCAL session that says `running` with no handle is a dead process,
    // not a busy one -- `isCarryingATurn` says so itself, and the send door
    // above already treats it this way. Deliver now does what a send does:
    // names the run stale, then drains. A REMOTE session says `running` and
    // keeps no local handle by design, and there the daemon is the truth, so
    // the row waits and the card keeps reading "waiting for the next turn"
    // (R3/R4, MAR-2971 lap 2).
    if (
      session.status === 'running' &&
      !this.activeHandles.has(session.id) &&
      !isRemoteExecutionHost(session.executionHost)
    ) {
      session = this.markStaleRunningSessionFailed(
        session,
        'Session marked failed because Convergence no longer has an active provider process for this run.',
        true,
      )
    }

    // Idle by the session's OWN status, not by `isCarryingATurn` (R4).
    // That helper answers "is there a local handle mid-turn", and a remote
    // run has no local handle at all -- so on a remote session it reads
    // "idle" while the daemon is mid-turn, and this would push the input
    // into a turn already running. The status is the fact both hosts keep.
    if (
      session.status !== 'running' &&
      !this.dispatches.isDispatching(session.id)
    ) {
      void this.dispatchNextQueuedInput(fresh.sessionId).catch((error) => {
        console.error('[session] Could not dispatch queued input', error)
      })
    }
    return fresh
  }

  /**
   * Commit-last terminals (MAR-2759, design P). The receipts are READ before
   * the rows go and CONSUMED only after the delete is committed: a delete
   * that fails leaves a session that still owes its receipts, with the
   * in-flight set intact for the settle that is still coming, and emits
   * nothing. Handle cleanup is best-effort -- a provider that refuses to
   * stop cannot hold the deletion hostage -- so the one thing that can fail
   * this method is the repository delete itself, and that is the line every
   * irreversible consequence sits below.
   */
  delete(id: string): void {
    this.clearPendingConversationPatchesForSession(id)
    // Every receipt this session still owes, read non-destructively: the
    // queued ones (waiting, dispatching, or failed on the way) and the ids
    // of the turn in flight.
    const queuedReceipts = this.queuedInputs
      .list(id)
      .map((item) => item.dispatchId)
      .filter((dispatchId): dispatchId is string => dispatchId !== null)
    const handle = this.activeHandles.get(id)
    if (handle) {
      try {
        handle.stop()
      } catch (error) {
        console.error(
          `[session] provider handle refused to stop while deleting ${id}`,
          error,
        )
      }
      this.releaseHandle(id)
    }
    this.sessionRepository.delete(id)
    const evidenceTimer = this.evidenceUpdateTimers.get(id)
    if (evidenceTimer) clearTimeout(evidenceTimer)
    this.evidenceUpdateTimers.delete(id)
    this.parallelWorkCounts.delete(id)
    // Committed. Only now is ownership consumed and the ending told: the
    // turn's settle is never coming, and its receipts end here with the
    // queued ones.
    this.emitDispatchTerminal(id, 'abandoned', [
      ...queuedReceipts,
      ...this.takeTurnDispatchIds(id),
    ])
    // Nothing can be recorded against a deleted conversation (C, F, G).
    this.lastSettledTurn.delete(id)
    this.unrecordedTurnIds.delete(id)
    this.unmarkedSentInputs.delete(id)
    if (this.attachments) {
      void this.attachments.deleteForSession(id)
    }
  }

  archive(id: string): void {
    if (!this.getById(id)) throw new Error(`Session not found: ${id}`)
    this.updateArchiveState(id, new Date().toISOString())
  }

  unarchive(id: string): void {
    if (!this.getById(id)) throw new Error(`Session not found: ${id}`)
    this.updateArchiveState(id, null)
  }

  /**
   * Returns the turn's dispatch id (MAR-2759): the delivery receipt for this
   * input. Callers that hand work over on someone's behalf -- the relay
   * engine -- hold it to recognise the settle that consumed the input; a
   * caller relaying what a person typed may simply drop it.
   */
  async start(id: string, input: SendMessageInput): Promise<string> {
    const dispatchId = randomUUID()
    const receipt = await this.withDispatchInFlight(id, input, () =>
      this.openFirstTurn(id, input, dispatchId),
    )
    if (receipt)
      this.recordAcceptedTurn(id, dispatchId, 'the turn publication', () =>
        receipt.publish(),
      )
    return dispatchId
  }

  /**
   * Writes the fact "this session's current turn is a conversation reset"
   * (MAR-3298 R2), at the moment a turn leaves for the provider -- and it is
   * the ONLY writer (MAR-3307). Both doors call it: `withDispatchInFlight`
   * for a direct send and `sendQueuedRow` for a row leaving the queue. With
   * the direct door as the only writer, a `/clear` drained from the queue
   * (every opener a busy seat queued) never set it, so its failure stranded
   * the brief behind it.
   *
   * Returns true only when this call set the mark, so a caller whose send
   * then fails clears exactly its own mark and never a reset already in
   * flight.
   */
  private markResetInFlight(sessionId: string, text: string): boolean {
    if (text !== CONVERSATION_RESET_COMMAND) return false
    const providerId = this.getById(sessionId)?.providerId ?? ''
    if (!providerSupportsConversationReset(providerId)) return false
    if (this.resetsInFlight.has(sessionId)) return false
    this.resetsInFlight.add(sessionId)
    return true
  }

  /**
   * Runs a send with the session marked as dispatching for the whole of it
   * (MAR-2550).
   *
   * The marker is set synchronously — before `dispatch` is entered, let alone
   * before its first `await` — and cleared only once the send has settled. By
   * then either a handle is registered, so every guard sees a busy session
   * again, or the send failed and the session really is idle. In between,
   * `describeModelSelectionRefusal` would otherwise see a session with no
   * running status and no handle, accept a new model, write it to the row and
   * announce the boundary in the transcript, while the turn already in flight
   * ran on the old one.
   *
   * The marker is also what `isCarryingATurn` reads to queue an opener behind
   * a send that has not reached the provider yet -- and a send is an ATTEMPT,
   * not a turn (MAR-2759, design P). When the attempt fails, no settle will
   * ever drain what queued behind it, so the failure branch here is the
   * transition out of carrying a turn that owns those rows: the marker is
   * cleared first, so the question is asked of the session as it now is, and
   * the rows are terminated unless another send or a live turn still carries
   * them.
   */
  private async withDispatchInFlight<T>(
    sessionId: string,
    input: SendMessageInput,
    dispatch: (inFlight: SessionDispatch) => Promise<T>,
    options: DispatchDoorOptions = {},
  ): Promise<T> {
    this.assertNotCompacting(sessionId)
    if (
      !options.passesQueueHold &&
      !this.isAnswerToAPendingQuestion(sessionId, input)
    )
      this.assertQueueNotHeld(sessionId)
    this.assertNoPendingAccountHandoff(sessionId)
    const handoffSession = this.getById(sessionId)
    const queuesFollowUp =
      handoffSession?.status === 'running' &&
      this.resolveDeliveryMode(handoffSession, input.deliveryMode) ===
        'follow-up' &&
      getMidRunInputCapabilityForProviderId(handoffSession.providerId)
        .supportsAppQueuedFollowUp
    const handoff =
      !!handoffSession &&
      !queuesFollowUp &&
      this.isAccountHandoff(handoffSession, input.providerAccountId)
    if (handoff && handoffSession)
      this.assertAccountHandoffEligible(handoffSession)
    // Read before registering this dispatch: only an earlier send counts as busy.
    // Refuse outside the try below too: a cold-start refusal must not enter
    // queue termination and end the earlier turn's queued inputs.
    if (
      input.text === CONVERSATION_RESET_COMMAND &&
      providerSupportsConversationReset(
        this.getById(sessionId)?.providerId ?? '',
      )
    ) {
      if (input.attachmentIds?.length || input.skillSelections?.length) {
        throw new Error(
          'A conversation reset cannot carry attachments or skill selections.',
        )
      }
      const resetTarget = this.getById(sessionId)
      if (resetTarget && this.isTurnUnderWayOrArriving(resetTarget)) {
        // Typed for the same reason the provider's own refusal is
        // (MAR-2888): a relay delivery must be able to tell "not now" from
        // "broken", and this door says "not now".
        //
        // `isTurnUnderWayOrArriving`, which is two cases and not one. A
        // dispatch in flight is a turn. So is a handle attached whose turn
        // has not ended -- and that covers the beat between `start()`
        // returning and the provider's first status, where the row still
        // reads `idle` while a turn is coming up. What it deliberately does
        // NOT cover is a handle attached to a session whose turn is over: a
        // resident handle outlives its turn, so asking "is a handle
        // attached" called an idle session busy, and the refusal became a
        // queued row with nothing to drain it -- the only automatic drain is
        // a handle's own `completed`, which was never coming again.
        throw new ProviderBusyError(
          'Wait for the current turn to finish before clearing the conversation.',
        )
      }
      // Remembered until the next lifecycle so a failed reset can drain the
      // brief queued behind it (MAR-3298 R2). Cleared on hand Stop too.
      this.markResetInFlight(sessionId, input.text)
    }
    if (handoff) this.pendingAccountHandoffs.add(sessionId)
    const inFlight = this.dispatches.begin(sessionId)
    try {
      return await dispatch(inFlight)
    } catch (error) {
      this.resetsInFlight.delete(sessionId)
      this.dispatches.settle(inFlight)
      // A busy refusal proves a turn owns the queue (MAR-2888). Every other
      // failure leaves the session idle with rows waiting on nothing, which
      // is what this terminal is for; a refusal that says "mid-turn" says
      // the opposite -- there IS a turn, and its completion will drain them.
      //
      // Since MAR-2971 the sweep only fails rows it ATTEMPTED, so a `queued`
      // row already survives this path, and the drain is synchronous end to
      // end -- no row is `dispatching` while another send runs. So this
      // guard has no live path on this base: it is a PIN, stating the rule
      // where the rule belongs so that widening the sweep back out cannot
      // quietly re-create the bug the sweep's narrowness is currently
      // hiding.
      if (!isProviderBusyError(error)) {
        this.terminateQueueUnlessCarryingATurn(
          sessionId,
          error instanceof Error ? error.message : String(error),
        )
      }
      throw error
    } finally {
      if (handoff) this.pendingAccountHandoffs.delete(sessionId)
      this.dispatches.settle(inFlight)
    }
  }

  private async openFirstTurn(
    id: string,
    input: SendMessageInput,
    dispatchId: string,
  ): Promise<InitialDispatchReceipt | void> {
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)

    // Refuse before the turn spends anything (MAR-2682). Convergence owns the
    // record, so a start the host refuses must not appear in it.
    await this.preflightTurnProvider(session)

    // The last `await` of this method, and it stays above the start because the
    // line below reads the rows it moves. It is a write, and a turn refused
    // below has already made it; what it leaves is no visible or semantic
    // consequence -- a refused turn leaves attachments resolvable by their
    // ids, and a later successful turn owns them exactly as a turn that was
    // never refused would. That is behaviour and it is pinned by behaviour:
    // the canaries "refuses a start when the listing is refreshed under the
    // awaited rebind" and "leaves a barrier-refused start's rebind inert" in
    // `session.service.test.ts` are what make it true, and the second is what
    // would go red if `rebindToSession` stopped being idempotent.
    await this.rebindDraftAttachments(id, input.attachmentIds)

    // This method writes nothing else. The barrier and every consequence of
    // the turn -- the unarchive, the boot context, the note -- are
    // `startHandle`'s own lines, so no edit here can put an `await` between
    // the host's verdict and the writes it authorises.
    const attachments = this.resolveAttachments(input.attachmentIds)

    const pending = this.startHandle(
      session,
      input.text,
      this.getContinuationToken(id),
      attachments,
      input.skillSelections,
      input.providerAccountId,
      {
        muteRelays: input.muteRelays,
        bootContext: { contextItemIds: input.contextItemIds },
      },
    )
    // Attached only once the start was permitted and spawned: a refused turn
    // consumed nothing, so its receipt must never ride a later settle.
    const receipt = pending ? await pending : undefined
    this.attachDispatchToTurn(id, dispatchId)
    return receipt
  }

  /**
   * The boot context, computed and not yet announced (MAR-2682).
   *
   * Split from the recording because the two belong on opposite sides of the
   * start: the augmented text has to exist before `host.start` can be handed
   * it, and the transcript note must not exist until `host.start` has been
   * called. Written as one step, the note was in the transcript of turns that
   * never started.
   */
  private computeBootContext(
    session: Session,
    originalText: string,
    contextItemIds: string[] | undefined,
    deferAttachment = false,
  ): {
    augmentedText: string
    noteDraft: ConversationItemDraft | null
    commit?: () => void
  } {
    if (!this.contextInjection) {
      return { augmentedText: originalText, noteDraft: null }
    }

    if (
      providerSupportsConversationReset(session.providerId) &&
      originalText === CONVERSATION_RESET_COMMAND
    ) {
      return { augmentedText: originalText, noteDraft: null }
    }
    return this.contextInjection.prepareBoot({
      session,
      originalText,
      contextItemIds,
      deferAttachment,
    })
  }

  private prepareUserTurnText(
    session: Session,
    originalText: string,
    skipContextInjection?: boolean,
  ): string {
    if (
      skipContextInjection ||
      (providerSupportsConversationReset(session.providerId) &&
        originalText === CONVERSATION_RESET_COMMAND)
    )
      return originalText
    if (!this.contextInjection) return originalText
    return this.contextInjection.prepareUserTurn({ session, originalText })
  }

  private recordBootContextNote(
    sessionId: string,
    draft: ConversationItemDraft,
  ): void {
    const item = this.addConversationItem(sessionId, draft)
    if (!item) return
    this.notifySessionChange(sessionId, {
      sessionId,
      op: 'add',
      item,
    })
  }

  /** Returns the input's dispatch id -- the delivery receipt (MAR-2759). */
  async sendMessage(id: string, input: SendMessageInput): Promise<string> {
    return this.deliverSendMessage(id, input, {})
  }

  /**
   * A PERSON's send door (MAR-3288) -- the one the composer and every
   * app-api client reach, through `SessionAppService.sendSessionMessage`.
   *
   * A compaction, or the hold a drill takes around one, is a wait that ends
   * on its own in a minute. A horse's return already waits it out in the
   * queue (MAR-3020); a person's message used to be refused with a toast
   * instead, which Marcin ruled against on the first live drill: "lets queue
   * them if possible like it do for horses". So this door answers that ONE
   * refusal the way `deliverRelayMessage` does -- one `follow-up` row
   * carrying the whole input -- and the drain at the end of the compaction
   * (or `releaseQueue` at the end of the drill) sends it.
   *
   * Only `SessionCompactingError`, and not every busy refusal. "The target is
   * mid-turn" still reaches the person as it always has: that one has a
   * delivery mode of its own the composer chooses, and swallowing it here
   * would quietly change what Steer and Normal mean.
   *
   * A door of its own rather than a catch inside `sendMessage`: the internal
   * callers -- `sendMessageWithOpener`, `deliverRelayMessage` -- must still
   * SEE the refusal, because its class is what the hop ledger reads to say
   * `waitingOn: 'compaction'` (R4).
   */
  async sendPersonMessage(
    id: string,
    input: SendMessageInput,
  ): Promise<{ dispatchId: string; queued: boolean }> {
    try {
      return { dispatchId: await this.sendMessage(id, input), queued: false }
    } catch (error) {
      if (!(error instanceof SessionCompactingError)) throw error
      const dispatchId = randomUUID()
      // The WHOLE input, as `deliverRelayMessage` writes it: attachments,
      // skills, the account (null when absent) and every flag the row keeps.
      this.queuedInputs.enqueue(
        id,
        {
          ...input,
          providerAccountId: input.providerAccountId ?? null,
          dispatchId,
        },
        'follow-up',
      )
      return { dispatchId, queued: true }
    }
  }

  /**
   * One beat of the context drill, and the only send that passes a queue hold
   * (MAR-3255 R2).
   *
   * The hold exists to keep everybody ELSE out of this conversation while the
   * routine seals it, compacts it and wakes it again -- so the routine's own
   * two messages need a door of their own. A method rather than a flag on
   * `SendMessageInput`: the bypass must not be something any caller can ask
   * for by setting a property, and the two beats never carry attachments or a
   * delivery mode of their own.
   *
   * The ACCOUNT is not the routine's to choose either, and absent is a third
   * value here (MAR-3285). `isAccountHandoff` reads a missing
   * `providerAccountId` as `null`, so a beat that named no account was read as
   * a HANDOFF to the default login: the resident connection ended with
   * "account changed" and the seal turn failed to authenticate against a
   * credential this conversation had never been using. So the beat rides the
   * account the conversation's last turn actually ran on -- the raw
   * `getLastTurnProviderAccountId`, which is the very value that comparison is
   * made against, and the one `compactContext` already passes. Raw and not the
   * relay engine's `resolveAccountForAutomaticTurn`: any substitution, however
   * reasonable, names an account the last turn did not run on and is therefore
   * a handoff again.
   *
   * Always quiet and always uninjected. Quiet because a sealing reply ENDS in
   * a `BATON:` line by convention and a wire firing on it would dispatch a
   * lap nobody asked for; uninjected because the project-context block would
   * be prepended to a message whose exact four words the agent's protocol
   * answers to.
   *
   * It does NOT pass a compaction: `assertNotCompacting` still refuses here,
   * because a beat sent into a context being rewritten is the failure the
   * compaction door exists for, drill or not.
   */
  async sendDrillBeat(id: string, text: string): Promise<string> {
    return this.deliverSendMessage(
      id,
      {
        text,
        muteRelays: true,
        skipContextInjection: true,
        providerAccountId: this.getLastTurnProviderAccountId(id),
      },
      { passesQueueHold: true },
    )
  }

  private async deliverSendMessage(
    id: string,
    input: SendMessageInput,
    options: DispatchDoorOptions,
  ): Promise<string> {
    const dispatchId = randomUUID()
    const receipt = await this.withDispatchInFlight(
      id,
      input,
      () => this.deliverMessage(id, input, dispatchId),
      options,
    )
    if (receipt)
      this.recordAcceptedTurn(id, dispatchId, 'the turn publication', () =>
        receipt.publish(),
      )
    return dispatchId
  }

  private async deliverMessage(
    id: string,
    input: SendMessageInput,
    dispatchId: string,
  ): Promise<InitialDispatchReceipt | void> {
    let session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)

    if (session.providerId === 'shell') {
      throw new Error(
        `Session ${id} uses the shell provider and cannot accept conversation messages`,
      )
    }

    // A snapshot, and named as one: two awaits follow it, and what it says
    // about the map is only true of the moment it was taken (MAR-2682). The
    // send's own branch is chosen from a second read below, after the last of
    // those awaits.
    const handleWhenAsked = this.activeHandles.get(id)
    if (!handleWhenAsked && session.status === 'running') {
      // An observation, not a consequence: the provider process is genuinely
      // gone, and that is true whether or not this send is allowed to proceed.
      // It therefore stays above the refusal below, where the two writes that
      // *are* consequences of the send no longer do. It is also the one thing
      // here the snapshot may still drive: it is a statement about the moment
      // the snapshot was taken, not a decision about where this send goes.
      session = this.markStaleRunningSessionFailed(
        session,
        'Session marked failed because Convergence no longer has an active provider process for this run.',
        true,
      )
    }

    const deliveryMode = this.resolveDeliveryMode(session, input.deliveryMode)

    // Refuse before this send leaves a mark (MAR-2682). Unarchiving the session
    // is a consequence of sending, and a refused send must not leave one -- a
    // blocked provider used to be caught *after* the unarchive, so the rejected
    // action still un-archived the session it rejected.
    //
    // The draft rebind below is a write, and a send this verdict refuses has
    // already made it -- the refusal is raised below the rebind now, because
    // the decision it belongs to cannot be taken above it. What it leaves is no
    // visible or semantic consequence: "refuses a send when the listing is
    // refreshed under the awaited rebind" pins that the ids still resolve after
    // this door refuses, and its start-door sibling ("leaves a barrier-refused
    // start's rebind inert") pins that the turn after the refusal owns them
    // exactly as an unrefused one does -- the same `rebindToSession` call, so
    // the same answer here. Behaviour is held by those canaries, not by this
    // comment.
    //
    // A session with a live handle is exempt: it is already running on this
    // provider, and refusing mid-run would strand a turn on a decision that was
    // made when it started. The question is still asked for it -- one read of a
    // listing its host usually already holds -- but the answer is never acted
    // on, here or at the door it reaches, and that includes the case where the
    // sequence could not answer at all: an Endpoint that cannot be listed any
    // more is exactly the mid-run refusal the exemption forbids. Which is why
    // it is *carried* rather than thrown: whether this send is one of the
    // exempt ones is not knowable until the read below, and a throw here would
    // decide it from the snapshot above.
    const verdict = await this.queryTurnProviderVerdict(session)

    // The last `await` of this method, for the same reason as in
    // `openFirstTurn`.
    await this.rebindDraftAttachments(id, input.attachmentIds)

    // -- One decision, taken from the map as it is now (MAR-2682). Both awaits
    // are above this line, so nothing can install or release a handle between
    // the read and the branch it chooses. A handle landing under those awaits
    // (a second send, a boot reattach) must reach the exempt path, and a handle
    // released under them (its run settled) must not be sent to: it is
    // disposed, and the send would resolve while the message went nowhere. --
    const handle = this.activeHandles.get(id)
    if (!handle && !verdict.permitted) throw verdict.refusal

    const attachments = this.resolveAttachments(input.attachmentIds)

    if (handle) {
      // The exempt path, and the only unarchive still written from this body.
      // A live handle asks the host nothing -- refusing mid-run would strand a
      // turn on a decision made when it started -- so the verdict above is not
      // consulted, and there is no verdict here for this write to be separated
      // from.
      if (session.archivedAt) {
        this.updateArchiveState(id, null)
      }
      await this.dispatchToActiveHandle({
        session,
        handle,
        input,
        attachments,
        deliveryMode,
        dispatchId,
      })
      return
    }

    // Descriptive only: which branch below can carry this turn. The permission
    // to take it is asked inside the branch that takes it -- `sendRemoteTurn`
    // and `startHandle` each ask above their own writes -- so nothing this
    // method does can land above a refusal.
    const capabilities = this.turnProviderCapabilities(session)

    const continuationToken = this.getContinuationToken(id)
    if (
      deliveryMode === 'follow-up' &&
      session.status === 'running' &&
      getMidRunInputCapabilityForProviderId(session.providerId)
        .supportsAppQueuedFollowUp
    ) {
      this.queuedInputs.enqueue(
        session.id,
        { ...input, dispatchId },
        'follow-up',
      )
      return
    }

    if (deliveryMode !== 'normal') {
      throw new Error(
        `Session cannot accept ${deliveryMode} input while inactive`,
      )
    }

    if (isRemoteExecutionHost(session.executionHost)) {
      this.sendRemoteTurn({
        session,
        text: this.prepareUserTurnText(
          session,
          input.text,
          input.skipContextInjection,
        ),
        attachments,
        attachmentIds: input.attachmentIds,
        skillSelections: input.skillSelections,
        providerAccountId: input.providerAccountId,
        muteRelays: input.muteRelays,
      })
      this.attachDispatchToTurn(id, dispatchId)
      return
    }

    if (capabilities?.supportsContinuation && continuationToken) {
      const augmentedText = this.prepareUserTurnText(
        session,
        input.text,
        input.skipContextInjection,
      )
      const pending = this.startHandle(
        session,
        augmentedText,
        continuationToken,
        attachments,
        input.skillSelections,
        input.providerAccountId,
        { muteRelays: input.muteRelays },
      )
      const receipt = pending ? await pending : undefined
      this.attachDispatchToTurn(id, dispatchId)
      return receipt
    }

    if (capabilities?.supportsContinuation) {
      throw new Error(
        `Session cannot be resumed: missing continuation state. Start a new session.`,
      )
    }

    throw new Error(`Session not active: ${id}`)
  }

  /**
   * Sends `opener` on its own and queues `text` behind it (F9, the recycled
   * worker).
   *
   * Two beats, one call, because the gap between them is a race the caller
   * cannot win: a turn does not report itself running until the provider
   * process has actually started, so a caller that sent the opener and then
   * asked for a follow-up would be told the session is idle and start a
   * second turn alongside the first. Queuing here, synchronously, means the
   * payload is behind the opener before anything can observe otherwise.
   *
   * The opener bypasses context injection so it arrives byte for byte; the
   * payload does not, because it is an ordinary message and the target may
   * well need its project context re-stated after being wiped.
   *
   * **The opener is always quiet, and that is structural rather than a choice
   * a caller makes** (MAR-2759). An opener is the loop's own plumbing: the
   * turn it produces finishes nothing, so a wire leaving the target that
   * treated it as a finish would cascade -- a `/clear` answering itself into
   * the next station. There is deliberately no flag to turn this off, because
   * a loud opener is never what anybody wanted, and the engine's in-memory
   * plumbing claim cannot cover a settle that arrives after a restart. This
   * mark is in the database, so it can.
   *
   * The payload behind it stays an ordinary triggering send: it IS the work.
   *
   * **An opener is always its own turn** (MAR-2759, design X). Decided here,
   * at dispatch: an idle target takes the opener as a turn of its own; a
   * target that is carrying a turn -- running with a live handle, a remote
   * turn reattached after a restart, or a send still on its way to the
   * provider -- gets the opener QUEUED durably as a follow-up with its own
   * receipt, ahead of the payload, so it runs on its own once the current
   * turn ends. On every provider, including the ones with native follow-up:
   * a `/clear` joining somebody's running turn was never what anybody meant,
   * and it made that turn's settle name the opener's receipt beside real
   * work -- which, after a restart had lost the work's own receipts, read as
   * plumbing and erased it without a row. A queued opener means "every id
   * this settle names is an opener's" is true by construction: nothing else
   * can finish in an opener's turn.
   *
   * The queue is Convergence's, not the provider's: `dispatchNextQueuedInput`
   * runs when the session settles, so this works on any provider rather than
   * only the ones with native mid-run input.
   */
  async sendMessageWithOpener(
    id: string,
    input: SendMessageInput & { opener: string },
  ): Promise<{
    openerDispatchId: string
    payloadDispatchId: string
    /** True when the opener is WAITING behind a turn rather than under way. */
    openerQueued: boolean
    /** Why it waits, when it waits. Absent when the opener went out. */
    waitingOn?: BusyWaitReason
  }> {
    this.assertNoPendingAccountHandoff(id)
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)

    const enqueueOpener = (): SessionQueuedInput & { dispatchId: string } => {
      const dispatchId = randomUUID()
      const row = this.queuedInputs.enqueue(
        id,
        {
          text: input.opener,
          providerAccountId: input.providerAccountId ?? null,
          skipContextInjection: true,
          muteRelays: true,
          dispatchId,
        },
        'follow-up',
      )
      return { ...row, dispatchId }
    }
    const queueOpener = (): string => enqueueOpener().dispatchId

    let openerDispatchId: string
    let openerQueued = true
    let waitingOn: BusyWaitReason | undefined = 'turn'
    // A compacting target waits exactly as a busy one does (MAR-3020). This
    // door used to let `assertNotCompacting` leave from the top, which threw
    // the whole delivery away -- opener and payload both -- for a wait that
    // ends on its own in a minute. Queue BOTH beats, in order, and the drain
    // at the end of compaction sends them.
    //
    // Asked before `isCarryingATurn` rather than after, because the two can
    // both be false-ish here and only one of them is true: compaction
    // releases the handle before it starts, so a compacting session reads as
    // carrying no turn, and the `else` would send the opener straight into a
    // conversation whose context is being rewritten underneath it.
    //
    // A HELD queue waits here for the same reason (MAR-3255 R2): the drill
    // is a compaction with two turns strapped to it, and the opener that
    // arrives mid-routine is owed the same wait rather than a thrown-away
    // delivery.
    if (this.compactingSessions.has(id) || this.heldSessions.has(id)) {
      openerDispatchId = queueOpener()
      waitingOn = 'compaction'
    } else if (
      this.isCarryingATurn(session) ||
      // The direct door's own reset refusal, asked here because the opener
      // no longer goes through that door (MAR-3307): a handle whose turn has
      // not ended -- `answered` included (MAR-2896) -- is a turn arriving,
      // and a `/clear` waits for it.
      (input.opener === CONVERSATION_RESET_COMMAND &&
        providerSupportsConversationReset(session.providerId) &&
        this.isTurnUnderWayOrArriving(session))
    ) {
      openerDispatchId = queueOpener()
    } else {
      const opener = enqueueOpener()
      openerDispatchId = opener.dispatchId
      if (await this.sendIdleOpener(session, opener)) {
        openerQueued = false
        waitingOn = undefined
      }
    }

    const payloadDispatchId = randomUUID()
    this.queuedInputs.enqueue(
      id,
      {
        text: input.text,
        providerAccountId: input.providerAccountId ?? null,
        dispatchId: payloadDispatchId,
      },
      'follow-up',
    )
    // Whether the opener is WAITING rather than under way, so the ledger can
    // say why the hop is queued instead of leaving the reason to be guessed,
    // and since MAR-3020 which of the two waits it is.
    return {
      openerDispatchId,
      payloadDispatchId,
      openerQueued,
      ...(waitingOn ? { waitingOn } : {}),
    }
  }

  /**
   * The idle opener leaves a row and goes out through the drain's door
   * (MAR-3307). One shape on disk for every opener, busy or idle: a row with
   * `text === '/clear'` in front of the payload, which is what boot recovery
   * reads to know that a restart interrupted a reset. The receipt is the
   * row's own dispatch id -- the door mints nothing -- and the door is what
   * marks the reset in flight, so a failed reset drains the brief behind it
   * on this path exactly as on the busy one.
   *
   * What the direct door did for this send is kept here, each for the reason
   * it had there: a `running` row with no handle is failed as stale first
   * (`deliverMessage`), before the opener's row exists, so that sweep cannot
   * end it; the MAR-2550 in-flight marker is held across the send, so a
   * second opener arriving in the await queues behind this one; an archived
   * session a live handle carries is unarchived (`deliverMessage`'s exempt
   * path -- `startHandle` unarchives the other one itself).
   *
   * Returns true when the opener went out, false when it waits in line.
   *
   * TWO parties know whether this target is busy and they can disagree
   * (MAR-2888). `isCarryingATurn` is the record's answer and it has just
   * said no; the provider answers from state the record cannot see -- an
   * app-server mid-turn, or still reconnecting -- and when it says no the
   * answer is the SAME answer: the opener waits behind the turn that is
   * actually running. Before this, that refusal ended the delivery, fired a
   * `delivery-failed` hail, and nothing retried: a baton on the floor.
   *
   * Only this refusal. Every other error still leaves here, because "the
   * target is mid-turn" is the one failure a queue can answer, and swallowing
   * the rest would turn a broken delivery into a silent wait. The row it
   * leaves ends as the direct door's attempt ended: failed, unless another
   * turn still carries it.
   */
  private async sendIdleOpener(
    session: Session,
    opener: SessionQueuedInput,
  ): Promise<boolean> {
    const id = session.id
    if (session.providerId === 'shell') {
      throw new Error(
        `Session ${id} uses the shell provider and cannot accept conversation messages`,
      )
    }
    if (!this.activeHandles.has(id) && session.status === 'running') {
      this.markStaleRunningSessionFailed(
        session,
        'Session marked failed because Convergence no longer has an active provider process for this run.',
        true,
      )
    }
    if (session.archivedAt && this.activeHandles.has(id)) {
      this.updateArchiveState(id, null)
    }
    this.queuedInputs.patch(opener.id, 'dispatching')
    const inFlight = this.dispatches.begin(id)
    const failure: { error?: unknown } = {}
    let outcome: 'sent' | 'deferred' | 'failed'
    try {
      outcome = await this.sendQueuedRow(id, opener, {
        ownDispatch: true,
        onFailure: (error) => {
          // The marker first, as `withDispatchInFlight`'s catch does: the
          // question below is asked of the session as it now is.
          this.dispatches.settle(inFlight)
          if (isProviderBusyError(error)) {
            this.queuedInputs.patch(opener.id, 'queued')
            return
          }
          failure.error = error
          this.terminateQueueUnlessCarryingATurn(
            id,
            error instanceof Error ? error.message : String(error),
          )
        },
      })
    } finally {
      this.dispatches.settle(inFlight)
    }
    if ('error' in failure) throw failure.error
    return outcome === 'sent'
  }

  /**
   * A relay's delivery door (MAR-2888).
   *
   * `sendMessage` is the user's door and must stay loud: a person clearing a
   * conversation mid-turn should be told no, not have it happen later. A
   * relay is the other case -- nobody is watching the moment, the work is a
   * baton being handed on, and "the target is mid-turn" is an answer the
   * queue already knows how to give. So the catch lives here, at the caller
   * that wants it, rather than inside `sendMessage` where it would change
   * what the UI does.
   *
   * Returns whether the payload is waiting, which is what the hop reports.
   *
   * LOCAL ONLY, and not by choice (R5, MAR-2888). A remote handle's
   * `sendMessage` hands the text to `enqueueCommand`, which returns `void`
   * and posts fire-and-forget: the daemon's refusal comes back later as a
   * note and an attention change, never as a throw at the send site. So
   * there is no remote refusal to type or to catch here, and a remote target
   * mid-turn is still answered by the daemon's own queue rather than by this
   * one. Closing that needs a refusal on the wire, which is the remote
   * parity ticket's work, not a string match invented here.
   *
   * The Claude provider raises no busy refusal of its OWN -- it has no
   * conversation-reset command to refuse -- but that does not mean the Claude
   * path never meets one. Convergence's own reset door refuses first, and a
   * Claude handle is resident: it outlives its turn. That door is exactly
   * where a `/clear` hail at an idle Claude session was turned away, which is
   * why its predicate had to become "a turn is under way or arriving" rather
   * than "a handle is attached" (lap 2).
   *
   * A COMPACTING target waits here too (MAR-3020). Compaction is the same
   * answer as a running turn -- "not now" -- from a different party:
   * Convergence's own door rather than the provider's. It arrives typed, as
   * a `SessionCompactingError`, so it lands in the catch below without a new
   * branch, and `waitingOn` carries which of the two it was. Before this it
   * left here as a plain error: the hop was recorded `error`, a chair was
   * hailed, and nothing retried -- so an automatic compaction during a night
   * wave ate the horse's return. The other half of the fix is the drain at
   * the END of compaction (`compactContext`'s `finally`); queuing a row that
   * nothing ever drains is just a slower way to lose it.
   */
  async deliverRelayMessage(
    id: string,
    input: SendMessageInput,
  ): Promise<{
    dispatchId: string
    queued: boolean
    /** Why it waits, when it waits. Absent when the delivery went out. */
    waitingOn?: BusyWaitReason
  }> {
    try {
      return { dispatchId: await this.sendMessage(id, input), queued: false }
    } catch (error) {
      if (!isProviderBusyError(error)) throw error
      const dispatchId = randomUUID()
      // The WHOLE input, the shape both enqueues in `deliverMessage` use.
      // Naming three fields by hand was an incomplete copy: it dropped
      // `muteRelays` and `skipContextInjection`, so a row queued here lost
      // properties the same row keeps on every other path. Nothing changes at
      // runtime -- the one caller passes text and account -- but the trap goes,
      // and it had already cost a lap: a pin meant to prove a borrowed mute
      // came back was hollow because the row it queued was never muted.
      this.queuedInputs.enqueue(
        id,
        {
          ...input,
          providerAccountId: input.providerAccountId ?? null,
          dispatchId,
        },
        'follow-up',
      )
      // WHICH refusal this was, so the ledger can say the true sentence
      // rather than the likely one (MAR-3020 R5). Read from the class, not
      // from the message: the words are user-facing and get reworded.
      return {
        dispatchId,
        queued: true,
        waitingOn:
          error instanceof SessionCompactingError ? 'compaction' : 'turn',
      }
    }
  }

  /**
   * Whether this conversation could be compacted right now, and in the words
   * it would be refused with (MAR-3255 R3).
   *
   * The SAME guards `compactContext` runs, because it is the same method: a
   * second reading of the same questions would drift, and the party that asks
   * this one -- the context drill, before it spends a turn asking an agent to
   * seal its memory -- must never be told yes by a reader the compaction
   * itself would then refuse.
   *
   * A compaction already in flight is asked about HERE and not inside the
   * shared method (MAR-3255 R9). `compactContext` runs `assertNotCompacting`
   * as its own first line and it stays there, unmoved -- so no refusal
   * changed places for the compaction itself -- but a reader that skipped
   * the question answered "yes, compactable" during a person's own Compact,
   * and a drill started on that answer would hold the queue, send a beat,
   * be refused by the compaction door and fail. The first line of both
   * callers is now the same question, asked in each one's own idiom.
   */
  describeCompactionReadiness(
    id: string,
  ): { ready: true } | { ready: false; reason: string } {
    try {
      this.assertNotCompacting(id)
      this.assertCompactionReady(id)
      return { ready: true }
    } catch (error) {
      return {
        ready: false,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Every question asked before a compaction is allowed to mark the session,
   * in one place (MAR-3255 R3), returning what it had to read to ask them.
   *
   * Order is the contract: a session that fails two of these is told about
   * the first, and both callers have to hear the same one.
   */
  private assertCompactionReady(id: string): {
    session: Session
    continuationToken: string
    execution: { host: ProviderExecutionHost; providerId: string }
    /**
     * The host's own `manageContext`, bound to it. Handed back rather than
     * re-read at the call site because the guard below is what proves it is
     * there, and a caller re-reading the optional property would need an
     * assertion this method has already earned.
     */
    manageContext: NonNullable<ProviderExecutionHost['manageContext']>
  } {
    if (this.dispatches.isDispatching(id)) {
      throw new Error('Wait for the pending send before compacting context')
    }
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)
    if (session.providerId === 'shell') {
      throw new Error('Shell sessions do not have a provider context')
    }
    if (isRemoteExecutionHost(session.executionHost)) {
      throw new Error(
        'Manual context management is not supported on remote execution hosts yet',
      )
    }
    // Two questions, and only the second one changed (MAR-3243).
    //
    // The first is the record's: a session this process has not settled to
    // `completed` -- `failed`, or a stale `running` whose process is gone --
    // is not an idle conversation, and compacting one is a behaviour nobody
    // has ruled. It stays refused exactly as before.
    //
    // The second used to ask whether a handle was ATTACHED, which is not "is
    // the session busy": a resident handle -- Claude's is `resident: true` --
    // is not released when its turn completes, so for the whole of its idle
    // window an idle Claude conversation read as busy and the compact button
    // was refused on the provider that made compaction popular.
    // `isTurnUnderWayOrArriving` covers the two cases that really are a turn:
    // a dispatch on its way up, and a handle whose turn has not ended yet --
    // which still refuses `running`, and refuses `answered` until the real
    // settle (MAR-2896).
    if (
      session.status !== 'completed' ||
      this.isTurnUnderWayOrArriving(session)
    ) {
      throw new Error('Context can only be compacted while the session is idle')
    }
    if (
      session.attention === 'needs-input' ||
      session.attention === 'needs-approval'
    ) {
      throw new Error(
        'Resolve the pending provider request before compacting context',
      )
    }
    // A row WAITING is what a hold is for (MAR-3255 R2). The drill holds this
    // queue precisely so the horses' returns pile up behind the three beats,
    // and then compacts -- so `queued` cannot be a refusal inside a hold or
    // the routine would refuse itself the moment anyone answered it. A row
    // mid-flight to the provider still refuses, held or not: that one is a
    // turn arriving, not a message waiting.
    //
    // Unheld, both operands stand exactly as they always have.
    const held = this.heldSessions.has(id)
    if (
      this.getQueuedInputs(id).some(
        (item) =>
          (!held && item.state === 'queued') || item.state === 'dispatching',
      )
    ) {
      throw new Error('Send or cancel queued input before compacting context')
    }

    const continuationToken = this.getContinuationToken(id)
    if (!continuationToken) {
      throw new Error('Context cannot be compacted without continuation state')
    }
    const execution = this.resolveExecution(session)
    const capability = execution.host.capabilitiesFor(execution.providerId)
    const manageContext = execution.host.manageContext
    if (!capability?.supportsContextManagement || !manageContext) {
      throw new Error(
        `${session.providerId} does not support manual context compaction`,
      )
    }
    return {
      session,
      continuationToken,
      execution,
      manageContext: manageContext.bind(execution.host),
    }
  }

  async compactContext(
    id: string,
    instructions?: string,
  ): Promise<ProviderContextManagementResult> {
    this.assertNotCompacting(id)
    const { session, continuationToken, execution, manageContext } =
      this.assertCompactionReady(id)

    this.compactingSessions.add(id)
    try {
      const timestamp = new Date().toISOString()
      this.applySessionPatch(id, {
        activity: 'compacting',
        updatedAt: timestamp,
      })
      this.notifySessionChange(id)
      // BEFORE the provider compacts, never after (MAR-3243 R2).
      //
      // Compaction runs in its own process -- Claude spawns
      // `claude -p --resume <token> /compact` -- while an idle resident
      // process still holds the same provider session. That process does not
      // re-read the session transcript: its later turns are written straight
      // to the stdin it already has (`claude-code-provider.ts`, where
      // `--resume` is passed only on the spawn of a new child). So it would
      // answer the next message from its own uncompacted memory and write
      // that memory back over the compacted transcript -- the compaction
      // would look like it happened and then quietly undo itself.
      //
      // Letting the idle handle go costs nothing the record needs: the door
      // above proved no turn is under way, and the next message respawns
      // with `--resume`, which reads what compaction left behind.
      await this.releaseHandle(id)
      const result = await manageContext(
        execution.providerId,
        {
          sessionId: session.id,
          workingDirectory: session.workingDirectory,
          initialMessage: '',
          previousAssistantTexts: previousAssistantMessageTexts(
            this.getConversation(id),
          ),
          model: session.model,
          effort: session.effort,
          serviceTier: session.serviceTier ?? null,
          continuationToken,
          permissionConfig: session.permissionConfig,
          providerAccountId: this.getLastTurnProviderAccountId(id),
        },
        {
          kind: 'compact',
          ...(instructions?.trim()
            ? { instructions: instructions.trim() }
            : {}),
        },
      )
      const completedAt = new Date().toISOString()
      this.applySessionPatch(id, {
        activity: null,
        contextWindow: result.contextWindow,
        updatedAt: completedAt,
      })
      const note = this.addConversationItem(id, {
        id: randomUUID(),
        turnId: null,
        kind: 'note',
        state: 'complete',
        level: 'info',
        text: 'Provider context compacted manually.',
        createdAt: completedAt,
        updatedAt: completedAt,
        providerMeta: {
          providerId: session.providerId,
          providerItemId: null,
          providerEventType: 'manual-context-compaction',
        },
      })
      this.notifySessionChange(
        id,
        note ? { sessionId: id, op: 'add', item: note } : undefined,
      )
      return result
    } catch (error) {
      this.applySessionPatch(id, {
        activity: null,
        updatedAt: new Date().toISOString(),
      })
      this.notifySessionChange(id)
      throw error
    } finally {
      // The delete comes FIRST, and the drain second (MAR-3020 R4). The
      // other order is a deadlock dressed as a retry: `dispatchNextQueuedInput`
      // would meet a session still marked compacting, be refused at its own
      // door -- and nothing would ever drain the row again.
      //
      // Pinned by a test, not by this comment (MAR-3253 R2). The door's guard
      // is synchronous, so a drain moved above the delete sees the mark,
      // returns, and both cases of `delivers the waiting relay row exactly
      // once when compaction ends` go red.
      this.compactingSessions.delete(id)
      // In the `finally`, so BOTH exits drain. A compaction that failed
      // still ends the wait: the row queued behind it is owed its delivery
      // either way, and hanging it on the success path would have made a
      // provider error eat a horse's return just as quietly as the bug this
      // ticket closes.
      //
      // Safe to send now, and not by luck: compaction does not mint a new
      // resume state for the drained row to race. The continuation token is
      // a PRECONDITION of compacting -- read at the top, refused if absent --
      // and `ProviderContextManagementResult` carries only a context window
      // back, so nothing rewrites it here. The handle was released before
      // the provider ran and is not re-established; the drained row respawns
      // with `--resume <token>` and reads exactly what compaction left.
      //
      // The same guard the "Deliver now" path uses, and the session is
      // re-read for it: the one in scope was read before the provider ran.
      const settled = this.getById(id)
      if (
        settled &&
        settled.status !== 'running' &&
        !this.dispatches.isDispatching(id)
      ) {
        void this.dispatchNextQueuedInput(id).catch((error) => {
          console.error('[session] Could not dispatch queued input', error)
        })
      }
    }
  }

  private isAccountHandoff(
    session: Session,
    accountId: string | null | undefined,
  ): boolean {
    return (
      this.turnProviderCapabilities(session)?.accountHandoff === 'settled' &&
      this.getContinuationToken(session.id) !== null &&
      this.getLastTurnProviderAccountId(session.id) !== (accountId ?? null)
    )
  }

  private assertNoPendingAccountHandoff(sessionId: string): void {
    if (this.pendingAccountHandoffs.has(sessionId)) {
      throw new HandoffRefusedError(
        'not-eligible',
        'An account handoff is already being prepared. Wait for it before sending another message.',
      )
    }
  }

  describeAccountHandoff(
    id: string,
  ): { ready: true } | { ready: false; reason: string } {
    try {
      const session = this.getById(id)
      if (!session) throw new Error(`Session not found: ${id}`)
      this.assertAccountHandoffEligible(session)
      return { ready: true }
    } catch (error) {
      return {
        ready: false,
        reason:
          error instanceof HandoffRefusedError
            ? (error.rule ?? error.message)
            : error instanceof Error
              ? error.message
              : String(error),
      }
    }
  }

  private assertAccountHandoffEligible(
    session: Session,
    own: { ownDispatch?: boolean; queuedInputId?: string } = {},
  ): void {
    this.assertNotCompacting(session.id)
    if (
      !isTerminalSessionStatus(session.status) ||
      this.activeHandles.has(session.id) ||
      (!own.ownDispatch && this.dispatches.isDispatching(session.id)) ||
      session.attention === 'needs-approval' ||
      session.attention === 'needs-input' ||
      this.queuedInputs
        .list(session.id)
        .some(
          (item) =>
            item.state === 'dispatching' && item.id !== own.queuedInputId,
        )
    ) {
      throw new HandoffRefusedError(
        'not-eligible',
        'Wait for this conversation and its pending requests to settle before switching accounts. Your message was not sent.',
        'Wait for this conversation and its pending requests to settle before switching accounts.',
      )
    }
  }

  /**
   * The compaction door (MAR-3020).
   *
   * The sentence is unchanged and still user-facing; what changed is its
   * TYPE. `SessionCompactingError` is a `ProviderBusyError`, so the three
   * busy-aware catches downstream -- the delivery door, the dispatch
   * terminal, the drain -- now treat a compaction the way they already treat
   * a running turn: as "ask again in a moment", which the queue can answer.
   * Before this, a relay hop that arrived mid-compaction was recorded as an
   * `error`, hailed a chair, and was never retried: a baton on the floor.
   *
   * Still a throw, and still loud for the user: `sendMessage` does not catch
   * it, so a person sending into a compacting conversation is refused now,
   * with the same words, rather than having it happen later.
   */
  private assertNotCompacting(sessionId: string): void {
    if (this.compactingSessions.has(sessionId)) {
      throw new SessionCompactingError(
        'This conversation is compacting. Wait for it to finish before sending another message.',
      )
    }
  }

  /**
   * The hold's door (MAR-3255 R2), and deliberately not part of
   * `assertNotCompacting`.
   *
   * `compactContext` runs that assertion as its own first line, so a hold
   * folded into it would make the drill refuse the very compaction it is
   * holding the queue for. This one is asked by the two SEND doors only.
   *
   * The same class and the same sentence as a compaction, because it is the
   * same answer: not now, ask again in a moment. That is what lets
   * `deliverRelayMessage` queue a horse's return with `waitingOn:
   * 'compaction'` instead of recording an error and hailing a chair -- the
   * drill is a minute of compaction wearing two extra turns, and the wait it
   * asks for is the wait the queue already knows how to serve.
   */
  private assertQueueNotHeld(sessionId: string): void {
    if (this.heldSessions.has(sessionId)) {
      throw new SessionCompactingError(
        'This conversation is compacting. Wait for it to finish before sending another message.',
      )
    }
  }

  /**
   * Whether this send is the answer to a question the provider is asking
   * RIGHT NOW (MAR-3255 R7) -- the one message a hold must never turn away.
   *
   * A held conversation differs from a compacting one in the way that
   * matters here: a compaction has no live turn, so nothing inside it can
   * ever be waiting on the user. A held one is mid-turn by construction, and
   * a turn that parks on `needs-input` ends only when somebody answers it.
   * Refusing the answer would leave the routine waiting for a settle that
   * cannot arrive, with the queue held, until the app restarts -- and the
   * party it locked out is the only party who could have freed it.
   *
   * BOTH conditions, and neither alone. `interactionResponse` alone is a
   * property any caller can set, so it would be a key to the hold rather
   * than an answer to a question. `needs-input` alone would let an ordinary
   * message walk in beside the answer, which is exactly what the hold is for.
   *
   * `approve` and `deny` never reach this door at all -- they go straight to
   * the handle -- so a permission prompt raised mid-routine was always
   * answerable; this is the free-text half catching up with it.
   */
  private isAnswerToAPendingQuestion(
    sessionId: string,
    input: SendMessageInput,
  ): boolean {
    if (!input.interactionResponse) return false
    return this.getById(sessionId)?.attention === 'needs-input'
  }

  /**
   * Holds this conversation's queue open for a routine (MAR-3255 R2).
   *
   * Arrivals queue and the drain refuses for as long as it is held. Idempotent:
   * the routine that took it is the routine that releases it.
   */
  holdQueue(sessionId: string): void {
    this.heldSessions.add(sessionId)
  }

  /**
   * Writes the drill's one transcript note (MAR-3255 R5).
   *
   * Narrow by design: `addConversationItem` is private and stays private, so
   * the routine cannot invent an item shape -- it hands over a sentence and
   * this decides everything else. A warning, because the drill stopping is
   * something the person who pressed the button has to see in the place they
   * are already looking; silent on a session that no longer exists, because a
   * note about a deleted conversation has nobody to tell.
   */
  addContextDrillNote(sessionId: string, text: string): void {
    const session = this.getById(sessionId)
    if (!session) return
    const at = new Date().toISOString()
    const note = this.addConversationItem(sessionId, {
      id: randomUUID(),
      turnId: null,
      kind: 'note',
      state: 'complete',
      level: 'warning',
      text,
      createdAt: at,
      updatedAt: at,
      providerMeta: {
        providerId: session.providerId,
        providerItemId: null,
        providerEventType: 'context-drill',
      },
    })
    this.notifySessionChange(
      sessionId,
      note ? { sessionId, op: 'add', item: note } : undefined,
    )
  }

  /** Records automatic compaction as an informational drill event. */
  addContextDrillInfoNote(sessionId: string, text: string): void {
    const session = this.getById(sessionId)
    if (!session) return
    const at = new Date().toISOString()
    const note = this.addConversationItem(sessionId, {
      id: randomUUID(),
      turnId: null,
      kind: 'note',
      state: 'complete',
      level: 'info',
      text,
      createdAt: at,
      updatedAt: at,
      providerMeta: {
        providerId: session.providerId,
        providerItemId: null,
        providerEventType: 'context-drill',
      },
    })
    this.notifySessionChange(
      sessionId,
      note ? { sessionId, op: 'add', item: note } : undefined,
    )
  }

  /** Transcript-only dispatch receipt; starts no turn and fires no wire. */
  addAutoDispatchNote(sessionId: string, text: string): void {
    const session = this.getById(sessionId)
    if (!session) return
    const at = new Date().toISOString()
    const note = this.addConversationItem(sessionId, {
      id: randomUUID(),
      turnId: null,
      kind: 'note',
      state: 'complete',
      level: 'info',
      text,
      createdAt: at,
      updatedAt: at,
      providerMeta: {
        providerId: session.providerId,
        providerItemId: null,
        providerEventType: 'auto-dispatch',
      },
    })
    this.notifySessionChange(
      sessionId,
      note ? { sessionId, op: 'add', item: note } : undefined,
    )
  }

  describeSeatAvailability(
    sessionId: string,
  ):
    | 'idle'
    | 'turn'
    | 'compacting'
    | 'drill'
    | 'waiting-on-you'
    | 'unknown'
    | 'failed' {
    const session = this.getById(sessionId)
    if (!session) return 'unknown'
    if (
      this.isTurnUnderWayOrArriving(session) ||
      this.isCarryingATurn(session) ||
      this.queuedInputs
        .list(sessionId)
        .some(
          (input) => input.state === 'queued' || input.state === 'dispatching',
        )
    )
      return 'turn'
    if (this.compactingSessions.has(sessionId)) return 'compacting'
    if (this.heldSessions.has(sessionId)) return 'drill'
    if (
      session.attention === 'needs-approval' ||
      session.attention === 'needs-input'
    )
      return 'waiting-on-you'
    if (session.status === 'failed') return 'failed'
    return 'idle'
  }

  isQueueHeld(sessionId: string): boolean {
    return this.heldSessions.has(sessionId)
  }

  /**
   * Lifts the hold and delivers what waited (MAR-3255 R2).
   *
   * The delete comes FIRST and the drain second, for the reason
   * `compactContext`'s `finally` spells out: the other order is a deadlock
   * dressed as a retry, because `dispatchNextQueuedInput` would meet a
   * session still marked held, refuse at its own door, and nothing would ever
   * drain the row again.
   *
   * A no-op when nothing is held, so every exit of a routine can call it
   * without asking -- including the exits that never reached the hold.
   */
  releaseQueue(sessionId: string): void {
    if (!this.heldSessions.delete(sessionId)) return
    // The same guard the compaction drain uses, and the session is re-read
    // for it: the routine held this queue across a compaction and two turns,
    // so nothing read before them is still true.
    const settled = this.getById(sessionId)
    if (
      settled &&
      settled.status !== 'running' &&
      !this.dispatches.isDispatching(sessionId)
    ) {
      void this.dispatchNextQueuedInput(sessionId).catch((error) => {
        console.error('[session] Could not dispatch queued input', error)
      })
    }
  }

  private async dispatchToActiveHandle(input: {
    session: Session
    handle: SessionHandle
    input: SendMessageInput
    attachments: Attachment[] | undefined
    deliveryMode: MidRunInputMode
    dispatchId: string
  }): Promise<void> {
    const { session, handle, attachments, deliveryMode } = input
    const capability = getMidRunInputCapabilityForProviderId(session.providerId)

    if (
      session.status !== 'running' &&
      deliveryMode !== 'normal' &&
      deliveryMode !== 'answer'
    ) {
      throw new Error(
        `Session cannot accept ${deliveryMode} input while ${session.status}`,
      )
    }

    if (!supportsMidRunInputMode(capability, deliveryMode)) {
      throw new Error(
        `${session.providerId} does not support ${deliveryMode} input`,
      )
    }

    assertLocalAccountSelection({
      executionHost: input.session.executionHost,
      accountId: input.input.providerAccountId,
    })

    if (deliveryMode === 'follow-up' && session.status === 'running') {
      if (!capability.supportsNativeFollowUp) {
        this.queuedInputs.enqueue(
          session.id,
          { ...input.input, dispatchId: input.dispatchId },
          'follow-up',
        )
        return
      }
    }

    const augmentedText = this.prepareUserTurnText(
      session,
      input.input.text,
      input.input.skipContextInjection,
    )

    let accepted = false
    const acceptTurn = () => {
      if (accepted) return
      accepted = true
      // Whatever the mode, the input just went INTO the turn this handle is
      // running (a native follow-up joins it; a normal send starts it), so that
      // turn's settle is the one that consumed this dispatch (MAR-2759).
      this.attachDispatchToTurn(session.id, input.dispatchId)
    }

    const previousMute = input.input.muteRelays
      ? this.getRowById(session.id)?.relays_muted
      : undefined
    this.requestRelayMute(input.session.id, input.input.muteRelays)
    let disposition: SendMessageDisposition
    try {
      const delivery = handle.sendMessage(
        augmentedText,
        attachments,
        input.input.skillSelections,
        {
          deliveryMode,
          onTurnAccepted: acceptTurn,
          interactionResponse: input.input.interactionResponse,
          providerAccountId: input.input.providerAccountId,
        },
      )
      disposition = delivery instanceof Promise ? await delivery : delivery
      if (
        disposition &&
        disposition !== 'queue-follow-up' &&
        disposition.kind === 'refused'
      ) {
        this.emitDispatchTerminal(session.id, 'failed', [input.dispatchId])
        throw new Error(disposition.reason)
      }
    } catch (error) {
      // The mute was borrowed for a send that never happened. Give it back
      // before the refusal leaves, or the turn already under way settles
      // quiet on somebody else's behalf (MAR-2888 lap 4).
      this.restoreRelayMute(session.id, previousMute)
      throw error
    }
    if (disposition === 'queue-follow-up') {
      // This input belongs to the next turn, including its relay choice.
      this.restoreRelayMute(session.id, previousMute)
      this.queuedInputs.enqueue(
        session.id,
        { ...input.input, dispatchId: input.dispatchId },
        'follow-up',
      )
      if (deliveryMode === 'answer') {
        try {
          const timestamp = new Date().toISOString()
          const note = this.addConversationItem(session.id, {
            id: randomUUID(),
            turnId: null,
            kind: 'note',
            state: 'complete',
            level: 'info',
            text: 'nothing to answer; queued as your next message',
            createdAt: timestamp,
            updatedAt: timestamp,
            providerMeta: {
              providerId: session.providerId,
              providerItemId: null,
              providerEventType: 'unconsumed-answer-queued',
            },
          })
          this.notifySessionChange(
            session.id,
            note ? { sessionId: session.id, op: 'add', item: note } : undefined,
          )
        } catch {
          // The input is already queued; a note cannot turn it into a failed dispatch.
        }
      }
      return
    }
    acceptTurn()
  }

  /**
   * Puts back the relay mute a send was about to borrow (MAR-2888 lap 4).
   *
   * A relay opener always asks for quiet, and the mute is written to the
   * session row BEFORE the send that can refuse it. When the refusal is
   * "mid-turn", the turn the target was ALREADY carrying is still running --
   * and it would settle quiet, recording `skipped-muted` on every armed wire
   * and raising no hail, as though a human had asked for silence. The baton
   * this feature saves is the new one; it must not drop the one in flight.
   *
   * `undefined` means the send never asked for quiet, so there is nothing to
   * put back; `1` means the session was already muted by somebody else's
   * request, which is not this send's to undo. Only a borrowed mute is
   * returned.
   */
  private restoreRelayMute(
    sessionId: string,
    previousMute: number | undefined,
  ): void {
    if (previousMute !== 0) return
    this.db
      .prepare('UPDATE sessions SET relays_muted = 0 WHERE id = ?')
      .run(sessionId)
  }

  /**
   * Whether a turn is running on this session OR on its way up (MAR-2888).
   *
   * The reset door's question, and NOT `isCarryingATurn`'s. A reset cannot
   * share a turn, so the door has to refuse for a window wider than "a turn
   * is running": it must also cover the beat between `start()` returning and
   * the provider's first status, where the row still reads `idle` while a
   * turn is on its way up.
   *
   * It used to ask whether a handle was ATTACHED, which is wider still and
   * wrong at the other end: a resident handle is not released when its turn
   * completes, so after any finished turn an idle session looked busy. That
   * refusal then became a queued input with nothing to drain it -- the only
   * automatic drain is a handle's own `completed` -- so a `/clear` hail at an
   * idle Claude session would have waited for a turn that was never coming.
   *
   * Measured, because the two cases are one field apart: cold start reads a
   * handle with status `idle`, an idle resident reads a handle with status
   * `completed`. So the question is "is there a handle, and has its turn not
   * ended yet", plus a send already on its way, which is a turn too.
   */
  private isTurnUnderWayOrArriving(session: Session): boolean {
    if (this.dispatches.isDispatching(session.id)) return true
    if (!this.activeHandles.has(session.id)) return false
    // `answered` deliberately refuses reset until the real settle (MAR-2896).
    // `isTerminalSessionStatus`, not two words written out again: that helper
    // is what the settle path asks, and its own docblock names the hazard --
    // a session with two ideas of "terminal" behaves differently depending on
    // which one a reader happened to use. A third word would land here and in
    // the settle at different times.
    return !isTerminalSessionStatus(session.status)
  }

  /**
   * Whether a turn is under way on this session, as far as this process can
   * tell: `running` with a live handle to carry it (a reattached remote turn
   * has one too), or a send that has begun and not yet reached a provider
   * (MAR-2550) -- for the width of that await the status is not `running`
   * yet, and an opener sent then could land inside the turn about to start.
   * A `running` row with neither is a process that is gone; the ordinary
   * send path fails it and starts afresh.
   *
   * The in-flight half proves an attempt, not a turn -- safe to queue behind
   * only because its failure has an owner: `withDispatchInFlight` terminates
   * the rows when the attempt fails and nothing else carries them (design P).
   */
  private isCarryingATurn(session: Session): boolean {
    if (this.dispatches.isDispatching(session.id)) return true
    return session.status === 'running' && this.activeHandles.has(session.id)
  }

  private resolveDeliveryMode(
    session: Session,
    requested: MidRunInputMode | undefined,
  ): MidRunInputMode {
    if (requested) return requested
    if (session.attention === 'needs-input') return 'answer'
    if (session.status === 'running') {
      const mode = getMidRunInputCapabilityForProviderId(
        session.providerId,
      ).defaultRunningMode
      if (!mode) {
        throw new Error(
          `${session.providerId} does not support messages while running`,
        )
      }
      return mode
    }
    return 'normal'
  }

  /**
   * The delivery receipt's in-flight half (MAR-2759): session id -> the
   * dispatch ids the turn currently running (or just dispatched) has consumed.
   *
   * Attached only after a send actually entered a turn -- a refused or failed
   * send attaches nothing -- and drained whole into the settle event by the
   * one statement that writes a terminal status, so a settle names exactly
   * the inputs its turn carried and a later turn can never inherit them.
   *
   * In memory, like the relay engine's batons, and erring the same direction:
   * a restart loses the ids of a turn already in flight, its hop goes
   * unstamped, and the stall hail asks a human -- one alarm too loud, never a
   * false "completed". The QUEUED half of a dispatch is the durable half: an
   * id on a queue row survives the restart and attaches to the turn it later
   * starts.
   */
  private readonly turnDispatchIds = new Map<string, Set<string>>()

  private attachDispatchToTurn(
    sessionId: string,
    dispatchId: string | null | undefined,
  ): void {
    if (!dispatchId) return
    const held = this.turnDispatchIds.get(sessionId)
    if (held?.has(dispatchId)) {
      // Not a guard: adding an id a Set already holds was a no-op before this
      // branch existed, and it still is. What the branch adds is the log — a
      // receipt re-attached to the turn that consumed it is a door delivering
      // twice, and that is worth seeing (MAR-3023).
      console.error(
        `[session] Dispatch ${dispatchId} is already attached to ${sessionId}'s turn`,
      )
      return
    }
    // A new dispatch is a new turn's: the settled turn's tail ends here (C).
    this.lastSettledTurn.delete(sessionId)
    if (held) held.add(dispatchId)
    else this.turnDispatchIds.set(sessionId, new Set([dispatchId]))
  }

  /** Drains every id the settling turn consumed; the settle owns them now. */
  private takeTurnDispatchIds(sessionId: string): string[] {
    const held = this.turnDispatchIds.get(sessionId)
    if (!held) {
      // A turn that carried no dispatch still settled: the previous turn's
      // tail ends here too (MAR-3023 lap 3, K), or a later loss would be
      // blamed on a turn two settles back.
      this.lastSettledTurn.delete(sessionId)
      return []
    }
    this.turnDispatchIds.delete(sessionId)
    const dispatchIds = [...held]
    this.lastSettledTurn.set(sessionId, {
      dispatchIds,
      turnId:
        this.unrecordedTurnIds.get(sessionId) ??
        this.activeTurnIds.get(sessionId) ??
        null,
    })
    return dispatchIds
  }

  private async rebindDraftAttachments(
    sessionId: string,
    attachmentIds: string[] | undefined,
  ): Promise<void> {
    if (!attachmentIds || attachmentIds.length === 0) return
    if (!this.attachments) return
    await this.attachments.rebindToSession(attachmentIds, sessionId)
  }

  private resolveAttachments(
    attachmentIds: string[] | undefined,
  ): Attachment[] | undefined {
    if (!attachmentIds || attachmentIds.length === 0) return undefined
    if (!this.attachments) {
      throw new Error(
        'Attachments service is not configured; cannot resolve attachment ids',
      )
    }
    const resolved = this.attachments.getMany(attachmentIds)
    if (resolved.length !== attachmentIds.length) {
      const resolvedIds = new Set(resolved.map((a) => a.id))
      const missing = attachmentIds.filter((id) => !resolvedIds.has(id))
      throw new Error(`Attachment(s) not found: ${missing.join(', ')}`)
    }
    return resolved
  }

  approve(
    id: string,
    providerApprovalId?: string,
    options?: { scope: 'once' | 'session' },
  ): void {
    const handle = this.activeHandles.get(id)
    if (!handle) {
      this.handleInactiveApprovalAction(id)
      return
    }
    handle.approve(providerApprovalId, options)
  }

  deny(id: string, providerApprovalId?: string): void {
    const handle = this.activeHandles.get(id)
    if (!handle) {
      this.handleInactiveApprovalAction(id)
      return
    }
    handle.deny(providerApprovalId)
  }

  private handleInactiveApprovalAction(id: string): void {
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)

    if (
      session.status === 'answered' &&
      isLocalExecutionHost(session.executionHost)
    ) {
      this.completeOrphanAnswer(session)
      return
    }

    if (session.status === 'running') {
      this.markStaleRunningSessionFailed(
        session,
        'Session marked failed because Convergence no longer has an active provider process for this approval request.',
        true,
      )
      return
    }

    if (session.attention !== 'needs-approval') return

    this.applySessionPatch(id, {
      attention:
        session.status === 'completed'
          ? 'finished'
          : session.status === 'failed'
            ? 'failed'
            : 'none',
      activity: null,
      updatedAt: new Date().toISOString(),
    })
    this.notifySessionChange(id)
  }

  stop(id: string): void {
    // Hand Stop during a reset must not drain the queue behind it
    // (MAR-3298 R2 STOP): Pi/Cursor `stop()` still emit `failed`, and without
    // clearing this flag `handleLifecycle` would treat that failed as a reset
    // outcome and deliver the brief the user just cancelled.
    this.resetsInFlight.delete(id)
    const handle = this.activeHandles.get(id)
    if (!handle) {
      const session = this.getById(id)
      if (
        session?.status === 'answered' &&
        isLocalExecutionHost(session.executionHost)
      ) {
        this.completeOrphanAnswer(session)
        return
      }
      if (session?.status === 'running') {
        this.markStaleRunningSessionFailed(
          session,
          'Session marked failed because Convergence no longer has an active provider process to stop.',
          true,
        )
        return
      }
      throw new Error(`Session not active: ${id}`)
    }
    if (this.getById(id)?.status === 'answered') {
      // A receipt can complete inside stopTask, before provider stop() arms
      // stoppedByUser for the separate fallback-Stop completion.
      this.retainingStoppedInputs.add(id)
      const tasks = this.listTasks(id)
      const runs = this.listAgentRuns(id)
      const ids = new Set([
        ...tasks
          .filter((t) => t.status === 'running' || t.status === 'unknown')
          .map((t) => t.taskId),
        ...runs
          .filter((r) => r.status === 'running' || r.status === 'unknown')
          .map((r) => r.taskId ?? r.id),
      ])
      void Promise.allSettled(
        [...ids].map((taskId) => handle.stopTask?.(taskId)),
      )
        .then(() => {
          if (this.activeHandles.get(id) !== handle) return
          // Conversation Stop is itself a witness if a task never confirms.
          if (!isTerminalSessionStatus(this.getById(id)?.status ?? 'idle'))
            this.stopAndRelease(id, handle)
          else this.releaseHandle(id)
        })
        .catch((error) => {
          console.error('[session] Could not finish conversation Stop', error)
        })
        .finally(() => this.retainingStoppedInputs.delete(id))
      return
    }
    if (handle.interrupt) {
      const fallback = () => {
        if (this.activeHandles.get(id) !== handle) return
        this.stopAndRelease(id, handle)
      }
      void handle
        .interrupt()
        .then((result) => {
          if (result === 'not-applicable') fallback()
        }, fallback)
        .catch((error) => {
          // Under a `void`, an uncaught throw here was an unhandled rejection
          // in the main process (MAR-3023 lap 5, A).
          console.error(`[session] Stop fallback failed for ${id}`, error)
        })
      return
    }
    this.stopAndRelease(id, handle)
  }

  /**
   * Stops a provider handle and always releases it (MAR-3023 lap 5, A; lap 6,
   * D) -- the one shape for every Stop site. A provider whose `stop()` throws
   * is logged, never left addressable, and never throws to the caller: the
   * user asked for the process to end, and a refused record is not a reason
   * for it not to.
   */
  private stopAndRelease(id: string, handle: SessionHandle): void {
    try {
      handle.stop()
    } catch (error) {
      console.error(`[session] Provider stop failed for ${id}`, error)
    } finally {
      this.releaseHandle(id)
    }
  }

  async disposeAllForQuit(): Promise<void> {
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.disposeAll(),
        new Promise<void>((resolve) => {
          deadline = setTimeout(resolve, 8000)
        }),
      ])
    } finally {
      clearTimeout(deadline)
    }
  }

  async disposeAll(): Promise<void> {
    this.quitting = true
    // Pending transcript patches land before anything is awaited (MAR-3274).
    // A provider that hangs past disposeAllForQuit's deadline must not cost
    // the last streamed words that were already coalesced when quit began.
    let dropped = this.flushAllPendingConversationPatches()
    for (const sessionId of Array.from(this.activeHandles.keys()))
      this.releaseHandle(sessionId, 'quit')
    await Promise.all(this.pendingHandleDisposals)
    // A provider may enqueue one last coalesced patch while its dispose runs;
    // write those while the database is still open (MAR-3274 R2).
    dropped += this.flushAllPendingConversationPatches()
    if (dropped > 0) {
      console.error(
        `[session] ${dropped} conversation patch(es) dropped at teardown: the database was already closed`,
      )
    }
    for (const timer of this.evidenceUpdateTimers.values()) clearTimeout(timer)
    this.evidenceUpdateTimers.clear()
    this.parallelWorkCounts.clear()
  }

  /**
   * Applies one delta to the session record on behalf of `source`, the handle
   * that emitted it.
   *
   * The handle travels with the delta because a session outlives its handles:
   * a remote session is started once and every later turn runs on a handle
   * that attached to the same daemon-side run. Which handle spoke is the only
   * thing that says whether a terminal event ends anything (MAR-2582).
   */
  private applyDelta(
    sessionId: string,
    delta: SessionDelta,
    source: SessionHandle,
  ): void {
    this.liveness.bump(sessionId)
    switch (delta.kind) {
      case 'harness.evidence': {
        const live = this.activeHandles.get(sessionId)
        if (live && live !== source) return
        if (
          delta.evidence.kind === 'agent.identified' ||
          (delta.evidence.kind === 'task.changed' &&
            delta.evidence.patch.toolUseId)
        )
          this.flushPendingConversationPatchesForSession(sessionId)
        const evidence = new HarnessEvidenceService(this.db)
        let renamed: ReturnType<HarnessEvidenceService['apply']>
        try {
          renamed = evidence.apply(
            sessionId,
            this.activeTurnIds.get(sessionId) ?? null,
            delta.evidence,
          )
        } catch (error) {
          // The evidence write is one transaction in its own service, so it
          // is tagged by the error's origin rather than by statement: only a
          // refusal from SQLite itself is a lost recording; a fold or a parse
          // that throws keeps its raw error (MAR-3023 B, D). Evidence arrives
          // on a provider's event stream for a turn it is running, so the loss
          // is announced here and never thrown into that stream.
          if (!(error instanceof Database.SqliteError)) throw error
          this.recordingErrorFor(
            sessionId,
            'the harness evidence',
            error,
          ).announce()
          return
        }
        this.scheduleEvidenceUpdate(sessionId)
        if (renamed) {
          const rows = this.db
            .prepare(
              `SELECT items.*, sessions.provider_id, agents.description AS agent_description, agents.agent_type
            FROM session_conversation_items items INNER JOIN sessions ON sessions.id=items.session_id
            LEFT JOIN session_agent_runs agents ON agents.session_id=items.session_id AND agents.id=items.agent_run_id
            WHERE items.session_id=? AND items.id IN (${renamed.itemIds.map(() => '?').join(',')}) ORDER BY items.sequence`,
            )
            .all(sessionId, ...renamed.itemIds) as ConversationItemRow[]
          for (const row of rows)
            this.notifySessionChange(sessionId, {
              sessionId,
              op: 'patch',
              item: conversationItemFromRow(row),
            })
        }
        return
      }
      case 'session.patch': {
        // A handle cannot speak over the handle that replaced it. A session
        // patch is a statement about the run, and this one's run is gone --
        // letting it through would move the status, the stream cursor and the
        // settle marker of a turn it has nothing to do with (MAR-2582). Its
        // conversation items are content and still land; only its claims about
        // the run are refused. A session with no live handle has nothing being
        // displaced, so a late patch there lands as it always did.
        const live = this.activeHandles.get(sessionId)
        if (live && live !== source) return
        // Still evidence the host is alive (the bump above), and nothing else:
        // the record applied this settle already, and applying it again would
        // end a turn that is only now running.
        if (this.isReplayedHostSettle(sessionId, delta)) return
        if (
          delta.patch.status === 'completed' ||
          delta.patch.status === 'failed'
        ) {
          this.flushPendingConversationPatchesForSession(sessionId)
        }
        this.applySessionPatch(sessionId, delta.patch, delta.executionHostSeq)
        this.noteRunOwnership(source, delta.patch.status)
        this.handleLifecycle(
          sessionId,
          delta.patch.status,
          source,
          delta.executionHostSeq,
        )
        this.notifySessionChange(sessionId)
        if (typeof delta.patch.prUrl === 'string') {
          for (const listener of [...this.pullRequestHintListeners]) {
            try {
              listener(sessionId)
            } catch (error) {
              console.error(
                `[session] PR hint listener failed for ${sessionId}`,
                error,
              )
            }
          }
        }
        return
      }

      case 'conversation.item.add': {
        const item = this.addConversationItem(
          sessionId,
          delta.item,
          delta.providerAccountId,
        )
        if (!item) return
        this.handleAssistantNaming(sessionId, item)
        this.notifySessionChange(sessionId, {
          sessionId,
          op: 'add',
          item,
        })
        return
      }

      case 'conversation.item.patch': {
        if (this.shouldCoalesceConversationPatch(delta.patch)) {
          this.enqueueConversationPatch(sessionId, delta.itemId, delta.patch)
          return
        }

        const pending = this.takePendingConversationPatch(
          sessionId,
          delta.itemId,
        )
        const patch = pending
          ? this.mergeConversationPatch(pending.patch, delta.patch)
          : delta.patch
        const item = this.patchConversationItem(sessionId, delta.itemId, patch)
        if (!item) return
        this.notifySessionChange(sessionId, {
          sessionId,
          op: 'patch',
          item,
        })
      }
    }
  }

  /**
   * Whether this patch is an execution host replaying a settle the record has
   * already applied, judged by the sequence that settled it (MAR-2582).
   *
   * Defence in depth, and no longer what keeps a replayed settle from ending
   * the next turn -- `handleLifecycle` does that, because a sequence marker
   * provably cannot. The same settle can reach the record through two
   * supported encodings, a dedicated `status` event and a `session.patch`
   * carrying one, and the second lands at a *higher* sequence: "later
   * sequence" is exactly what a duplicate looks like. And a row migrated from
   * a build that wrote the status and the cursor separately carries a marker
   * one sequence short of its own settle, so the replay sits above it.
   *
   * What it still buys: the cheapest possible rejection of the common case,
   * one row read and one comparison, before anything else looks at the patch.
   */
  private isReplayedHostSettle(
    sessionId: string,
    delta: Extract<SessionDelta, { kind: 'session.patch' }>,
  ): boolean {
    const seq = delta.executionHostSeq
    if (seq === undefined) return false
    const status = delta.patch.status
    if (!status || !isTerminalSessionStatus(status)) return false
    const row = this.getRowById(sessionId)
    return !!row && seq <= row.execution_host_settled_seq
  }

  private shouldCoalesceConversationPatch(
    patch: Partial<ConversationItem>,
  ): boolean {
    return patch.state === 'streaming'
  }

  private pendingConversationPatchKey(
    sessionId: string,
    itemId: string,
  ): string {
    return `${sessionId}:${itemId}`
  }

  private enqueueConversationPatch(
    sessionId: string,
    itemId: string,
    patch: Partial<ConversationItem>,
  ): void {
    const key = this.pendingConversationPatchKey(sessionId, itemId)
    const existing = this.pendingConversationPatches.get(key)
    this.pendingConversationPatches.set(key, {
      sessionId,
      itemId,
      patch: existing
        ? this.mergeConversationPatch(existing.patch, patch)
        : patch,
    })

    if (this.pendingConversationPatchTimers.has(key)) return

    const timer = setTimeout(() => {
      this.pendingConversationPatchTimers.delete(key)
      try {
        this.flushPendingConversationPatches([key], 'timer')
      } catch (error) {
        // Nobody is on this stack to catch it: a timer's throw is an uncaught
        // main-process exception. A lost recording is already announced
        // inside the flush; anything else is logged here (MAR-3023 B).
        console.error(
          `[session] Deferred conversation patch flush failed for ${sessionId}`,
          error,
        )
      }
    }, CONVERSATION_PATCH_FLUSH_MS)
    if (typeof timer.unref === 'function') {
      timer.unref()
    }
    this.pendingConversationPatchTimers.set(key, timer)
  }

  private mergeConversationPatch(
    current: Partial<ConversationItem>,
    next: Partial<ConversationItem>,
  ): Partial<ConversationItem> {
    return {
      ...current,
      ...next,
      providerMeta:
        current.providerMeta || next.providerMeta
          ? {
              ...current.providerMeta,
              ...next.providerMeta,
            }
          : undefined,
    } as Partial<ConversationItem>
  }

  private takePendingConversationPatch(
    sessionId: string,
    itemId: string,
  ): PendingConversationPatch | null {
    const key = this.pendingConversationPatchKey(sessionId, itemId)
    const pending = this.pendingConversationPatches.get(key) ?? null
    if (!pending) return null

    this.pendingConversationPatches.delete(key)
    const timer = this.pendingConversationPatchTimers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.pendingConversationPatchTimers.delete(key)
    }
    return pending
  }

  /**
   * Writes every coalesced conversation patch that is still waiting.
   * Returns how many were dropped because the database handle was already
   * closed — teardown aggregates two passes before announcing once
   * (MAR-3274 R3 / Item A).
   */
  private flushAllPendingConversationPatches(): number {
    return this.flushPendingConversationPatches(
      Array.from(this.pendingConversationPatches.keys()),
      'teardown',
    )
  }

  /**
   * The only door that may flush pending conversation patches. Closed-database
   * drops are announced here for every site except teardown, which returns the
   * count so `disposeAll` can say it once across both passes (MAR-3274 Item A).
   * The boolean from the inner write never leaves this method.
   */
  private flushPendingConversationPatches(
    keys: readonly string[],
    where: 'teardown' | 'timer' | 'session flush',
  ): number {
    let dropped = 0
    for (const key of keys) {
      if (this.writePendingConversationPatchByKey(key)) dropped += 1
    }
    if (dropped > 0 && where !== 'teardown') {
      console.error(
        `[session] ${dropped} conversation patch(es) dropped: the database was already closed (${where})`,
      )
    }
    return dropped
  }

  /**
   * Writes one pending conversation patch.
   * @returns `true` when the patch was dropped because `this.db` was closed.
   * Only `flushPendingConversationPatches` may call this — callers must not
   * discard that outcome (MAR-3274 Item A).
   */
  private writePendingConversationPatchByKey(key: string): boolean {
    const pending = this.pendingConversationPatches.get(key)
    if (!pending) return false

    this.pendingConversationPatches.delete(key)
    const timer = this.pendingConversationPatchTimers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.pendingConversationPatchTimers.delete(key)
    }

    // Closed handle only: write nothing, throw nothing, count the drop.
    // Every other error keeps today's handling (MAR-3274 R3).
    if (!this.db.open) return true

    let item: ConversationItem | null
    try {
      item = this.patchConversationItem(
        pending.sessionId,
        pending.itemId,
        pending.patch,
      )
    } catch (error) {
      // A deferred flush runs from a timer, or inside a settle, for a turn the
      // provider is streaming: a refused write is that turn's lost recording,
      // announced here — thrown from a timer it would be an uncaught
      // main-process exception, and thrown from a settle it would stop the
      // status from landing (MAR-3023 B).
      if (!(error instanceof RecordingError)) throw error
      error.announce()
      return false
    }
    if (!item) return false
    this.notifyConversationPatch({
      sessionId: pending.sessionId,
      op: 'patch',
      item,
    })
    return false
  }

  private flushPendingConversationPatchesForSession(sessionId: string): void {
    const keys = Array.from(this.pendingConversationPatches.entries())
      .filter(([, pending]) => pending.sessionId === sessionId)
      .map(([key]) => key)
    this.flushPendingConversationPatches(keys, 'session flush')
  }

  private clearPendingConversationPatchesForSession(sessionId: string): void {
    for (const [key, pending] of Array.from(
      this.pendingConversationPatches.entries(),
    )) {
      if (pending.sessionId !== sessionId) continue
      this.pendingConversationPatches.delete(key)
      const timer = this.pendingConversationPatchTimers.get(key)
      if (timer) {
        clearTimeout(timer)
        this.pendingConversationPatchTimers.delete(key)
      }
    }
  }

  private addConversationItem(
    sessionId: string,
    itemDraft: ConversationItemDraft,
    providerAccountId?: string | null,
  ): ConversationItem | null {
    const row = this.getRowById(sessionId)
    if (!row) return null

    // Resumed remote streams can replay events that were already applied
    // before a restart; item ids are globally unique, so an existing id
    // means this add was persisted previously.
    const existing = this.db
      .prepare('SELECT 1 FROM session_conversation_items WHERE id = ?')
      .get(itemDraft.id)
    if (existing) return null

    const latest = this.db
      .prepare(
        `SELECT turn_id
         FROM session_conversation_items
         WHERE session_id = ?
         ORDER BY sequence DESC
         LIMIT 1`,
      )
      .get(sessionId) as { turn_id: string | null } | undefined

    const nextSequence = (row.last_sequence ?? 0) + 1
    const isUserMessage =
      itemDraft.kind === 'message' &&
      (itemDraft as { actor?: unknown }).actor === 'user'
    // Minted in memory BEFORE the row is written (MAR-3023 F): if the write
    // is refused, the turn still exists at the provider, and every later item
    // of it must carry its id — not the previous turn's, read back from the
    // last row that did land.
    const turnId = isUserMessage
      ? randomUUID()
      : (this.unrecordedTurnIds.get(sessionId) ?? latest?.turn_id ?? null)
    if (isUserMessage) {
      this.unrecordedTurnIds.set(sessionId, turnId!)
      // A new turn begins: the settled turn's tail ends here (C).
      this.lastSettledTurn.delete(sessionId)
      // An unrecorded turn is still the active turn (MAR-3023 lap 3, J): set
      // before the write, so harness evidence for its reply is attributed to
      // it and not to the previous turn. Turn capture itself is still skipped
      // when the write is refused -- `startTurn` below runs only after the
      // row landed, and ending a turn with no row updates nothing.
      if (this.turnCapture) this.activeTurnIds.set(sessionId, turnId!)
    }

    let item = {
      ...itemDraft,
      sessionId,
      sequence: nextSequence,
      turnId,
    } as ConversationItem

    const insertRow = conversationItemToInsertRow(item)

    this.tagAcceptedRecording(sessionId, 'the conversation item', () =>
      this.db
        .prepare(
          `INSERT INTO session_conversation_items (
             id,
             session_id,
             sequence,
             turn_id,
             agent_run_id,
             task_id,
             kind,
             state,
             payload_json,
             provider_item_id,
             provider_event_type,
             created_at,
             updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          insertRow.id,
          insertRow.sessionId,
          insertRow.sequence,
          insertRow.turnId,
          insertRow.agentRunId,
          insertRow.taskId,
          insertRow.kind,
          insertRow.state,
          insertRow.payloadJson,
          insertRow.providerItemId,
          insertRow.providerEventType,
          insertRow.createdAt,
          insertRow.updatedAt,
        ),
    )

    this.tagAcceptedRecording(sessionId, 'the conversation item', () =>
      this.db
        .prepare(
          'UPDATE sessions SET last_sequence = ?, conversation_version = 2, updated_at = ? WHERE id = ?',
        )
        .run(nextSequence, item.updatedAt, sessionId),
    )

    if (isUserMessage) this.unrecordedTurnIds.delete(sessionId)

    if (isUserMessage && this.turnCapture && turnId) {
      void this.turnCapture.startTurn({
        sessionId,
        turnId,
        workingDirectory: row.working_directory,
        // The adapter reports the account bound to the process/connection.
        // Unknown remote provenance must never borrow a local selection.
        providerAccountId: providerAccountId ?? null,
        // Read straight off the row rather than from a pending slot (MAR-2551,
        // deliberately not a fourth instance of MAR-2539). The account is a
        // per-turn fact carried by the adapter's user-message event; the
        // model is standing session state, and it cannot move between dispatch
        // and this stamp because `describeModelSelectionRefusal` refuses every
        // write while a handle is attached or a send is in flight — the two
        // together cover the whole of the send path, from its first statement
        // to the handle it registers.
        model: row.model,
        effort: row.effort,
      })
    }

    if (item.agentRunId) {
      const run = this.db
        .prepare(
          'SELECT description, agent_type AS agentType FROM session_agent_runs WHERE session_id = ? AND id = ?',
        )
        .get(sessionId, item.agentRunId) as
        | { description: string | null; agentType: string | null }
        | undefined
      item = {
        ...item,
        agentAttribution: {
          description: run?.description ?? null,
          agentType: run?.agentType ?? null,
        },
      }
    }
    return item
  }

  private patchConversationItem(
    sessionId: string,
    itemId: string,
    patch: Partial<ConversationItem>,
  ): ConversationItem | null {
    const existing = this.db
      .prepare(
        `SELECT items.*, sessions.provider_id, agents.description AS agent_description, agents.agent_type
         FROM session_conversation_items items
         INNER JOIN sessions ON sessions.id = items.session_id
         LEFT JOIN session_agent_runs agents ON agents.session_id=items.session_id AND agents.id=items.agent_run_id
         WHERE items.session_id = ? AND items.id = ?`,
      )
      .get(sessionId, itemId) as ConversationItemRow | undefined

    if (!existing) return null

    const current = conversationItemFromRow(existing)
    const merged = {
      ...current,
      ...patch,
      providerMeta: {
        ...current.providerMeta,
        ...(patch.providerMeta ?? {}),
      },
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    } as ConversationItem
    const row = conversationItemToInsertRow(merged)

    this.tagAcceptedRecording(sessionId, 'the conversation item patch', () =>
      this.db
        .prepare(
          `UPDATE session_conversation_items
           SET turn_id = ?,
               agent_run_id = ?,
               task_id = ?,
               kind = ?,
               state = ?,
               payload_json = ?,
               provider_item_id = ?,
               provider_event_type = ?,
               updated_at = ?
           WHERE session_id = ? AND id = ?`,
        )
        .run(
          row.turnId,
          row.agentRunId,
          row.taskId,
          row.kind,
          row.state,
          row.payloadJson,
          row.providerItemId,
          row.providerEventType,
          row.updatedAt,
          sessionId,
          itemId,
        ),
    )

    this.tagAcceptedRecording(sessionId, 'the conversation item patch', () =>
      this.db
        .prepare('UPDATE sessions SET updated_at = ? WHERE id = ?')
        .run(merged.updatedAt, sessionId),
    )

    return merged
  }

  /**
   * Writes one session patch, and -- when the patch came from an execution
   * host event -- the stream cursor and the settle marker with it (MAR-2582).
   *
   * The host-liveness stamp written here is this app's receipt time, not the
   * daemon's event time: a reconnect replay that walks the cursor through old
   * envelopes stamps each of them "now". So the label it feeds means "the host
   * last reached me", which is the question a card asks (MAR-3054).
   *
   * All three in one statement on purpose. The cursor used to be persisted by
   * a second write that ran after this one returned, so an interruption in the
   * gap left a session recorded as settled with a cursor still pointing at the
   * event before the settle -- and the next attach resumed from there and was
   * handed the terminal event again. `MAX` keeps both columns monotonic, so
   * the trailing `recordRemoteEventSeq` for the same event is now a no-op
   * rather than a second source of truth.
   *
   * Closing that window stops new rows entering it and heals none of the rows
   * already in it, which is why this is not what makes a replayed settle
   * harmless: `handleLifecycle` is (MAR-2582).
   */
  private applySessionPatch(
    sessionId: string,
    patch: Extract<SessionDelta, { kind: 'session.patch' }>['patch'],
    executionHostSeq?: number,
  ): void {
    const row = this.getRowById(sessionId)
    if (!row) return

    const prevAttention = row.attention as AttentionState
    const prevStatus = row.status as SessionStatus
    const nextStatus = patch.status ?? prevStatus
    if (
      nextStatus === 'running' &&
      (patch.turnOpenedBy === 'user' ||
        (prevStatus !== 'running' && prevStatus !== 'answered'))
    ) {
      // Tagged at the STATEMENT, not the method: the attention observer runs
      // between this method's writes (MAR-2541) and its bugs must propagate
      // raw — only the persistence itself is the boundary's to own (MAR-3023).
      this.tagAcceptedRecording(sessionId, 'session patch', () =>
        this.db
          .prepare(
            'UPDATE sessions SET answer_window_start_sequence=last_sequence+1 WHERE id=?',
          )
          .run(sessionId),
      )
    }
    const nextAttention = patch.attention ?? prevAttention
    const nextActivity =
      patch.activity !== undefined
        ? patch.activity
        : nextStatus !== 'running'
          ? null
          : ((row.activity as ActivitySignal) ?? null)
    const nextArchivedAt =
      row.archived_at &&
      (nextAttention === 'needs-approval' || nextAttention === 'needs-input')
        ? null
        : row.archived_at
    const updatedAt = patch.updatedAt ?? new Date().toISOString()
    const isSettling =
      nextStatus !== prevStatus && isTerminalSessionStatus(nextStatus)
    // The quiet request is honoured and cleared by the same statement that
    // commits the status (F10). Two writes would leave a window -- an
    // attention observer runs between them, uncaught -- in which a session is
    // on disk as settled while still marked quiet, and after a restart that
    // stale marker would silence the next ordinary run.
    const relaysMuted = row.relays_muted === 1
    const hostSeq = row.execution_host === 'local' ? 0 : (executionHostSeq ?? 0)
    // Read from the patch, not from the resulting status: the marker means
    // "this event settled the session", and a patch that carries no status at
    // all -- a continuation token arriving after the settle -- did not.
    const settledSeq =
      patch.status && isTerminalSessionStatus(patch.status) ? hostSeq : 0

    // Tagged at the STATEMENT, same reason as the answer-window write above.
    this.tagAcceptedRecording(sessionId, 'session patch', () =>
      this.db
        .prepare(
          `UPDATE sessions
           SET status = ?,
               attention = ?,
               activity = ?,
               context_window = ?,
               continuation_token = ?,
               relays_muted = ?,
               archived_at = ?,
               execution_host_last_event_at = CASE WHEN ? > execution_host_last_seq THEN ? ELSE execution_host_last_event_at END,
               execution_host_last_seq = MAX(execution_host_last_seq, ?),
               execution_host_settled_seq = MAX(execution_host_settled_seq, ?),
               updated_at = ?
         WHERE id = ?`,
        )
        .run(
          nextStatus,
          nextAttention ?? row.attention,
          nextActivity,
          patch.contextWindow !== undefined
            ? patch.contextWindow
              ? JSON.stringify(patch.contextWindow)
              : null
            : row.context_window,
          patch.continuationToken !== undefined
            ? patch.continuationToken?.trim()
              ? patch.continuationToken
              : row.continuation_token
            : row.continuation_token,
          isSettling ? 0 : row.relays_muted,
          nextArchivedAt,
          hostSeq,
          new Date().toISOString(),
          hostSeq,
          settledSeq,
          updatedAt,
          sessionId,
        ),
    )

    if (nextAttention !== prevAttention) {
      this.notifyAttention(sessionId, prevAttention, nextAttention)
    }

    if (isSettling) {
      this.queueSettleEvent({
        sessionId,
        status: nextStatus,
        ...(row.provider_id === 'claude-code'
          ? { answerWindow: this.readAnswerWindow(sessionId) }
          : {}),
        settledAt: updatedAt,
        relaysMuted,
        // Drained here, in the same beat that commits the terminal status, so
        // the receipt and the settle can never disagree about which turn
        // consumed which input (MAR-2759).
        dispatchIds: this.takeTurnDispatchIds(sessionId),
      })
      this.retryUnmarkedSentInputs(sessionId)
    }
  }

  /**
   * Records that a human asked for quiet on this session (F10, MAR-2537).
   *
   * A fact about the SETTLE, not about a turn: `sessions.relays_muted` means
   * "someone asked for quiet since this session last came to rest". Set here,
   * cleared by the settle that honours it, and if any message contributing to
   * the finished work asked, the settle is quiet.
   *
   * Deliberately not a per-turn slot. Two dispatches can be in flight at once
   * -- a session does not report itself `running` until awaits inside the
   * provider adapter have finished, the window run 20 closed for the opener
   * alone -- so a slot filled at dispatch and consumed when the user message
   * arrives can be overwritten before either lands. Deliberately not a queue
   * either: a dispatch that never produces a user-message item would
   * desynchronize it, and every mute after that would land on the wrong turn,
   * silently, forever.
   *
   * Only ever sets. An ordinary message sent while a quiet one is still in
   * flight must not cancel it -- mute wins ties on purpose, because erring
   * quiet costs one manual hail while erring loud spends provider quota and
   * wakes another agent mid-work.
   *
   * In the database rather than in memory: remote runs outlive the app process
   * and are reattached by `resumeRunningRemoteSessions`, so their settles
   * arrive after a restart as ordinary settles, with nothing in memory behind
   * them. `updated_at` is left alone -- a request is not a change to the
   * session anyone is looking at, and bumping it would reshuffle every list
   * ordered by recency.
   */
  private requestRelayMute(sessionId: string, muteRelays?: boolean): void {
    if (muteRelays !== true) return
    this.db
      .prepare('UPDATE sessions SET relays_muted = 1 WHERE id = ?')
      .run(sessionId)
  }

  /**
   * Settle events are detected here, in the one statement that writes
   * `sessions.status`, so no settle path can bypass them -- the provider
   * lifecycle, the stale-run failure writer and the shell exit path all funnel
   * through this method.
   *
   * They are delivered on the next microtask rather than inline, because the
   * caller is mid-lifecycle: the handle has not been released and the turn has
   * not been closed yet. A relay is allowed to point a session back at itself
   * (A -> B -> A is our own review loop), so a subscriber that acted inline
   * would queue work into a handle about to be disposed.
   */
  private queueSettleEvent(event: SessionSettledEvent): void {
    if (this.recoveringStaleSessions) return

    this.pendingSettleEvents.push(event)
    if (this.settleFlushScheduled) return

    this.settleFlushScheduled = true
    queueMicrotask(() => {
      this.flushSettleEvents()
    })
  }

  private flushSettleEvents(): void {
    this.settleFlushScheduled = false
    const events = this.pendingSettleEvents
    this.pendingSettleEvents = []

    for (const event of events) {
      for (const listener of [...this.sessionSettledListeners]) {
        try {
          listener(event)
        } catch (error) {
          // A misbehaving subscriber must never take the session pipeline down
          // with it; the session has already settled correctly in the database.
          console.error(
            `[session] settle listener failed for ${event.sessionId}`,
            error,
          )
        }
      }
    }
  }

  private updateField(id: string, field: string, value: string | null): void {
    this.db
      .prepare(
        `UPDATE sessions SET ${field} = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(value, id)

    this.notifySessionChange(id)
  }

  private updateArchiveState(id: string, archivedAt: string | null): void {
    this.sessionRepository.setArchivedAt(id, archivedAt)
    this.notifySessionChange(id)
  }

  private notifyAttention(
    id: string,
    prev: AttentionState,
    next: AttentionState,
  ): void {
    if (!this.attentionObserver) return
    const session = this.getById(id)
    if (!session) return
    this.attentionObserver.onAttentionTransition(prev, next, session)
  }

  private notifySummaryUpdated(id: string): void {
    if (!this.onSummaryUpdate) return
    const summary = this.getSummaryById(id)
    if (summary) {
      this.onSummaryUpdate(summary)
    }
  }

  private notifySessionChange(
    id: string,
    conversationPatch?: ConversationPatchEvent,
  ): void {
    this.notifySummaryUpdated(id)
    if (conversationPatch && this.onConversationPatch) {
      this.onConversationPatch(conversationPatch)
    }
  }

  private notifyConversationPatch(event: ConversationPatchEvent): void {
    this.onConversationPatch?.(event)
  }

  private getRowById(id: string): SessionRow | undefined {
    return this.sessionRepository.findById(id)
  }

  private getContinuationToken(id: string): string | null {
    return this.getRowById(id)?.continuation_token ?? null
  }

  /**
   * Starts a provider run behind the synchronous host/account preconditions.
   * Providers with an initial-dispatch receipt hold publication until accepted;
   * their archive/context writes happen after that receipt and before its
   * buffered deltas are published. Legacy synchronous starts retain their order.
   */
  private startHandle(
    session: Session,
    initialMessage: string,
    continuationToken: string | null,
    initialAttachments?: Attachment[],
    initialSkillSelections?: SkillSelection[],
    providerAccountId?: string | null,
    /**
     * What this turn is, rather than how the handle should be built: what the
     * human asked for (`muteRelays`), and -- for the door that opens a session
     * -- the project context this start is to be given. An object so each one
     * names itself at the call site: bare positionals here would be unreadable
     * at all three of them.
     *
     * `bootContext` present means "augment `initialMessage` with the session's
     * project context and record the note for it". Absent means the caller has
     * already prepared its text, which is true of both resuming callers.
     */
    turn?: {
      queuedInputId?: string
      muteRelays?: boolean
      bootContext?: { contextItemIds?: string[] }
    },
  ): Promise<InitialDispatchReceipt> | undefined {
    if (this.isAccountHandoff(session, providerAccountId)) {
      this.assertAccountHandoffEligible(session, {
        ownDispatch: true,
        queuedInputId: turn?.queuedInputId,
      })
    }
    // Accounts are host-scoped (ADR 0007, PA10). Refuse before anything is
    // spawned or recorded: a remote host runs on its own credential whatever is
    // selected here, and starting anyway would file the local account id
    // against a turn it never served.
    assertLocalAccountSelection({
      executionHost: session.executionHost,
      accountId: providerAccountId,
    })

    // The barrier. Refuse before anything is spawned or recorded, and refuse in
    // the host's words (MAR-2682).
    this.assertTurnProviderRunnable(session)

    const execution = this.resolveExecution(session)
    const place = isRemoteExecutionHost(session.executionHost)
      ? this.requireRemoteWorkPlace(session)
      : null

    const boot = turn?.bootContext
      ? this.computeBootContext(
          session,
          initialMessage,
          turn.bootContext.contextItemIds,
          this.isAccountHandoff(session, providerAccountId),
        )
      : { augmentedText: initialMessage, noteDraft: null }

    const handle = execution.host.start(execution.providerId, {
      sessionId: session.id,
      readTaskStatus: (taskId) =>
        (
          this.db
            .prepare(
              'SELECT status FROM session_tasks WHERE session_id=? AND task_id=?',
            )
            .get(session.id, taskId) as { status: string } | undefined
        )?.status,
      readParallelWorkCounts: () => {
        const counts = this.evidenceCounts
          .countParallelWork([session.id])
          .get(session.id)!
        // The witness and its status broadcast must describe the same record.
        this.parallelWorkCounts.set(session.id, counts)
        return counts
      },
      // A Project-mode remote start names a directory on the *daemon's*
      // machine; every other start names this one. The wire mapping drops
      // whichever of the pair the other mode makes meaningless.
      workingDirectory: place?.workingDirectory ?? session.workingDirectory,
      initialMessage: boot.augmentedText,
      initialSkillSelections,
      ...this.readStartConversationFacts(session.id),
      model: session.model,
      effort: session.effort,
      serviceTier: session.serviceTier ?? null,
      continuationToken,
      permissionConfig: session.permissionConfig,
      providerAccountId: providerAccountId ?? null,
      previousProviderAccountId: this.getLastTurnProviderAccountId(session.id),
      initialAttachments,
      ...(place?.workspace ? { workspace: place.workspace } : {}),
    })

    const previousMute = this.getRowById(session.id)?.relays_muted
    this.requestRelayMute(session.id, turn?.muteRelays)
    this.activeHandles.set(session.id, handle)
    this.agentMeterListener?.(session.id, handle)
    this.notifySummaryUpdated(session.id)
    handle.onDelta((delta: SessionDelta) => {
      this.applyDelta(session.id, delta, handle)
    })
    handle.onActivityHeartbeat?.(() => {
      this.liveness.bump(session.id)
    })

    const recordAcceptedStart = () => {
      const failedRecords: string[] = []
      const save = (label: string, write: () => void) => {
        try {
          write()
        } catch (error) {
          // Acceptance is irreversible. Metadata failures cannot turn it into
          // an unsent draft or prevent the provider's buffered turn publishing.
          failedRecords.push(label)
          console.error(
            `[session] Accepted turn could not save ${label}`,
            error,
          )
        }
      }
      save('project context selection', () => boot.commit?.())
      if (session.archivedAt)
        save('archive state', () => this.updateArchiveState(session.id, null))
      if (boot.noteDraft) {
        const note = boot.noteDraft
        save('context note', () => this.recordBootContextNote(session.id, note))
      }
      if (failedRecords.length > 0) {
        const timestamp = new Date().toISOString()
        save('persistence warning', () =>
          this.recordBootContextNote(session.id, {
            id: randomUUID(),
            kind: 'note',
            state: 'complete',
            level: 'warning',
            turnId: null,
            text: `This turn was accepted, but its ${failedRecords.join(' and ')} could not be saved. The message was sent; do not resend it because of this warning.`,
            createdAt: timestamp,
            updatedAt: timestamp,
            providerMeta: {
              providerId: 'convergence',
              providerItemId: null,
              providerEventType: 'session.start.persistence-failed',
            },
          }),
        )
      }
    }
    if (!handle.initialDispatch) {
      recordAcceptedStart()
      return
    }
    return handle.initialDispatch
      .then((receipt) => {
        recordAcceptedStart()
        return receipt
      })
      .catch(async (error) => {
        this.restoreRelayMute(session.id, previousMute)
        if (this.activeHandles.get(session.id) === handle)
          await this.releaseHandle(session.id)
        throw error
      })
  }

  /**
   * What a starting handle reads off the transcript, from ONE read of it.
   *
   * Both facts are answers only the ledger has, and both are needed by every
   * start, so they are taken together rather than by two independent scans of
   * the same conversation.
   */
  private readStartConversationFacts(sessionId: string): {
    previousAssistantTexts: string[]
    noTurnSinceBoundary: boolean
  } {
    const conversation = this.getConversation(sessionId)
    return {
      previousAssistantTexts: previousAssistantMessageTexts(conversation),
      noTurnSinceBoundary: hasNoTurnSinceLastBoundary(conversation),
    }
  }

  /**
   * A handle takes ownership of the run it joined the moment that run reports
   * itself moving again (MAR-2582).
   *
   * The session leaving a terminal status is the daemon saying the next turn
   * has begun, and the handle that heard it is the one carrying that turn.
   */
  private noteRunOwnership(
    source: SessionHandle,
    status: SessionStatus | undefined,
  ): void {
    if (status && !isTerminalSessionStatus(status)) {
      this.handlesAwaitingTheirRun.delete(source)
    }
  }

  /**
   * Ends the run a terminal event came from -- and only that run.
   *
   * `source` is the handle that emitted the event and `executionHostSeq` says
   * where the event came from. A handle that attached to a session the record
   * already showed at rest joined a finished run: the events the daemon
   * replays from the stream cursor are that run's tail, and the settle among
   * them belongs to the handle that is already gone (MAR-2582).
   *
   * Origin is what decides, not whether the handle has begun its run. Those
   * two questions look alike and come apart at a failed attach:
   *
   * - a terminal event carrying a wire sequence is the daemon speaking. On a
   *   handle whose run has not yet reported itself moving, it is the previous
   *   run's tail -- suppress it.
   * - a terminal event with no sequence was raised by this handle itself. The
   *   adapter fails a session it cannot reach the daemon for
   *   (`remote-execution-host.ts`, `failSession`) and that failure never came
   *   off the wire, so it has no sequence and cannot be a replay. It ends the
   *   run whether or not the daemon ever reported `running` -- which is
   *   exactly an attach that died before it began. Suppressing it left the
   *   dead handle installed as the session's active one, and every later
   *   message went into it and disappeared.
   *
   * Without the first half a replayed settle ends the turn that follows it:
   * the message reaches the daemon, the answer never reaches the app, and the
   * session reports itself finished while the agent is still working. It
   * cannot be decided by sequence alone -- see `isReplayedHostSettle` for why
   * the marker cannot tell a replay from a duplicate encoding.
   *
   * The other half of the rule -- that a released handle says nothing about
   * this session at all -- is applied a level up, in `applyDelta`, because it
   * refuses the whole patch rather than only its lifecycle.
   *
   * What this costs: it reads the daemon reporting a non-terminal status as
   * the signal that the next turn has begun. A daemon that settled a turn
   * without ever announcing it started would leave such a handle attached and
   * its turn row open. The daemon announces both, and the alternative --
   * trusting a sequence -- is provably wrong rather than merely dependent.
   *
   * Two vocabularies, and only one of them arrives here (MAR-2971 lap 2).
   * `'stopped'` in `provider/claude-code/claude-code-provider.ts:575` is a
   * HARNESS TASK status on a `task.changed` fact, not a `SessionStatus`.
   * A receipt-bearing stopped fact can now witness an answered window
   * (MAR-2896); the provider then emits `completed`, which is the lifecycle
   * word this method handles. A stop we did not issue is not a witness.
   * Conversation Stop and the stale-run path also emit their own lifecycle
   * status rather than passing a task's vocabulary into the queue.
   */
  private handleLifecycle(
    sessionId: string,
    status: SessionStatus | undefined,
    source: SessionHandle,
    executionHostSeq: number | undefined,
  ): void {
    if (
      executionHostSeq !== undefined &&
      this.handlesAwaitingTheirRun.has(source)
    ) {
      // A replayed settle still ends the reset-in-flight memory: leaving the
      // flag would make the next plain failed turn drain the queue
      // (MAR-3298 lap 2 A). Cleared here, before the early return, because
      // every turn-ending lifecycle of this session clears it — guard or not.
      if (status === 'failed' || status === 'completed') {
        this.resetsInFlight.delete(sessionId)
      }
      return
    }
    if (status === 'failed') {
      const wasReset = this.resetsInFlight.delete(sessionId)
      this.releaseHandle(sessionId)
      this.closeActiveTurn(sessionId, 'errored')
      // A failed turn drains nothing, and the rows behind it would wait for
      // a `completed` that is not coming (MAR-2759, design P).
      this.terminateQueuedInputs(
        sessionId,
        'The turn this input was waiting behind failed.',
      )
      // A failed RESET is the one failed that still owes the brief behind
      // the opener: the note promised "your next message will resume it",
      // and the payload IS that next message (MAR-3298 R2). MAR-2971 stands
      // — terminateQueuedInputs still only fails ATTEMPTED rows; the drain
      // below only sends what is still `queued`.
      // Failed-reset recovery is deliberately outside the automatic drill guard.
      if (
        wasReset &&
        !source.retainQueuedInputsOnCompletion &&
        !this.retainingStoppedInputs.has(sessionId)
      ) {
        void this.dispatchNextQueuedInput(sessionId).catch((error) => {
          console.error('[session] Could not dispatch queued input', error)
        })
      }
    } else if (status === 'completed') {
      this.resetsInFlight.delete(sessionId)
      // `answered` keeps the window and queue open; only a witness drains it.
      const summary = this.getSummaryById(sessionId)
      if (
        !source.resident &&
        summary &&
        (!this.continuationSupportedFor(summary) || summary.continuationToken)
      ) {
        this.releaseHandle(sessionId)
      }
      this.liveness.clear(sessionId)
      this.closeActiveTurn(sessionId, 'completed')
      if (
        !source.retainQueuedInputsOnCompletion &&
        !this.retainingStoppedInputs.has(sessionId) &&
        ![...this.beforeQueueDrainGuards].some((guard) => guard(sessionId))
      )
        void this.dispatchNextQueuedInput(sessionId).catch((error) => {
          console.error('[session] Could not dispatch queued input', error)
        })
    }
  }

  private releaseHandle(
    sessionId: string,
    reason: 'quit' | 'stop' = 'stop',
  ): Promise<void> {
    const handle = this.activeHandles.get(sessionId)
    if (!handle) return Promise.resolve()

    this.activeHandles.delete(sessionId)
    this.agentMeterListener?.(sessionId)
    this.notifySummaryUpdated(sessionId)
    let disposal: void | Promise<void> = undefined
    try {
      disposal = handle.dispose?.(reason)
    } catch (error) {
      // Resource cleanup is best-effort; the handle is no longer addressable.
      // Said, not swallowed (MAR-3023 lap 5, A).
      console.error(
        `[session] Disposing the provider handle of ${sessionId} failed`,
        error,
      )
    }
    this.liveness.clear(sessionId)
    this.onSessionTerminated?.(sessionId)
    const pending = Promise.resolve(disposal).catch(() => {})
    this.pendingHandleDisposals.add(pending)
    void pending.finally(() => this.pendingHandleDisposals.delete(pending))
    return pending
  }

  private async dispatchNextQueuedInput(sessionId: string): Promise<void> {
    if (this.quitting) return
    // The door, not each caller (MAR-3253). Since MAR-3020 a horse's return
    // WAITS in the queue while the conversation compacts, so any drain fired
    // in that minute -- "Deliver now" on a failed row, a turn's completion --
    // would send it into a context being rewritten underneath it. This path
    // never asked: it met `assertNotCompacting` only through
    // `assertAccountHandoffEligible`, i.e. only when the row's account
    // differed from the last turn's.
    //
    // Before `nextQueued` and before any patch: the refusal must take
    // nothing and change nothing. A row moved to `dispatching` and put back
    // would still be a state the queue has to unwind, and the row is not
    // failing -- it is waiting, and the drain in `compactContext`'s `finally`
    // (which runs AFTER the compacting mark is deleted) delivers it.
    //
    // A held queue is the second reason, and it reaches this door the same
    // way (MAR-3255 R2): a routine is mid-drill, and every row that arrived
    // while it runs is waiting for `releaseQueue` to send it -- which is the
    // drain that does deliver them.
    if (
      this.compactingSessions.has(sessionId) ||
      this.heldSessions.has(sessionId)
    )
      return
    const item = this.queuedInputs.nextQueued(sessionId)
    if (!item) return

    this.queuedInputs.patch(item.id, 'dispatching')
    await this.sendQueuedRow(sessionId, item, {
      onFailure: (err) => {
        // "Not yet" is not "broken" (MAR-2888). The row was attempted, but
        // the answer is about timing: it goes back in line and the next turn
        // boundary tries it again -- the shape this function already uses
        // for a provider that answers `queue-follow-up`. Failing it here
        // would kill a baton one beat before it went out.
        //
        // The reachable trigger is `redeliverQueuedInput` -- Deliver now
        // while a turn is connecting -- and that turn's own completion
        // re-drains the row. NOT a completion itself, which is what an
        // earlier draft of this comment claimed: `setStatus` writes
        // `currentStatus` before it emits, the emitter is synchronous, and
        // `connecting` is nulled in a `finally` before `sendCodexTurn`, so
        // every Codex `completed` is processed with `connecting === null`
        // and no refusal to give.
        if (isProviderBusyError(err)) {
          this.queuedInputs.patch(item.id, 'queued')
          return
        }
        // The drain is itself a dispatch attempt, and it left the session
        // idle with this row and every row behind it waiting on nothing:
        // they end together, in one event (MAR-2759, design P).
        this.terminateQueuedInputs(
          sessionId,
          err instanceof Error ? err.message : String(err),
        )
      },
    })
  }

  /**
   * The drain's door (MAR-3307): sends ONE row the caller has already moved
   * to `dispatching`, and says what became of it. `'deferred'` is the
   * provider answering `queue-follow-up` -- the row is back in line, nothing
   * went out. `'failed'` is a refusal or an error, and what to do with the
   * row is the caller's `onFailure`: the drain puts a busy row back and ends
   * the rest; `sendMessageWithOpener`'s idle opener falls back to waiting,
   * or fails loudly to its own caller.
   *
   * `onFailure` runs INSIDE this catch, not in the caller's after an
   * `await`: a provider that refuses synchronously is answered in the same
   * tick as the settle that drained it -- the drain is synchronous end to
   * end, which `withDispatchInFlight`'s MAR-2971 pin relies on -- and a
   * policy applied one microtask later leaves the row `dispatching` for a
   * reader in between.
   *
   * One door for every row that leaves the queue, so every fact a row's
   * departure writes is written here once -- the `sent` mark, the turn's
   * receipt, and whether the turn now under way is a conversation reset
   * (`markResetInFlight`). Before this door the reset fact was written only
   * by the direct send path, so a `/clear` drained from the queue failed
   * without draining the brief behind it.
   *
   * `ownDispatch`: the caller holds the MAR-2550 in-flight marker for this
   * very send (the idle opener does, as the direct path always did), so the
   * account-handoff check must not read that marker as somebody else's send.
   */
  private async sendQueuedRow(
    sessionId: string,
    item: SessionQueuedInput,
    policy: { ownDispatch?: boolean; onFailure: (error: unknown) => void },
  ): Promise<'sent' | 'deferred' | 'failed'> {
    let handoffGuard = false
    let markedReset = false

    try {
      const session = this.getById(sessionId)
      if (!session) throw new Error(`Session not found: ${sessionId}`)
      if (this.isAccountHandoff(session, item.providerAccountId)) {
        this.assertNoPendingAccountHandoff(sessionId)
        this.assertAccountHandoffEligible(session, {
          ownDispatch: policy.ownDispatch,
          queuedInputId: item.id,
        })
        this.pendingAccountHandoffs.add(sessionId)
        handoffGuard = true
      }
      assertLocalAccountSelection({
        executionHost: session.executionHost,
        accountId: item.providerAccountId,
      })
      const attachments = this.resolveAttachments(item.attachmentIds)
      const handle = this.activeHandles.get(sessionId)

      const augmentedText = this.prepareUserTurnText(
        session,
        item.text,
        item.skipContextInjection,
      )
      // Before the send, as the direct path does: a reset's `failed` may
      // arrive before the send below returns.
      markedReset = this.markResetInFlight(sessionId, item.text)

      if (handle) {
        let accepted = false
        const acceptTurn = () => {
          if (accepted) return
          accepted = true
          this.attachDispatchToTurn(sessionId, item.dispatchId)
          this.markQueuedInputSent(sessionId, item.dispatchId, item.id)
        }
        // The mute the user chose when they wrote this, not the composer's
        // state now -- the toggle reset the moment they pressed send.
        const previousMute = item.relaysMuted
          ? this.getRowById(sessionId)?.relays_muted
          : undefined
        this.requestRelayMute(sessionId, item.relaysMuted)
        let disposition: SendMessageDisposition
        try {
          const delivery = handle.sendMessage(
            augmentedText,
            attachments,
            item.skillSelections,
            {
              deliveryMode: 'normal',
              onTurnAccepted: acceptTurn,
              queuedInputId: item.id,
              providerAccountId: item.providerAccountId,
            },
          )
          disposition = delivery instanceof Promise ? await delivery : delivery
          if (
            disposition &&
            disposition !== 'queue-follow-up' &&
            disposition.kind === 'refused'
          ) {
            throw new Error(disposition.reason)
          }
        } catch (error) {
          // Same rule on the drain's own send: a mute borrowed for a delivery
          // that was refused goes back, so the turn already under way is not
          // silenced by a beat that never happened (MAR-2888 lap 4).
          this.restoreRelayMute(sessionId, previousMute)
          throw error
        }
        if (disposition === 'queue-follow-up') {
          // The send did not land, so the mute it borrowed goes back -- the
          // fourth site of this rule, and the twin of the direct path's
          // (MAR-2888 lap 5). A deferral is not a refusal, but it is equally
          // a beat that did not happen: leave the mute standing and the next
          // turn this session takes settles quiet on the opener's behalf.
          this.restoreRelayMute(sessionId, previousMute)
          // Keep its original row and ordering; the next completion retries it.
          this.queuedInputs.patch(item.id, 'queued')
          if (markedReset) this.resetsInFlight.delete(sessionId)
          return 'deferred'
        }
        acceptTurn()
        return 'sent'
      }

      if (isRemoteExecutionHost(session.executionHost)) {
        this.sendRemoteTurn({
          session,
          text: augmentedText,
          attachments,
          attachmentIds: item.attachmentIds,
          skillSelections: item.skillSelections,
          providerAccountId: item.providerAccountId,
          muteRelays: item.relaysMuted,
          queuedInputId: item.id,
        })
        this.attachDispatchToTurn(sessionId, item.dispatchId)
        this.markQueuedInputSent(sessionId, item.dispatchId, item.id)
        return 'sent'
      }

      const continuationToken = this.getContinuationToken(sessionId)
      if (!this.continuationSupportedFor(session) || !continuationToken) {
        throw new Error('Session is no longer resumable')
      }

      const pending = this.startHandle(
        session,
        augmentedText,
        continuationToken,
        attachments,
        item.skillSelections,
        // The account chosen when this input was queued, not whatever the
        // composer shows now — it may have waited through a switch.
        item.providerAccountId,
        { muteRelays: item.relaysMuted, queuedInputId: item.id },
      )
      const receipt = pending ? await pending : undefined
      this.attachDispatchToTurn(sessionId, item.dispatchId)
      this.markQueuedInputSent(sessionId, item.dispatchId, item.id)
      if (handoffGuard) {
        this.pendingAccountHandoffs.delete(sessionId)
        handoffGuard = false
      }
      if (receipt)
        this.recordAcceptedTurn(
          sessionId,
          item.dispatchId,
          'the turn publication',
          () => receipt.publish(),
        )
      return 'sent'
    } catch (err) {
      // Nothing went out, so no lifecycle will clear the mark: the direct
      // path's catch does the same. Only a mark THIS call made.
      if (markedReset) this.resetsInFlight.delete(sessionId)
      policy.onFailure(err)
      return 'failed'
    } finally {
      if (handoffGuard) this.pendingAccountHandoffs.delete(sessionId)
    }
  }

  private recoverStaleRunningSessions(): void {
    for (const row of this.sessionRepository.listRunningNonShell()) {
      const session = sessionSummaryFromRow(row)
      // Remote runs outlive the app process; they are reattached once the
      // remote execution host is wired via setRemoteExecutionHost.
      if (isRemoteExecutionHost(session.executionHost)) continue
      if (session.status === 'answered') {
        this.completeOrphanAnswer(session)
        continue
      }
      this.markStaleRunningSessionFailed(
        session,
        'Session marked failed because Convergence restarted before the provider process finished.',
        false,
        { atBoot: true },
      )
    }
  }

  /**
   * Reattaches to remote sessions that were still running when the app shut
   * down. Their runs live on the daemon, so instead of failing them like
   * stale local sessions we resume the event stream after the last
   * persisted sequence; events emitted while the app was closed replay.
   */
  private resumeRunningRemoteSessions(): void {
    for (const row of this.sessionRepository.listRunningNonShell()) {
      const session = sessionSummaryFromRow(row)
      if (isLocalExecutionHost(session.executionHost)) continue
      if (this.activeHandles.has(session.id)) continue
      try {
        this.attachRemoteHandle(session)
      } catch (err) {
        this.markStaleRunningSessionFailed(
          session,
          `Could not reattach to the remote session after restart: ${
            err instanceof Error ? err.message : String(err)
          }`,
          false,
        )
      }
    }
  }

  /**
   * Attaches to the run a remote session already has on the daemon and makes
   * the resulting handle the session's active one.
   *
   * Resuming from `execution_host_last_seq` is what stops a reattach from
   * repeating itself: the adapter drops every envelope at or below that
   * sequence, so the events the daemon replays land once.
   *
   * A session the record already shows at rest hands back a handle that has no
   * run of its own yet: whatever the daemon replays above the cursor is the
   * tail of the run that already finished, and the settle in it must not end
   * the turn this handle was made to carry (MAR-2582).
   */
  private attachRemoteHandle(session: SessionSummary): SessionHandle {
    const execution = this.resolveExecution(session)
    if (!execution.host.attach) {
      throw new Error('Execution host does not support reattaching')
    }
    const handle = execution.host.attach(
      execution.providerId,
      {
        sessionId: session.id,
        workingDirectory: session.workingDirectory,
        initialMessage: '',
        model: session.model,
        effort: session.effort,
        serviceTier: session.serviceTier ?? null,
        continuationToken: session.continuationToken,
        permissionConfig: session.permissionConfig,
      },
      this.sessionRepository.getExecutionHostLastSeq(session.id),
    )
    this.activeHandles.set(session.id, handle)
    this.agentMeterListener?.(session.id, handle)
    this.notifySummaryUpdated(session.id)
    if (isTerminalSessionStatus(session.status)) {
      this.handlesAwaitingTheirRun.add(handle)
    }
    handle.onDelta((delta: SessionDelta) => {
      this.applyDelta(session.id, delta, handle)
    })
    handle.onActivityHeartbeat?.(() => {
      this.liveness.bump(session.id)
    })
    return handle
  }

  /**
   * Carries another turn on a remote session that has no live handle.
   *
   * A remote session takes exactly one start. The daemon answers a second one
   * for the same session id with 409 `Session already exists`
   * (`execution-session-manager.ts:436-438`), and Emergence — the working
   * client for this daemon — never sends one: it starts a session once and
   * every later turn is a `send-message` command on the session it already
   * has (`execution-client.service.ts:128,411`,
   * `session-gateway.service.ts:1107-1137`). Starting again to resume is
   * local-provider semantics, where a fresh process genuinely is how a
   * conversation continues; on this wire it made every remote session exactly
   * one turn long (MAR-2582).
   *
   * The attach happens here, on send, rather than at boot for every remote
   * session: each one is a live SSE connection and the database holds
   * hundreds of them. Only sessions still running when the app closed are
   * reattached eagerly, by `resumeRunningRemoteSessions`.
   *
   * A session the daemon has never heard of is not guarded against, because
   * nothing local knows that reliably and the daemon does: it answers the
   * stream with 404 and the adapter fails the session saying so. Emergence
   * makes the same call.
   */
  private sendRemoteTurn(input: {
    session: Session
    text: string
    attachments: Attachment[] | undefined
    attachmentIds: string[] | undefined
    skillSelections: SkillSelection[] | undefined
    providerAccountId: string | null | undefined
    muteRelays?: boolean
    queuedInputId?: string
  }): void {
    const { session } = input
    assertLocalAccountSelection({
      executionHost: session.executionHost,
      accountId: input.providerAccountId,
    })
    // The other door's barrier, in the same shape and for the same reason
    // (MAR-2682). Nothing after this send asks the host's permission again --
    // the attach and the wire call are all there is -- so the question is asked
    // here, on this method's own line, above the write it authorises.
    this.assertTurnProviderRunnable(session)

    // Past the refusal: unarchiving is a consequence of sending, and a send
    // this method refuses must not leave one.
    if (session.archivedAt) {
      this.updateArchiveState(session.id, null)
    }

    this.requestRelayMute(session.id, input.muteRelays)

    // Callers reach here having found no handle, but they got here through
    // awaits — a boot-time reattach or a second send can have landed one in
    // between. Reusing it costs nothing; opening a second stream for one
    // session would apply every event twice.
    const handle =
      this.activeHandles.get(session.id) ?? this.attachRemoteHandle(session)
    handle.sendMessage(input.text, input.attachments, input.skillSelections, {
      deliveryMode: 'normal',
      ...(input.queuedInputId ? { queuedInputId: input.queuedInputId } : {}),
      providerAccountId: input.providerAccountId,
    })
  }

  /**
   * Persists the last processed remote event sequence so a restarted app
   * can resume the stream without replaying already-applied events.
   */
  recordRemoteEventSeq(sessionId: string, seq: number): void {
    this.sessionRepository.setExecutionHostLastSeq(sessionId, seq)
  }

  /** @internal exposed for tests; do not call from production code. */
  triggerLivenessTickForTest(): void {
    this.liveness.triggerTickForTest()
  }

  private emitLivenessNote(
    sessionId: string,
    kind: SessionLivenessNoteKind,
  ): void {
    const session = this.getById(sessionId)
    if (!session) return
    const text =
      kind === 'silent'
        ? 'No provider events for 3 minutes. The provider may be stuck. Use Stop to abort if needed.'
        : 'No provider events for 60s. Still waiting; long reasoning steps can be normal.'
    const timestamp = new Date().toISOString()
    const note = this.addConversationItem(sessionId, {
      id: randomUUID(),
      turnId: null,
      kind: 'note',
      state: 'complete',
      level: kind === 'silent' ? 'warning' : 'info',
      text,
      createdAt: timestamp,
      updatedAt: timestamp,
      providerMeta: {
        providerId: session.providerId,
        providerItemId: null,
        providerEventType: 'liveness',
      },
    })
    if (note) {
      this.notifySessionChange(sessionId, {
        sessionId,
        op: 'add',
        item: note,
      })
    }
  }

  private completeOrphanAnswer(session: Session): void {
    const at = new Date().toISOString()
    this.evidenceCounts.apply(session.id, null, {
      kind: 'process.ended',
      at,
      reason: 'exit',
      unresolvedStatus: 'unknown',
    })
    this.parallelWorkCounts.set(
      session.id,
      this.evidenceCounts.countParallelWork([session.id]).get(session.id)!,
    )
    this.applySessionPatch(session.id, {
      status: 'completed',
      attention: 'finished',
      activity: null,
      updatedAt: at,
    })
    this.closeActiveTurn(session.id, 'completed')
    this.notifySessionChange(session.id)
  }

  /**
   * A reset a restart interrupted: fail the rows behind it, loudly, and say
   * so in the transcript (MAR-3307 R2).
   *
   * This does NOT break MAR-2971's law ("a queued row is never failed
   * because the turn ahead of it ended"). That law is about a turn that
   * ENDS: its handle drains the queue next. A boot is not a turn ending.
   * The process that would have drained these rows is gone, and a reset's
   * rows are drained only by the reset's own lifecycle (`resetsInFlight`,
   * in memory, lost with the process). Delivering them now would act on a
   * stale brief in a conversation nobody is watching, so they are failed
   * with a reason and the retry goes back to whoever sent them. Their
   * endings are told by `tellBootEndings`, like every other boot ending.
   */
  private failRowsBehindStaleReset(
    session: Session,
    behind: readonly SessionQueuedInput[],
  ): void {
    if (behind.length === 0) return
    for (const row of behind) {
      this.queuedInputs.patch(row.id, 'failed', STALE_RESET_ROW_ERROR)
    }
    const timestamp = new Date().toISOString()
    this.addConversationItem(session.id, {
      id: randomUUID(),
      turnId: null,
      kind: 'note',
      state: 'complete',
      level: 'warning',
      text: staleResetNoteText(behind.length),
      createdAt: timestamp,
      updatedAt: timestamp,
      providerMeta: {
        providerId: session.providerId,
        providerItemId: null,
        providerEventType: STALE_RESET_NOTE_EVENT_TYPE,
      },
    })
  }

  /**
   * Tells the endings boot recovery wrote but could not say (MAR-3307).
   *
   * The constructor runs before `AutoDispatchService` and the relay engine
   * subscribe (`main/index.ts`), so a terminal emitted there reaches nobody.
   * Boot therefore fails rows without telling, and this runs once, right
   * after the last listener is wired. It reads the RECORD: every `failed` row
   * with a receipt and no `ending_told_at`. It does not use ids held in
   * memory, because a crash between the boot and this call would lose those.
   * The untold rows are still on disk, and the next boot tells them.
   *
   * One `failed` terminal per session, the same shape a turn's failure
   * emits, then the stamp. Emit before stamp, as in `terminateQueuedInputs`:
   * both listeners are idempotent (`auto_dispatches ... error IS NULL`,
   * `relay_hops ... settled_at IS NULL`), so a lost stamp costs one repeated
   * event, while a lost event would leave the receipt with no ending. A
   * second call finds nothing.
   */
  tellBootEndings(): void {
    const bySession = new Map<string, SessionQueuedInput[]>()
    for (const row of this.queuedInputs.listFailedUntold()) {
      const rows = bySession.get(row.sessionId)
      if (rows) rows.push(row)
      else bySession.set(row.sessionId, [row])
    }
    for (const [sessionId, rows] of bySession) {
      this.emitDispatchTerminal(
        sessionId,
        'failed',
        rows
          .map((row) => row.dispatchId)
          .filter((dispatchId): dispatchId is string => dispatchId !== null),
      )
      this.queuedInputs.markEndingTold(rows.map((row) => row.id))
    }
  }

  /**
   * The texts of a session's user messages recorded at or after `stamp`
   * (MAR-3307 R1): what `readStaleResetFromQueue` asks to tell a reset in
   * flight from one that finished.
   *
   * `>=`, not `>`: the reset row's `sent` stamp (`markQueuedInputSent`) is
   * written when the provider accepts the turn, and Claude Code records its
   * own `/clear` prompt right after, often in the same millisecond. Both are
   * `toISOString()` values, so the text order is the time order.
   */
  private readUserTextsAtOrAfter(sessionId: string, stamp: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT payload_json
         FROM session_conversation_items
         WHERE session_id = ?
           AND kind = 'message'
           AND json_extract(payload_json, '$.actor') = 'user'
           AND created_at >= ?
         ORDER BY sequence`,
      )
      .all(sessionId, stamp) as Array<{ payload_json: string }>
    return rows.map((row) => {
      try {
        const text = (JSON.parse(row.payload_json) as { text?: unknown }).text
        return typeof text === 'string' ? text : ''
      } catch {
        return ''
      }
    })
  }

  private markStaleRunningSessionFailed(
    session: Session,
    reason: string,
    notify: boolean,
    options: { atBoot?: boolean } = {},
  ): Session {
    const timestamp = new Date().toISOString()
    // Read BEFORE the queue is terminated: an opener caught `dispatching` is
    // about to become `failed`, and then it no longer reads as the turn in
    // flight (MAR-3307 R1).
    const staleReset = options.atBoot
      ? readStaleResetFromQueue(
          this.queuedInputs.listAllForSession(session.id),
          (stamp) => this.readUserTextsAtOrAfter(session.id, stamp),
        )
      : null
    const note = this.addConversationItem(session.id, {
      id: randomUUID(),
      turnId: null,
      kind: 'note',
      state: 'error',
      level: 'error',
      text: reason,
      createdAt: timestamp,
      updatedAt: timestamp,
      providerMeta: {
        providerId: session.providerId,
        providerItemId: null,
        providerEventType: 'system',
      },
    })

    this.applySessionPatch(session.id, {
      status: 'failed',
      attention: 'failed',
      activity: null,
      updatedAt: timestamp,
    })
    // The stale run's queue ends with it, and says so (MAR-2759, design P).
    // At boot the saying waits for `tellBootEndings` (MAR-3307).
    this.terminateQueuedInputs(session.id, reason, {
      deferTellingToBoot: options.atBoot === true,
    })
    if (staleReset) this.failRowsBehindStaleReset(session, staleReset.behind)
    this.releaseHandle(session.id)
    this.closeActiveTurn(session.id, 'errored')

    if (notify) {
      this.notifySessionChange(
        session.id,
        note
          ? {
              sessionId: session.id,
              op: 'add',
              item: note,
            }
          : undefined,
      )
    }

    return this.getById(session.id) ?? session
  }

  private closeActiveTurn(
    sessionId: string,
    status: 'completed' | 'errored',
  ): void {
    if (!this.turnCapture) return
    const turnId = this.activeTurnIds.get(sessionId)
    if (!turnId) return
    const summarySource = this.firstAssistantTextForTurn(sessionId, turnId)
    this.activeTurnIds.delete(sessionId)
    this.turnCapture.endTurn({
      sessionId,
      turnId,
      status,
      summarySource,
    })
  }

  private firstAssistantTextForTurn(
    sessionId: string,
    turnId: string,
  ): string | null {
    const rows = this.db
      .prepare(
        `SELECT payload_json
         FROM session_conversation_items
         WHERE session_id = ? AND turn_id = ? AND kind = 'message'
         ORDER BY sequence ASC`,
      )
      .all(sessionId, turnId) as Array<{ payload_json: string }>
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.payload_json) as {
          actor?: string
          text?: string
        }
        if (parsed.actor === 'assistant' && typeof parsed.text === 'string') {
          return parsed.text
        }
      } catch {
        continue
      }
    }
    return null
  }

  private handleAssistantNaming(
    sessionId: string,
    item: ConversationItem,
  ): void {
    if (
      item.kind !== 'message' ||
      item.actor !== 'assistant' ||
      !item.text.trim() ||
      this.hasBeenAutoNamed(sessionId)
    ) {
      return
    }

    const assistantCount = this.getConversation(sessionId).filter(
      (entry) => entry.kind === 'message' && entry.actor === 'assistant',
    ).length

    if (assistantCount !== 1) {
      return
    }

    const session = this.getById(sessionId)
    if (!session) return

    void this.runNaming(session).catch(() => {
      // Naming failures are silent per spec.
    })
  }
}
