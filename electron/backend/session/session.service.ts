import { randomUUID } from 'crypto'
import { mkdirSync } from 'fs'
import type Database from 'better-sqlite3'
import type {
  ConversationItemRow,
  SessionRow,
} from '../database/database.types'
import type { ProviderExecutionHost } from '../provider/execution-host/execution-host.types'
import { assertLocalAccountSelection } from '../provider-account/provider-account-resolution.pure'
import { remoteProviderIdForLocalProvider } from '../provider/execution-host/remote-execution-host.pure'
import type {
  Attachment,
  MidRunInputMode,
  SessionHandle,
  SessionStatus,
  AttentionState,
  ActivitySignal,
  ProviderContextManagementResult,
} from '../provider/provider.types'
import {
  getMidRunInputCapabilityForProviderId,
  parseReasoningEffort,
  supportsMidRunInputMode,
} from '../provider/provider-descriptor.pure'
import type { AttachmentsService } from '../attachments/attachments.service'
import type { SkillSelection } from '../skills/skills.types'
import {
  sessionSummaryFromRow,
  type Session,
  type SessionSummary,
  type CreateSessionInput,
  type QueuedInputPatchEvent,
  type SessionQueuedInput,
  type SessionSettledEvent,
  type SessionSettledListener,
} from './session.types'
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
  isAttentionRequestSummary,
  isTerminalSessionStatus,
  resolveAttentionRequestKind,
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

type UserMessageDraft = Extract<
  ConversationItem,
  { kind: 'message'; actor: 'user' }
>
type UserMessageDraftInput = Omit<UserMessageDraft, 'sessionId' | 'sequence'>

interface AttentionRequestRow extends AttentionRequestRowLike {
  session_id: string
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
    options?: { requestId?: string },
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
 * Facade and orchestrator for session use cases.
 *
 * Keeps the public session API in one place while delegating focused concerns
 * such as queued input persistence, liveness, repository storage, turn capture,
 * and context injection to collaborators.
 */
export class SessionService {
  private activeHandles = new Map<string, SessionHandle>()
  /**
   * Handles that joined a run which had already come to rest, and so have no
   * run of their own to end yet (MAR-2582).
   *
   * A handle leaves this set the moment the session it joined reports itself
   * moving again -- from then on the run is its own and its terminal events
   * end it. See `handleLifecycle` for why a handle is only allowed to end the
   * run it began.
   */
  private handlesAwaitingTheirRun = new WeakSet<SessionHandle>()
  private activeTurnIds = new Map<string, string>()
  /**
   * Account chosen for the turn a provider is about to open (ADR 0007, PA4).
   * Written when the handle starts or a message is dispatched, read when the
   * provider emits the user message that opens the turn row.
   */
  private pendingTurnAccountIds = new Map<string, string | null>()
  private pendingConversationPatches = new Map<
    string,
    PendingConversationPatch
  >()
  private pendingConversationPatchTimers = new Map<
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
  private pendingSettleEvents: SessionSettledEvent[] = []
  private settleFlushScheduled = false
  /**
   * True only while the constructor fails sessions the previous app run left
   * running. Those settles are bookkeeping about a process that is already
   * gone, not sessions finishing now, and must never fire relays at boot.
   */
  private recoveringStaleSessions = false
  private remoteExecutionHost: ProviderExecutionHost | null = null
  private remoteWorkspaceSourceResolver:
    | ((workingDirectory: string) => { repository: string } | null)
    | null = null
  private readonly sessionRepository: SessionRepository
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
    this.sessionRepository = new SessionRepository(db)
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

  setRemoteExecutionHost(host: ProviderExecutionHost): void {
    this.remoteExecutionHost = host
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
   */
  private resolveExecution(
    session: Pick<SessionSummary, 'executionHost' | 'providerId'>,
  ): { host: ProviderExecutionHost; providerId: string } {
    if (session.executionHost !== 'remote') {
      return { host: this.executionHost, providerId: session.providerId }
    }

    if (!this.remoteExecutionHost) {
      throw new Error('Remote execution host is not configured')
    }
    const remoteProviderId = remoteProviderIdForLocalProvider(
      session.providerId,
    )
    if (!remoteProviderId) {
      throw new Error(
        `Provider ${session.providerId} is not supported on the remote execution host`,
      )
    }
    return { host: this.remoteExecutionHost, providerId: remoteProviderId }
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
   * Workspace source a remote session start must carry: the local working
   * directory does not exist on the remote host, so the daemon clones the
   * session repository instead.
   */
  private requireRemoteWorkspace(
    session: Pick<SessionSummary, 'workingDirectory'>,
  ): { repository: string } {
    const workspace =
      this.remoteWorkspaceSourceResolver?.(session.workingDirectory) ?? null
    if (!workspace) {
      throw new Error(
        'Remote sessions require a repository with an origin remote the daemon can clone',
      )
    }
    return workspace
  }

  setSessionTerminatedListener(listener: (sessionId: string) => void): void {
    this.onSessionTerminated = listener
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
  setModelSelection(
    id: string,
    input: { providerId: unknown; model: string | null; effort: unknown },
  ): Session {
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

    const refusal = describeModelSelectionRefusal({
      status: session.status,
      attention: session.attention,
      hasActiveHandle: this.activeHandles.has(id),
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
      requestId ? { requestId } : undefined,
    )
    if (!title) return false
    this.sessionRepository.rename(session.id, title)
    this.notifySessionChange(session.id)
    return true
  }

  private hasBeenAutoNamed(id: string): boolean {
    return this.sessionRepository.isAutoNamed(id)
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
        ? 'local'
        : (input.executionHost ?? 'local')

    this.sessionRepository.create({
      id,
      contextKind: input.contextKind ?? 'project',
      projectId,
      workspaceId,
      executionHost,
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

  getById(id: string): Session | null {
    const row = this.getRowById(id)

    return row ? this.buildSessionSummary(row) : null
  }

  getSummaryById(id: string): SessionSummary | null {
    const row = this.getRowById(id)
    return row ? this.buildSessionSummary(row) : null
  }

  private buildSessionSummary(row: SessionRow): SessionSummary {
    const summary = sessionSummaryFromRow(row)
    const attentionRequestKind = resolveAttentionRequestKind(
      summary,
      this.readAttentionRequestRow(summary.id),
    )
    return attentionRequestKind ? { ...summary, attentionRequestKind } : summary
  }

  private buildSessionSummaries(rows: SessionRow[]): SessionSummary[] {
    const summaries = rows.map(sessionSummaryFromRow)
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
   * The text of the newest finished assistant message in a session, or null
   * when there is none to carry.
   *
   * This is the relay payload. It reads the single row rather than
   * materializing the whole conversation because it runs on every settle, and
   * it flushes coalesced patches first so a message that finished streaming
   * moments before the session settled is not missed.
   */
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

  getConversation(id: string): ConversationItem[] {
    this.flushPendingConversationPatchesForSession(id)

    const rows = this.db
      .prepare(
        `SELECT items.*, sessions.provider_id
         FROM session_conversation_items items
         INNER JOIN sessions ON sessions.id = items.session_id
         WHERE items.session_id = ?
         ORDER BY items.sequence ASC`,
      )
      .all(id) as ConversationItemRow[]

    return rows.map(conversationItemFromRow)
  }

  getQueuedInputs(sessionId: string): SessionQueuedInput[] {
    return this.queuedInputs.list(sessionId)
  }

  cancelQueuedInput(id: string): void {
    this.queuedInputs.cancel(id)
  }

  delete(id: string): void {
    this.clearPendingConversationPatchesForSession(id)
    const handle = this.activeHandles.get(id)
    if (handle) {
      handle.stop()
      this.releaseHandle(id)
    }
    this.sessionRepository.delete(id)
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

  async start(id: string, input: SendMessageInput): Promise<void> {
    return this.withDispatchInFlight(id, () => this.openFirstTurn(id, input))
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
   */
  private async withDispatchInFlight<T>(
    sessionId: string,
    dispatch: (inFlight: SessionDispatch) => Promise<T>,
  ): Promise<T> {
    const inFlight = this.dispatches.begin(sessionId)
    try {
      return await dispatch(inFlight)
    } finally {
      this.dispatches.settle(inFlight)
    }
  }

  private async openFirstTurn(
    id: string,
    input: SendMessageInput,
  ): Promise<void> {
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)

    if (session.archivedAt) {
      this.updateArchiveState(id, null)
    }

    await this.rebindDraftAttachments(id, input.attachmentIds)
    const attachments = this.resolveAttachments(input.attachmentIds)

    const bootContext = this.prepareBootContext(session, input)

    this.startHandle(
      session,
      bootContext.augmentedText,
      this.getContinuationToken(id),
      attachments,
      input.attachmentIds,
      input.skillSelections,
      input.providerAccountId,
      { muteRelays: input.muteRelays },
    )
  }

  private prepareBootContext(
    session: Session,
    input: SendMessageInput,
  ): { augmentedText: string } {
    if (!this.contextInjection) {
      return { augmentedText: input.text }
    }

    const result = this.contextInjection.prepareBoot({
      session,
      originalText: input.text,
      contextItemIds: input.contextItemIds,
    })

    if (result.noteDraft) {
      this.recordBootContextNote(session.id, result.noteDraft)
    }

    return { augmentedText: result.augmentedText }
  }

  private prepareUserTurnText(
    session: Session,
    originalText: string,
    skipContextInjection?: boolean,
  ): string {
    if (skipContextInjection) return originalText
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

  async sendMessage(id: string, input: SendMessageInput): Promise<void> {
    return this.withDispatchInFlight(id, () => this.deliverMessage(id, input))
  }

  private async deliverMessage(
    id: string,
    input: SendMessageInput,
  ): Promise<void> {
    let session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)

    if (session.providerId === 'shell') {
      throw new Error(
        `Session ${id} uses the shell provider and cannot accept conversation messages`,
      )
    }

    if (session.archivedAt) {
      this.updateArchiveState(id, null)
    }

    await this.rebindDraftAttachments(id, input.attachmentIds)
    const attachments = this.resolveAttachments(input.attachmentIds)

    const handle = this.activeHandles.get(id)
    if (!handle && session.status === 'running') {
      session = this.markStaleRunningSessionFailed(
        session,
        'Session marked failed because Convergence no longer has an active provider process for this run.',
        true,
      )
    }

    const deliveryMode = this.resolveDeliveryMode(session, input.deliveryMode)

    if (handle) {
      this.dispatchToActiveHandle({
        session,
        handle,
        input,
        attachments,
        deliveryMode,
      })
      return
    }

    const execution = this.resolveExecution(session)
    const capabilities = execution.host.capabilitiesFor(execution.providerId)
    if (!capabilities) {
      throw new Error(`Provider not found: ${session.providerId}`)
    }

    const continuationToken = this.getContinuationToken(id)
    if (
      deliveryMode === 'follow-up' &&
      session.status === 'running' &&
      getMidRunInputCapabilityForProviderId(session.providerId)
        .supportsAppQueuedFollowUp
    ) {
      this.queuedInputs.enqueue(session.id, input, 'follow-up')
      return
    }

    if (deliveryMode !== 'normal') {
      throw new Error(
        `Session cannot accept ${deliveryMode} input while inactive`,
      )
    }

    if (session.executionHost === 'remote') {
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
      return
    }

    if (capabilities.supportsContinuation && continuationToken) {
      const augmentedText = this.prepareUserTurnText(
        session,
        input.text,
        input.skipContextInjection,
      )
      this.startHandle(
        session,
        augmentedText,
        continuationToken,
        attachments,
        input.attachmentIds,
        input.skillSelections,
        input.providerAccountId,
        { muteRelays: input.muteRelays },
      )
      return
    }

    if (capabilities.supportsContinuation) {
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
   * The queue is Convergence's, not the provider's: `dispatchNextQueuedInput`
   * runs when the session settles, so this works on any provider rather than
   * only the ones with native mid-run input.
   */
  async sendMessageWithOpener(
    id: string,
    input: SendMessageInput & { opener: string },
  ): Promise<void> {
    await this.sendMessage(id, {
      text: input.opener,
      providerAccountId: input.providerAccountId,
      skipContextInjection: true,
    })

    this.queuedInputs.enqueue(
      id,
      {
        text: input.text,
        providerAccountId: input.providerAccountId ?? null,
      },
      'follow-up',
    )
  }

  async compactContext(
    id: string,
    instructions?: string,
  ): Promise<ProviderContextManagementResult> {
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)
    if (session.providerId === 'shell') {
      throw new Error('Shell sessions do not have a provider context')
    }
    if (session.executionHost === 'remote') {
      throw new Error(
        'Manual context management is not supported on remote execution hosts yet',
      )
    }
    if (session.status !== 'completed' || this.activeHandles.has(id)) {
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
    if (
      this.getQueuedInputs(id).some(
        (item) => item.state === 'queued' || item.state === 'dispatching',
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
    if (
      !capability?.supportsContextManagement ||
      !execution.host.manageContext
    ) {
      throw new Error(
        `${session.providerId} does not support manual context compaction`,
      )
    }

    const timestamp = new Date().toISOString()
    this.applySessionPatch(id, { activity: 'compacting', updatedAt: timestamp })
    this.notifySessionChange(id)

    try {
      const result = await execution.host.manageContext(
        execution.providerId,
        {
          sessionId: session.id,
          workingDirectory: session.workingDirectory,
          initialMessage: '',
          previousAssistantTexts: this.getPreviousAssistantMessageTexts(id),
          model: session.model,
          effort: session.effort,
          serviceTier: session.serviceTier ?? null,
          continuationToken,
          permissionConfig: session.permissionConfig,
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
    }
  }

  private dispatchToActiveHandle(input: {
    session: Session
    handle: SessionHandle
    input: SendMessageInput
    attachments: Attachment[] | undefined
    deliveryMode: MidRunInputMode
  }): void {
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

    if (deliveryMode === 'follow-up' && session.status === 'running') {
      if (!capability.supportsNativeFollowUp) {
        this.queuedInputs.enqueue(session.id, input.input, 'follow-up')
        return
      }
    }

    const shouldStartConversationTurn =
      deliveryMode === 'normal' || deliveryMode === 'answer'
    if (shouldStartConversationTurn) {
      this.pendingUserAttachmentIds.set(
        session.id,
        input.input.attachmentIds ?? [],
      )
      this.pendingUserSkillSelections.set(
        session.id,
        input.input.skillSelections ?? [],
      )
    }

    const augmentedText = this.prepareUserTurnText(
      session,
      input.input.text,
      input.input.skipContextInjection,
    )

    assertLocalAccountSelection({
      executionHost: input.session.executionHost,
      accountId: input.input.providerAccountId,
    })

    this.pendingTurnAccountIds.set(
      input.session.id,
      input.input.providerAccountId ?? null,
    )
    this.requestRelayMute(input.session.id, input.input.muteRelays)
    handle.sendMessage(
      augmentedText,
      attachments,
      input.input.skillSelections,
      {
        deliveryMode,
        interactionResponse: input.input.interactionResponse,
        providerAccountId: input.input.providerAccountId,
      },
    )
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

  private pendingUserAttachmentIds = new Map<string, string[]>()
  private pendingUserSkillSelections = new Map<string, SkillSelection[]>()

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

  approve(id: string, providerApprovalId?: string): void {
    const handle = this.activeHandles.get(id)
    if (!handle) {
      this.handleInactiveApprovalAction(id)
      return
    }
    handle.approve(providerApprovalId)
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
    const handle = this.activeHandles.get(id)
    if (!handle) {
      const session = this.getById(id)
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
    handle.stop()
    this.releaseHandle(id)
  }

  disposeAll(): void {
    for (const sessionId of Array.from(this.activeHandles.keys())) {
      this.releaseHandle(sessionId)
    }
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
        this.handleLifecycle(sessionId, delta.patch.status, source)
        this.notifySessionChange(sessionId)
        return
      }

      case 'conversation.item.add': {
        const item = this.addConversationItem(sessionId, delta.item)
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
      this.flushPendingConversationPatchByKey(key)
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

  private flushPendingConversationPatchByKey(key: string): void {
    const pending = this.pendingConversationPatches.get(key)
    if (!pending) return

    this.pendingConversationPatches.delete(key)
    const timer = this.pendingConversationPatchTimers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.pendingConversationPatchTimers.delete(key)
    }

    const item = this.patchConversationItem(
      pending.sessionId,
      pending.itemId,
      pending.patch,
    )
    if (!item) return
    this.notifyConversationPatch({
      sessionId: pending.sessionId,
      op: 'patch',
      item,
    })
  }

  private flushPendingConversationPatchesForSession(sessionId: string): void {
    for (const [key, pending] of Array.from(
      this.pendingConversationPatches.entries(),
    )) {
      if (pending.sessionId === sessionId) {
        this.flushPendingConversationPatchByKey(key)
      }
    }
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
    const pendingAttachments = this.pendingUserAttachmentIds.get(sessionId)
    const pendingSkillSelections =
      this.pendingUserSkillSelections.get(sessionId)
    const isUserMessage =
      itemDraft.kind === 'message' &&
      (itemDraft as { actor?: unknown }).actor === 'user'
    const turnId = isUserMessage ? randomUUID() : (latest?.turn_id ?? null)

    let item: ConversationItem
    if (isUserMessage) {
      const userMessageDraft = itemDraft as unknown as UserMessageDraftInput
      item = {
        ...(userMessageDraft as unknown as ConversationItemDraft),
        sessionId,
        sequence: nextSequence,
        turnId,
        attachmentIds:
          userMessageDraft.attachmentIds ??
          (pendingAttachments && pendingAttachments.length > 0
            ? pendingAttachments
            : undefined),
        skillSelections:
          userMessageDraft.skillSelections ??
          (pendingSkillSelections && pendingSkillSelections.length > 0
            ? pendingSkillSelections
            : undefined),
      } as ConversationItem
    } else {
      item = {
        ...itemDraft,
        sessionId,
        sequence: nextSequence,
        turnId,
      } as ConversationItem
    }

    if (item.kind === 'message' && item.actor === 'user') {
      this.pendingUserAttachmentIds.delete(sessionId)
      this.pendingUserSkillSelections.delete(sessionId)
    }

    const insertRow = conversationItemToInsertRow(item)

    this.db
      .prepare(
        `INSERT INTO session_conversation_items (
           id,
           session_id,
           sequence,
           turn_id,
           kind,
           state,
           payload_json,
           provider_item_id,
           provider_event_type,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        insertRow.id,
        insertRow.sessionId,
        insertRow.sequence,
        insertRow.turnId,
        insertRow.kind,
        insertRow.state,
        insertRow.payloadJson,
        insertRow.providerItemId,
        insertRow.providerEventType,
        insertRow.createdAt,
        insertRow.updatedAt,
      )

    this.db
      .prepare(
        'UPDATE sessions SET last_sequence = ?, conversation_version = 2, updated_at = ? WHERE id = ?',
      )
      .run(nextSequence, item.updatedAt, sessionId)

    if (isUserMessage && this.turnCapture && turnId) {
      this.activeTurnIds.set(sessionId, turnId)
      void this.turnCapture.startTurn({
        sessionId,
        turnId,
        workingDirectory: row.working_directory,
        providerAccountId: this.pendingTurnAccountIds.get(sessionId) ?? null,
        // Read straight off the row rather than from a pending slot (MAR-2551,
        // deliberately not a fourth instance of MAR-2539). The account is a
        // per-send choice and has to be carried from the dispatch site; the
        // model is standing session state, and it cannot move between dispatch
        // and this stamp because `describeModelSelectionRefusal` refuses every
        // write while a handle is attached or a send is in flight — the two
        // together cover the whole of the send path, from its first statement
        // to the handle it registers.
        model: row.model,
        effort: row.effort,
      })
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
        `SELECT items.*, sessions.provider_id
         FROM session_conversation_items items
         INNER JOIN sessions ON sessions.id = items.session_id
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

    this.db
      .prepare(
        `UPDATE session_conversation_items
         SET turn_id = ?,
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
        row.kind,
        row.state,
        row.payloadJson,
        row.providerItemId,
        row.providerEventType,
        row.updatedAt,
        sessionId,
        itemId,
      )

    this.db
      .prepare('UPDATE sessions SET updated_at = ? WHERE id = ?')
      .run(merged.updatedAt, sessionId)

    return merged
  }

  /**
   * Writes one session patch, and -- when the patch came from an execution
   * host event -- the stream cursor and the settle marker with it (MAR-2582).
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
    const hostSeq = executionHostSeq ?? 0
    // Read from the patch, not from the resulting status: the marker means
    // "this event settled the session", and a patch that carries no status at
    // all -- a continuation token arriving after the settle -- did not.
    const settledSeq =
      patch.status && isTerminalSessionStatus(patch.status) ? hostSeq : 0

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
        settledSeq,
        updatedAt,
        sessionId,
      )

    if (nextAttention !== prevAttention) {
      this.notifyAttention(sessionId, prevAttention, nextAttention)
    }

    if (isSettling) {
      this.queueSettleEvent({
        sessionId,
        status: nextStatus,
        settledAt: updatedAt,
        relaysMuted,
      })
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

  private startHandle(
    session: Session,
    initialMessage: string,
    continuationToken: string | null,
    initialAttachments?: Attachment[],
    initialAttachmentIds?: string[],
    initialSkillSelections?: SkillSelection[],
    providerAccountId?: string | null,
    /**
     * What the human asked for when they sent this, rather than how the handle
     * should be built. An object so the flag names itself at the call site: a
     * bare eighth positional boolean here would be unreadable at all three of
     * them.
     */
    turnFlags?: { muteRelays?: boolean },
  ): void {
    // Accounts are host-scoped (ADR 0007, PA10). Refuse before anything is
    // spawned or recorded: a remote host runs on its own credential whatever is
    // selected here, and starting anyway would file the local account id
    // against a turn it never served.
    assertLocalAccountSelection({
      executionHost: session.executionHost,
      accountId: providerAccountId,
    })

    const execution = this.resolveExecution(session)
    if (!execution.host.capabilitiesFor(execution.providerId)) {
      throw new Error(`Provider not found: ${session.providerId}`)
    }
    const workspace =
      session.executionHost === 'remote'
        ? this.requireRemoteWorkspace(session)
        : null

    if (initialAttachmentIds && initialAttachmentIds.length > 0) {
      this.pendingUserAttachmentIds.set(session.id, initialAttachmentIds)
    }
    if (initialSkillSelections && initialSkillSelections.length > 0) {
      this.pendingUserSkillSelections.set(session.id, initialSkillSelections)
    }

    const handle = execution.host.start(execution.providerId, {
      sessionId: session.id,
      workingDirectory: session.workingDirectory,
      initialMessage,
      initialSkillSelections,
      previousAssistantTexts: this.getPreviousAssistantMessageTexts(session.id),
      model: session.model,
      effort: session.effort,
      serviceTier: session.serviceTier ?? null,
      continuationToken,
      permissionConfig: session.permissionConfig,
      providerAccountId: providerAccountId ?? null,
      initialAttachments,
      ...(workspace ? { workspace } : {}),
    })

    this.pendingTurnAccountIds.set(session.id, providerAccountId ?? null)
    this.requestRelayMute(session.id, turnFlags?.muteRelays)
    this.activeHandles.set(session.id, handle)
    handle.onDelta((delta: SessionDelta) => {
      this.applyDelta(session.id, delta, handle)
    })
    handle.onActivityHeartbeat?.(() => {
      this.liveness.bump(session.id)
    })
  }

  private getPreviousAssistantMessageTexts(sessionId: string): string[] {
    return this.getConversation(sessionId)
      .filter(
        (item): item is Extract<ConversationItem, { kind: 'message' }> =>
          item.kind === 'message' &&
          item.actor === 'assistant' &&
          item.text.trim().length > 0,
      )
      .map((item) => item.text)
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
   * `source` is the handle that emitted the event, and it ends a run only if
   * it began one. A handle that attached to a session the record already
   * showed at rest joined a finished run: the events the daemon replays from
   * the stream cursor are that run's tail, and the settle among them belongs
   * to the handle that is already gone (MAR-2582).
   *
   * Without that a replayed settle ends the turn that follows it: the message
   * reaches the daemon, the answer never reaches the app, and the session
   * reports itself finished while the agent is still working. It cannot be
   * decided by sequence -- see `isReplayedHostSettle` for why the marker
   * cannot tell a replay from a duplicate encoding.
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
   */
  private handleLifecycle(
    sessionId: string,
    status: SessionStatus | undefined,
    source: SessionHandle,
  ): void {
    if (this.handlesAwaitingTheirRun.has(source)) return
    if (status === 'failed') {
      this.releaseHandle(sessionId)
      this.closeActiveTurn(sessionId, 'errored')
    } else if (status === 'completed') {
      const summary = this.getSummaryById(sessionId)
      if (
        summary &&
        (!this.continuationSupportedFor(summary) || summary.continuationToken)
      ) {
        this.releaseHandle(sessionId)
      }
      this.liveness.clear(sessionId)
      this.closeActiveTurn(sessionId, 'completed')
      this.dispatchNextQueuedInput(sessionId)
    }
  }

  private releaseHandle(sessionId: string): void {
    const handle = this.activeHandles.get(sessionId)
    if (!handle) return

    this.activeHandles.delete(sessionId)
    try {
      handle.dispose?.()
    } catch {
      // Resource cleanup is best-effort; the handle is no longer addressable.
    }
    this.liveness.clear(sessionId)
    this.pendingUserAttachmentIds.delete(sessionId)
    this.pendingUserSkillSelections.delete(sessionId)
    this.onSessionTerminated?.(sessionId)
  }

  private dispatchNextQueuedInput(sessionId: string): void {
    const item = this.queuedInputs.nextQueued(sessionId)
    if (!item) return

    this.queuedInputs.patch(item.id, 'dispatching')

    try {
      const session = this.getById(sessionId)
      if (!session) throw new Error(`Session not found: ${sessionId}`)
      const attachments = this.resolveAttachments(item.attachmentIds)
      const handle = this.activeHandles.get(sessionId)

      const augmentedText = this.prepareUserTurnText(
        session,
        item.text,
        item.skipContextInjection,
      )

      if (handle) {
        this.pendingUserAttachmentIds.set(sessionId, item.attachmentIds)
        this.pendingUserSkillSelections.set(sessionId, item.skillSelections)
        this.pendingTurnAccountIds.set(sessionId, item.providerAccountId)
        // The mute the user chose when they wrote this, not the composer's
        // state now -- the toggle reset the moment they pressed send.
        this.requestRelayMute(sessionId, item.relaysMuted)
        handle.sendMessage(augmentedText, attachments, item.skillSelections, {
          deliveryMode: 'normal',
          queuedInputId: item.id,
          providerAccountId: item.providerAccountId,
        })
        this.queuedInputs.patch(item.id, 'sent')
        return
      }

      if (session.executionHost === 'remote') {
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
        this.queuedInputs.patch(item.id, 'sent')
        return
      }

      const continuationToken = this.getContinuationToken(sessionId)
      if (!this.continuationSupportedFor(session) || !continuationToken) {
        throw new Error('Session is no longer resumable')
      }

      this.startHandle(
        session,
        augmentedText,
        continuationToken,
        attachments,
        item.attachmentIds,
        item.skillSelections,
        // The account chosen when this input was queued, not whatever the
        // composer shows now — it may have waited through a switch.
        item.providerAccountId,
        { muteRelays: item.relaysMuted },
      )
      this.queuedInputs.patch(item.id, 'sent')
    } catch (err) {
      this.queuedInputs.patch(
        item.id,
        'failed',
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  private recoverStaleRunningSessions(): void {
    for (const row of this.sessionRepository.listRunningNonShell()) {
      const session = sessionSummaryFromRow(row)
      // Remote runs outlive the app process; they are reattached once the
      // remote execution host is wired via setRemoteExecutionHost.
      if (session.executionHost === 'remote') continue
      this.markStaleRunningSessionFailed(
        session,
        'Session marked failed because Convergence restarted before the provider process finished.',
        false,
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
      if (session.executionHost !== 'remote') continue
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

    this.pendingUserAttachmentIds.set(session.id, input.attachmentIds ?? [])
    this.pendingUserSkillSelections.set(session.id, input.skillSelections ?? [])
    this.pendingTurnAccountIds.set(session.id, input.providerAccountId ?? null)
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

  private markStaleRunningSessionFailed(
    session: Session,
    reason: string,
    notify: boolean,
  ): Session {
    const timestamp = new Date().toISOString()
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
    this.queuedInputs.failPendingForSession(session.id, reason)
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
