import { spawn, type ChildProcess } from 'child_process'
import { promises as fs } from 'fs'
import {
  failedNativeSkillInvocation,
  resolveNativeSkillInvocation,
  type NativeSkillInvocationResolution,
} from '../../skills/native-skill-invocation.pure'
import { markSkillSelectionsStatus } from '../../skills/skill-invocation.pure'
import { CursorSkillsService } from '../../skills/cursor-skills.service'
import type { SkillSelection } from '../../skills/skills.types'
import type { ProviderSkillCatalog } from '../../skills/skills.types'
import {
  mapCursorCommandCatalog,
  summarizeCursorCommandCatalogUpdate,
} from '../../skills/cursor-skills.mapper.pure'
import type {
  ConversationItem,
  InteractionResponse,
  SessionDelta,
} from '../../session/conversation-item.types'
import { RecordingError } from '../../session/session.pure'
import type { ProviderDebugChannel } from '../../provider-debug/provider-debug.types'
import {
  noopDebugSink,
  type ProviderDebugSink,
} from '../../provider-debug/provider-debug-sink'
import { ProviderSessionEmitter } from '../provider-session.emitter'
import type {
  ActivitySignal,
  AttentionState,
  Attachment,
  MidRunInputMode,
  OneShotInput,
  OneShotResult,
  Provider,
  ProviderDescriptor,
  SessionContextWindow,
  SessionHandle,
  SessionStartConfig,
  SessionStatus,
} from '../provider.types'
import { ProviderBusyError } from '../provider.types'
import { CONVERSATION_RESET_COMMAND } from '../../../../src/shared/lib/conversation-reset.pure'
import {
  CONTEXT_RESTARTED_NOTE_TEXT,
  SESSION_RESTARTED_EVENT_TYPE,
} from '../session-restart.pure'
import {
  buildCursorAcpSessionParams,
  performCursorAcpHandshake,
  readCursorAcpSessionId,
} from './cursor-acp-client'
import {
  buildCursorUnavailableContextWindow,
  CURSOR_ACP_MODEL_CONFIG_ID,
  CURSOR_ACP_PROMPT_SILENCE_BUDGET_MS,
  formatCursorAcpSilenceBudgetNote,
  getCursorAcpCurrentModelId,
} from './cursor-acp-contract.pure'
import {
  classifyCursorAcpStopReason,
  formatCursorAcpStopReasonNote,
} from './cursor-acp-stop-reason.pure'
import {
  formatCursorDeadTurnNote,
  isDeadTurnText,
} from './cursor-dead-turn.pure'
import {
  buildCursorAcpPermissionRequest,
  buildCursorAcpAskQuestionInputRequest,
  buildCursorAcpCreatePlanInputRequest,
  buildCursorAcpInteractionResponse,
  buildCursorAcpPassiveUpdateAcknowledgement,
  buildCursorAcpPassiveUpdateNote,
  buildCursorAcpPrompt,
  buildCursorAcpToolView,
  formatCursorPlanUpdate,
  getCursorAcpSessionUpdate,
  getCursorAcpSessionUpdateType,
  partFromAttachment,
  readCursorAcpContentText,
  readCursorAcpUpdateText,
  shouldAutoApproveCursorPermissions,
  type CursorAcpMessagePart,
  type CursorAcpInputRequest,
  type CursorAcpPermissionRequest,
} from './cursor-acp-message.pure'
import {
  applyCursorTodoUpdate,
  type CursorAcpTodo,
  type CursorAcpTodoUpdateParams,
} from './cursor-acp-todos.pure'
import {
  CursorAcpJsonRpcClient,
  CursorAcpSilenceBudgetError,
  type CursorAcpJsonRpcId,
} from './cursor-acp-jsonrpc'
import {
  buildContinuationRecoveryEntry,
  isMissingContinuationError,
} from '../continuation-recovery.pure'
import {
  fetchCursorAcpDescriptor,
  type CursorAcpSessionDiscoveryClient,
} from './cursor-descriptor.service'
import { buildFallbackCursorDescriptor } from '../provider-descriptor.pure'

const CURSOR_PROVIDER_ID = 'cursor'

/** `describe()` has no session of its own; its debug lines need an owner. */
const CURSOR_DESCRIPTOR_DEBUG_SESSION_ID = 'cursor-descriptor'

function now(): string {
  return new Date().toISOString()
}

interface PendingCursorApproval extends CursorAcpPermissionRequest {
  providerApprovalItemId: string
}

interface PendingCursorInteraction extends CursorAcpInputRequest {
  providerInputItemId: string
}

interface CursorSkillCatalogAdapter {
  list(projectPath: string): Promise<ProviderSkillCatalog>
}

/**
 * How a spawn opens its ACP session. `resume` is every start and respawn:
 * load the stored session, or open one when there is none. `fresh` is a
 * `/clear` with no live process (MAR-3216): open a new session even though a
 * stored id exists — never `session/load` the old one just to abandon it.
 */
type CursorSessionOpening = 'resume' | 'fresh'

type CursorResetOutcome =
  | { kind: 'restarted' }
  | { kind: 'nothing-to-clear' }
  | { kind: 'failed'; reason: string }

function describeCursorResetError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return /[.!?]$/.test(message) ? message : `${message}.`
}

interface CursorProviderOptions {
  requestTimeoutMs?: number
  /** Reported to Cursor in the ACP initialize handshake. */
  appVersion?: string | null
  /**
   * Injected by tests to drive `describe()`'s probe; production opens a
   * disposable ACP session over the real binary.
   */
  descriptorClient?: CursorAcpSessionDiscoveryClient
}

/**
 * A failed model probe is retried, never frozen (MAR-3145 R3) — but not on
 * every keystroke that opens a model picker.
 */
const CURSOR_DESCRIPTOR_RETRY_FLOOR_MS = 30_000

function findPendingApproval(
  pendingApprovals: Map<CursorAcpJsonRpcId, PendingCursorApproval>,
  providerApprovalId: string | undefined,
): [CursorAcpJsonRpcId, PendingCursorApproval] | undefined {
  if (providerApprovalId) {
    for (const entry of pendingApprovals.entries()) {
      if (
        String(entry[0]) === providerApprovalId ||
        entry[1].providerApprovalItemId === providerApprovalId
      ) {
        return entry
      }
    }
    return undefined
  }

  return pendingApprovals.entries().next().value as
    | [CursorAcpJsonRpcId, PendingCursorApproval]
    | undefined
}

function findPendingInteraction(
  pendingInteractions: Map<CursorAcpJsonRpcId, PendingCursorInteraction>,
): [CursorAcpJsonRpcId, PendingCursorInteraction] | undefined {
  return pendingInteractions.entries().next().value as
    | [CursorAcpJsonRpcId, PendingCursorInteraction]
    | undefined
}

async function loadCursorParts(
  attachments: Attachment[] | undefined,
): Promise<CursorAcpMessagePart[]> {
  if (!attachments || attachments.length === 0) return []

  const parts: CursorAcpMessagePart[] = []
  for (const attachment of attachments) {
    const buf = await fs.readFile(attachment.storagePath)
    parts.push(
      partFromAttachment(
        attachment,
        new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
      ),
    )
  }
  return parts
}

function buildOneShotCancelledOutcome(): unknown {
  return {
    outcome: {
      outcome: 'cancelled',
    },
  }
}

function runCursorAcpOneShot(
  binaryPath: string,
  input: OneShotInput,
  debugSink: ProviderDebugSink = noopDebugSink,
  appVersion: string | null = null,
): Promise<OneShotResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, ['acp'], {
      cwd: input.workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let rpc: CursorAcpJsonRpcClient | null = null
    let stderr = ''
    let assistantText = ''
    let settled = false

    function recordDebug(entry: {
      direction: 'in' | 'out'
      channel: ProviderDebugChannel
      method?: string
      payload?: unknown
      bytes?: number
      note?: string
    }): void {
      debugSink.record({
        sessionId: input.requestId ?? 'cursor-one-shot',
        providerId: CURSOR_PROVIDER_ID,
        at: Date.now(),
        ...entry,
      })
    }

    function cleanup(killProcess = true): void {
      clearTimeout(timeout)
      rpc?.destroy('Cursor oneShot settled')
      rpc = null
      if (killProcess && child && !child.killed) {
        child.kill('SIGTERM')
        const killTimer = setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL')
          }
        }, 3000)
        killTimer.unref?.()
      }
    }

    function fail(error: unknown): void {
      if (settled) return
      settled = true
      cleanup()
      reject(error instanceof Error ? error : new Error(String(error)))
    }

    function finish(result: OneShotResult): void {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    const timeout = setTimeout(() => {
      fail(new Error('cursor oneShot timed out'))
    }, input.timeoutMs ?? 20_000)

    if (!child.stdin || !child.stdout) {
      fail(new Error('failed to open Cursor ACP stdio'))
      return
    }

    rpc = new CursorAcpJsonRpcClient(child.stdin, child.stdout, {
      requestTimeoutMs: input.timeoutMs ?? 20_000,
      onDebug: recordDebug,
    })

    rpc.onNotification((method, params) => {
      if (method !== 'session/update') return
      if (getCursorAcpSessionUpdateType(params) !== 'agent_message_chunk') {
        return
      }

      const text = readCursorAcpUpdateText(params)
      if (text) assistantText += text
    })

    rpc.onServerRequest((method, params, id, activeRpc) => {
      if (method === 'session/request_permission') {
        const permissionRequest = buildCursorAcpPermissionRequest(params)
        activeRpc.respond(
          id,
          shouldAutoApproveCursorPermissions(input.permissionConfig)
            ? permissionRequest.approveResult
            : permissionRequest.denyResult,
        )
        return
      }

      if (method === 'cursor/ask_question') {
        const request = buildCursorAcpAskQuestionInputRequest(params)
        activeRpc.respond(
          id,
          request?.cancelResult ?? buildOneShotCancelledOutcome(),
        )
        return
      }

      if (method === 'cursor/create_plan') {
        const request = buildCursorAcpCreatePlanInputRequest(params)
        activeRpc.respond(
          id,
          request?.cancelResult ?? buildOneShotCancelledOutcome(),
        )
        return
      }

      const passiveNote = buildCursorAcpPassiveUpdateNote(method, params)
      if (passiveNote) {
        activeRpc.respond(
          id,
          buildCursorAcpPassiveUpdateAcknowledgement(method, params),
        )
        return
      }

      activeRpc.respondError(
        id,
        -32601,
        `Convergence does not support Cursor ACP server request "${method}" in one-shot mode`,
      )
    })

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString()
      stderr += text
      recordDebug({
        direction: 'in',
        channel: 'stderr',
        bytes: Buffer.byteLength(text),
      })
    })

    child.once('error', (error) => {
      fail(error)
    })

    child.once('exit', (code, signal) => {
      if (settled) return
      rpc?.destroy('Cursor ACP process exited')
      rpc = null
      fail(
        new Error(
          `cursor oneShot exited before completion: code=${
            code ?? 'null'
          } signal=${signal ?? 'null'} stderr=${stderr.trim() || 'no stderr'}`,
        ),
      )
    })

    void (async () => {
      const activeRpc = rpc
      if (!activeRpc) return

      await performCursorAcpHandshake(activeRpc, {
        appVersion,
        onDebugNote: (note) =>
          recordDebug({ direction: 'in', channel: 'lifecycle', note }),
      })

      const sessionResult = await activeRpc.request(
        'session/new',
        buildCursorAcpSessionParams(input.workingDirectory),
      )
      const cursorSessionId = readCursorAcpSessionId(sessionResult)
      if (!cursorSessionId) {
        throw new Error('Cursor ACP session/new did not return a sessionId')
      }

      const requestedModel = input.modelId.trim()
      const currentModel = getCursorAcpCurrentModelId(sessionResult)
      if (requestedModel && requestedModel !== currentModel) {
        await activeRpc.request('session/set_config_option', {
          sessionId: cursorSessionId,
          configId: CURSOR_ACP_MODEL_CONFIG_ID,
          value: requestedModel,
        })
      }

      const promptResult = await activeRpc.request(
        'session/prompt',
        {
          sessionId: cursorSessionId,
          prompt: buildCursorAcpPrompt({ text: input.prompt }),
        },
        { timeoutMs: 0 },
      )
      const resultText = readCursorAcpUpdateText(promptResult)
      if (!assistantText && resultText) assistantText = resultText

      finish({ text: assistantText.trim() })
    })().catch(fail)
  })
}

export class CursorProvider implements Provider {
  id = CURSOR_PROVIDER_ID
  name = 'Cursor'
  supportsContinuation = true
  /** Only ever a descriptor that came from a probe that succeeded (R3). */
  private descriptorPromise: Promise<ProviderDescriptor> | null = null
  private descriptorProbe: Promise<ProviderDescriptor> | null = null
  private descriptorFailedAt: number | null = null

  /**
   * The default skills service is built in the body, not as a parameter
   * default, because it needs `options.appVersion` — a later parameter, which a
   * default expression cannot see. Building it here is what keeps the fourth
   * handshake path from introducing the app as `0.0.0` (MAR-3145 R4).
   */
  private skillsService: CursorSkillCatalogAdapter

  constructor(
    private binaryPath: string,
    private debugSink: ProviderDebugSink = noopDebugSink,
    skillsService?: CursorSkillCatalogAdapter,
    private options: CursorProviderOptions = {},
  ) {
    this.skillsService =
      skillsService ??
      new CursorSkillsService(binaryPath, undefined, {
        appVersion: options.appVersion ?? null,
      })
  }

  /**
   * The model list, probed from a disposable ACP session. A probe that fails
   * (CLI updating, a slow start, logged out) yields the one-model fallback for
   * this call only: the fallback is never cached, the failure is said once in
   * the debug log, and the next call past the retry floor probes again
   * (MAR-3145 R3).
   */
  describe(): Promise<ProviderDescriptor> {
    if (this.descriptorPromise) return this.descriptorPromise
    if (this.descriptorProbe) return this.descriptorProbe

    if (
      this.descriptorFailedAt !== null &&
      Date.now() - this.descriptorFailedAt < CURSOR_DESCRIPTOR_RETRY_FLOOR_MS
    ) {
      return Promise.resolve(buildFallbackCursorDescriptor())
    }

    const probe = fetchCursorAcpDescriptor(this.binaryPath, undefined, {
      appVersion: this.options.appVersion ?? null,
      client: this.options.descriptorClient,
    }).then(
      (descriptor) => {
        this.descriptorFailedAt = null
        this.descriptorPromise = Promise.resolve(descriptor)
        return descriptor
      },
      (error: unknown) => {
        this.descriptorFailedAt = Date.now()
        this.recordDescriptorProbeFailure(error)
        return buildFallbackCursorDescriptor()
      },
    )

    this.descriptorProbe = probe
    void probe.finally(() => {
      if (this.descriptorProbe === probe) this.descriptorProbe = null
    })

    return probe
  }

  /** One line per failed probe — the bare catch this replaced said nothing. */
  private recordDescriptorProbeFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.debugSink.record({
      sessionId: CURSOR_DESCRIPTOR_DEBUG_SESSION_ID,
      providerId: CURSOR_PROVIDER_ID,
      at: Date.now(),
      direction: 'in',
      channel: 'lifecycle',
      note: `Cursor model discovery failed: ${message}. Showing the fallback model list; the next request after ${Math.round(
        CURSOR_DESCRIPTOR_RETRY_FLOOR_MS / 1000,
      )}s probes again.`,
    })
  }

  oneShot(input: OneShotInput): Promise<OneShotResult> {
    return runCursorAcpOneShot(
      this.binaryPath,
      input,
      this.debugSink,
      this.options.appVersion ?? null,
    )
  }

  start(config: SessionStartConfig): SessionHandle {
    const binaryPath = this.binaryPath
    const debugSink = this.debugSink
    const thisProviderSkillsService = this.skillsService
    const providerOptions = this.options
    const appVersion = this.options.appVersion ?? null
    const listeners = {
      delta: [] as ((delta: SessionDelta) => void)[],
      status: [] as ((status: SessionStatus) => void)[],
      attention: [] as ((attention: AttentionState) => void)[],
      continuationToken: [] as ((token: string) => void)[],
      contextWindow: [] as ((contextWindow: SessionContextWindow) => void)[],
      activity: [] as ((activity: ActivitySignal) => void)[],
      heartbeat: [] as (() => void)[],
    }

    const sessionEmitter = new ProviderSessionEmitter({
      providerId: CURSOR_PROVIDER_ID,
      emitDelta,
      now,
    })

    let child: ChildProcess | null = null
    let rpc: CursorAcpJsonRpcClient | null = null
    let stopped = false
    let status: SessionStatus = 'idle'
    let attention: AttentionState = 'none'
    let cursorSessionId: string | null = config.continuationToken
    let assistantTextBuffer = ''
    let assistantMessageItemId: string | null = null
    let thinkingBuffer = ''
    let thinkingItemId: string | null = null
    let suppressReplayUpdates = false
    /**
     * The ACP process is resident (MAR-3142 R1): it survives a completed turn,
     * so the connection gate is re-armed per spawn rather than created once.
     */
    let resolveReady: (() => void) | null = null
    let readyPromise: Promise<void> = Promise.resolve()
    /** The start's own turn, between `start()` and its timer (MAR-3216). */
    let startScheduled = true
    /** A spawn whose initialize, authenticate and session open have not settled. */
    let connecting = false
    /** A `/clear` under way (MAR-3216). */
    let resetting = false
    let initialMessageDelivered = false
    /** A `session/prompt` has been issued and has not settled yet. */
    let promptInFlight = false
    /** A prompt run has begun, including the writes and reads before the send. */
    let promptStarting = false
    /** The user asked for this turn to be cancelled, so it ends stopped. */
    let interruptRequested = false
    /**
     * Latest `available_commands_update` params from the live ACP session
     * (MAR-3240). Replaced by each newer update; cleared when the process or
     * session is replaced so a respawn or `/clear` starts empty.
     */
    let liveCommandCatalogPayload: unknown | null = null
    let liveTodos: CursorAcpTodo[] = []

    /** Resets everything the live session remembers: catalog and todos (MAR-3241 R3). */
    function clearLiveSessionState(): void {
      liveCommandCatalogPayload = null
      liveTodos = []
    }

    function armReadyGate(): void {
      readyPromise = new Promise<void>((resolve) => {
        resolveReady = resolve
      })
    }

    armReadyGate()

    const pendingApprovals = new Map<
      CursorAcpJsonRpcId,
      PendingCursorApproval
    >()
    const pendingInteractions = new Map<
      CursorAcpJsonRpcId,
      PendingCursorInteraction
    >()
    const toolCallItems = new Map<
      string,
      {
        itemId: string
        title: string
      }
    >()
    /** Unknown sessionUpdate kinds already logged once (R3). */
    const debuggedUnknownKinds = new Set<string>()

    /**
     * Acceptance is a property of the turn (MAR-3143 / MAR-3023): true from the
     * moment `session/prompt` has been issued until `endTurn` — never from the
     * user-message write that precedes the send.
     */
    let turnAccepted = false

    /**
     * The stream boundary that knows acceptance. A refused local write of an
     * accepted turn is announced and the run continues; before acceptance the
     * throw is the honest failed send.
     */
    function emitDelta(delta: SessionDelta): void {
      try {
        listeners.delta.forEach((cb) => cb(delta))
      } catch (error) {
        if (!(error instanceof RecordingError) || !turnAccepted) throw error
        error.announce()
      }
    }

    /**
     * Shared answer-and-clear for every approval and interaction that a turn
     * left open (MAR-3154 R1). stop, interrupt, and endTurn share this so a
     * fourth site cannot forget. A throw must surface to interrupt's existing
     * try and must never escape endTurn.
     */
    function cancelOpenRequests(
      activeRpc: CursorAcpJsonRpcClient | null,
    ): void {
      if (activeRpc) {
        for (const [id, approval] of pendingApprovals.entries()) {
          activeRpc.respond(id, approval.cancelResult)
        }
        for (const [id, interaction] of pendingInteractions.entries()) {
          activeRpc.respond(id, interaction.cancelResult)
        }
      }
      pendingApprovals.clear()
      pendingInteractions.clear()
    }

    /**
     * Ends the turn and its acceptance together. With `closingWrites`, the
     * turn's own closing record still runs inside acceptance; without it,
     * acceptance ends at once and later writes are teardown reports.
     */
    function endTurn(closingWrites?: () => void): void {
      if (!closingWrites) {
        turnAccepted = false
        try {
          cancelOpenRequests(rpc)
        } catch {
          // Never throw out of endTurn (MAR-3154 R1).
        }
        return
      }
      try {
        closingWrites()
      } finally {
        turnAccepted = false
        try {
          cancelOpenRequests(rpc)
        } catch {
          // Never throw out of endTurn.
        }
      }
    }

    /**
     * A write that is no accepted turn's recording and must never throw: a
     * teardown record or a report about a turn that did not complete.
     */
    function recordTeardown(label: string, write: () => void): void {
      try {
        write()
      } catch (error) {
        console.error(`[cursor] Could not record ${label}`, error)
      }
    }

    /**
     * A local write that must not decide whether Cursor is answered or a
     * pending approval is registered (MAR-3143 lap 2, A). Inside acceptance
     * `emitDelta` announces; outside it, the recorder logs and never throws.
     */
    function recordTurnWrite(label: string, write: () => void): void {
      if (turnAccepted) {
        write()
        return
      }
      recordTeardown(label, write)
    }

    function recordFailedTurnState(): void {
      recordTeardown('the failed status', () => setStatus('failed'))
      recordTeardown('the failed attention', () => setAttention('failed'))
    }

    /**
     * One function the two passive-update sites share for `cursor/update_todos`
     * (MAR-3241 R3 grounding override). Applies the reducer, renders the full
     * list with changed items marked, records the note, and updates liveTodos.
     */
    function recordCursorTodoUpdate(
      params: unknown,
      rpcId?: CursorAcpJsonRpcId,
    ): void {
      const updatedTodos = applyCursorTodoUpdate(
        liveTodos,
        params as CursorAcpTodoUpdateParams,
      )
      const note = buildCursorAcpPassiveUpdateNote(
        'cursor/update_todos',
        params,
        updatedTodos,
        liveTodos,
      )
      liveTodos = updatedTodos
      if (note) {
        recordTurnWrite('the flushed assistant buffer', () =>
          flushAssistantBuffer(),
        )
        recordTurnWrite('the flushed thinking buffer', () =>
          flushThinkingBuffer(),
        )
        recordTurnWrite('the passive update note', () =>
          sessionEmitter.addNote({
            text: note.text,
            level: note.level,
            providerItemId:
              note.providerItemId ??
              (rpcId !== undefined ? String(rpcId) : null),
            providerEventType: 'cursor/update_todos',
          }),
        )
      }
    }

    function fireHeartbeat(): void {
      listeners.heartbeat.forEach((cb) => cb())
    }

    function recordDebug(entry: {
      direction: 'in' | 'out'
      channel: ProviderDebugChannel
      method?: string
      payload?: unknown
      bytes?: number
      note?: string
    }): void {
      const debugEntry = {
        sessionId: config.sessionId,
        providerId: CURSOR_PROVIDER_ID,
        at: Date.now(),
        ...entry,
      }
      debugSink.record(debugEntry)
      fireHeartbeat()
    }

    const recordTransportDebug = (entry: Parameters<typeof recordDebug>[0]) => {
      recordDebug(entry)
    }

    function setStatus(nextStatus: SessionStatus): void {
      status = nextStatus
      listeners.status.forEach((cb) => cb(nextStatus))
      sessionEmitter.patchSession({ status: nextStatus })
    }

    function setAttention(nextAttention: AttentionState): void {
      attention = nextAttention
      listeners.attention.forEach((cb) => cb(nextAttention))
      sessionEmitter.patchSession({ attention: nextAttention })
    }

    function setActivity(activity: ActivitySignal): void {
      listeners.activity.forEach((cb) => cb(activity))
      sessionEmitter.patchSession({ activity })
    }

    function setContextWindow(contextWindow: SessionContextWindow): void {
      listeners.contextWindow.forEach((cb) => cb(contextWindow))
      sessionEmitter.patchSession({ contextWindow })
    }

    function setContinuationToken(token: string): void {
      if (cursorSessionId === token) return
      cursorSessionId = token
      listeners.continuationToken.forEach((cb) => cb(token))
      sessionEmitter.patchSession({ continuationToken: token })
    }

    function flushAssistantBuffer(): void {
      if (!assistantTextBuffer) return
      const timestamp = now()
      if (assistantMessageItemId) {
        sessionEmitter.patchMessage(assistantMessageItemId, {
          text: assistantTextBuffer,
          state: 'complete',
          updatedAt: timestamp,
        })
      } else {
        sessionEmitter.addAssistantMessage({
          text: assistantTextBuffer,
          state: 'complete',
          timestamp,
          providerEventType: 'agent_message_chunk',
        })
      }
      assistantTextBuffer = ''
      assistantMessageItemId = null
    }

    /**
     * The turn's last assistant segment, taken out of the buffer when it is a
     * dead turn's line (MAR-3302 R2); null otherwise, and the buffer is left
     * for the ordinary flush.
     *
     * The buffer holds exactly the text after the turn's last other output:
     * a tool call, a plan and a todo note each flush it before they are
     * recorded. So text still in the buffer at settle had nothing after it,
     * and that is the "no tool call after it" half of the rule.
     */
    function takeDeadTurnSegment(): {
      text: string
      itemId: string | null
    } | null {
      if (!isDeadTurnText(assistantTextBuffer)) return null
      const segment = {
        text: assistantTextBuffer,
        itemId: assistantMessageItemId,
      }
      assistantTextBuffer = ''
      assistantMessageItemId = null
      return segment
    }

    /**
     * The dead turn's line stops being a reply (MAR-3302 R2). The streamed
     * assistant item is rewritten in place as a warning note: the record's
     * item patch rewrites `kind` and payload, and the renderer upserts by id.
     * So the transcript keeps the line where it arrived, and no assistant
     * message with that text is left for "the last assistant message" to
     * find. `actor` is cleared so the note carries no message field. With no
     * streamed item, the note is simply added.
     */
    function recordDeadTurnNote(segment: {
      text: string
      itemId: string | null
    }): void {
      const text = formatCursorDeadTurnNote(segment.text)
      if (!segment.itemId) {
        sessionEmitter.addNote({
          text,
          level: 'warning',
          providerEventType: 'cursor-dead-turn',
        })
        return
      }
      // One patch across two kinds: the note's fields written, the message's
      // one field of its own cleared.
      const patch: Partial<ConversationItem> & { actor?: undefined } = {
        kind: 'note',
        state: 'complete',
        level: 'warning',
        text,
        actor: undefined,
        providerMeta: {
          providerId: CURSOR_PROVIDER_ID,
          providerItemId: null,
          providerEventType: 'cursor-dead-turn',
        },
        updatedAt: now(),
      }
      emitDelta({
        kind: 'conversation.item.patch',
        itemId: segment.itemId,
        patch,
      })
    }

    function appendAssistantText(text: string): void {
      if (!text) return
      assistantTextBuffer += text
      if (!assistantMessageItemId) {
        assistantMessageItemId = sessionEmitter.addAssistantMessage({
          text: assistantTextBuffer,
          state: 'streaming',
          providerEventType: 'agent_message_chunk',
        })
      } else {
        sessionEmitter.patchMessage(assistantMessageItemId, {
          text: assistantTextBuffer,
          state: 'streaming',
        })
      }
    }

    function flushThinkingBuffer(): void {
      if (!thinkingBuffer) return
      const timestamp = now()
      if (thinkingItemId) {
        sessionEmitter.patchThinking(thinkingItemId, {
          text: thinkingBuffer,
          state: 'complete',
          updatedAt: timestamp,
        })
      } else {
        sessionEmitter.addThinking({
          text: thinkingBuffer,
          state: 'complete',
          timestamp,
          providerEventType: 'agent_thought_chunk',
        })
      }
      thinkingBuffer = ''
      thinkingItemId = null
    }

    function appendThinkingText(text: string): void {
      if (!text) return
      thinkingBuffer += text
      if (!thinkingItemId) {
        thinkingItemId = sessionEmitter.addThinking({
          text: thinkingBuffer,
          state: 'streaming',
          providerEventType: 'agent_thought_chunk',
        })
      } else {
        sessionEmitter.patchThinking(thinkingItemId, {
          text: thinkingBuffer,
          state: 'streaming',
        })
      }
    }

    /** One debug entry per session for an update kind this adapter cannot read. */
    function recordUnknownUpdateKindOnce(updateType: string): void {
      if (debuggedUnknownKinds.has(updateType)) return
      debuggedUnknownKinds.add(updateType)
      recordDebug({
        direction: 'in',
        channel: 'notification',
        method: `sessionUpdate:${updateType}`,
        note: `Unknown session update kind: ${updateType}`,
      })
    }

    function handleSessionUpdate(params: unknown): void {
      if (suppressReplayUpdates) return

      const updateType = getCursorAcpSessionUpdateType(params)
      switch (updateType) {
        case 'agent_message_chunk': {
          const text = readCursorAcpUpdateText(params)
          if (text) {
            appendAssistantText(text)
            setActivity('streaming')
          }
          break
        }
        case 'agent_thought_chunk': {
          const text = readCursorAcpUpdateText(params)
          if (text) {
            appendThinkingText(text)
            setActivity('thinking')
          }
          break
        }
        case 'tool_call': {
          flushAssistantBuffer()
          flushThinkingBuffer()
          const tool = buildCursorAcpToolView(params)
          const itemId = sessionEmitter.addToolCall({
            toolName: tool.title,
            inputText: tool.inputText || tool.status || 'Started',
            providerItemId: tool.toolCallId,
            providerEventType: updateType,
          })
          if (tool.toolCallId) {
            toolCallItems.set(tool.toolCallId, {
              itemId,
              title: tool.title,
            })
          }
          setActivity(`tool:${tool.title}`)
          break
        }
        case 'tool_call_update': {
          const tool = buildCursorAcpToolView(params)
          const related = tool.toolCallId
            ? toolCallItems.get(tool.toolCallId)
            : null
          if (
            tool.status === 'completed' ||
            tool.status === 'failed' ||
            tool.status === 'error' ||
            tool.status === 'cancelled'
          ) {
            sessionEmitter.addToolResult({
              outputText: tool.outputText,
              toolName: related?.title ?? tool.title,
              relatedItemId: related?.itemId ?? null,
              state: tool.state,
              providerItemId: tool.toolCallId,
              providerEventType: updateType,
            })
            if (tool.toolCallId) toolCallItems.delete(tool.toolCallId)
            setActivity(null)
          } else if (tool.status) {
            setActivity(`tool:${related?.title ?? tool.title}`)
          }
          break
        }
        case 'available_commands_update':
          liveCommandCatalogPayload = params
          recordDebug({
            direction: 'in',
            channel: 'notification',
            method: updateType,
            payload: summarizeCursorCommandCatalogUpdate(params),
            note: 'Cursor available command catalog update',
          })
          break
        case 'session_info_update':
        case 'current_mode_update':
        case 'current_model_update':
        case 'user_message_chunk':
          break
        default: {
          if (updateType === 'plan') {
            const planText = formatCursorPlanUpdate(params)
            if (planText) {
              flushAssistantBuffer()
              flushThinkingBuffer()
              sessionEmitter.addThinking({
                text: planText,
                providerEventType: updateType,
              })
            } else {
              recordUnknownUpdateKindOnce(updateType)
              const rawText = readCursorAcpContentText(
                getCursorAcpSessionUpdate(params),
              )
              if (rawText) {
                flushAssistantBuffer()
                flushThinkingBuffer()
                sessionEmitter.addThinking({
                  text: rawText,
                  providerEventType: updateType,
                })
              }
            }
          } else if (updateType) {
            recordUnknownUpdateKindOnce(updateType)
          }
        }
      }
    }

    function handleServerRequest(
      method: string,
      params: unknown,
      id: CursorAcpJsonRpcId,
      activeRpc: CursorAcpJsonRpcClient,
    ): void {
      if (method === 'session/request_permission') {
        const permissionRequest = buildCursorAcpPermissionRequest(params)
        if (shouldAutoApproveCursorPermissions(config.permissionConfig)) {
          activeRpc.respond(id, permissionRequest.approveResult)
          recordTurnWrite('the auto-approved permission note', () =>
            sessionEmitter.addNote({
              text: `Auto-approved Cursor permission request:\n\n${permissionRequest.description}`,
              level: 'info',
              providerItemId: String(id),
              providerEventType: method,
            }),
          )
          return
        }

        // Register first so a refused local write cannot leave Cursor blocked
        // with no pending approval to approve or deny (MAR-3143 lap 2, A).
        recordTurnWrite('the flushed assistant buffer', () =>
          flushAssistantBuffer(),
        )
        recordTurnWrite('the flushed thinking buffer', () =>
          flushThinkingBuffer(),
        )
        const pending: PendingCursorApproval = {
          ...permissionRequest,
          providerApprovalItemId: String(id),
        }
        pendingApprovals.set(id, pending)
        recordTurnWrite('the approval attention', () =>
          setAttention('needs-approval'),
        )
        recordTurnWrite('the approval request', () => {
          pending.providerApprovalItemId = sessionEmitter.addApprovalRequest({
            description: permissionRequest.description,
            providerItemId: String(id),
            providerEventType: method,
          })
        })
        return
      }

      if (method === 'cursor/ask_question') {
        const request = buildCursorAcpAskQuestionInputRequest(params)
        if (!request) {
          activeRpc.respond(id, {
            outcome: {
              outcome: 'skipped',
              reason: 'Malformed Cursor ask-question request',
            },
          })
          recordTurnWrite('the malformed ask-question note', () =>
            sessionEmitter.addNote({
              text: 'Skipped malformed Cursor ask-question request',
              level: 'warning',
              providerItemId: String(id),
              providerEventType: method,
            }),
          )
          return
        }

        recordTurnWrite('the flushed assistant buffer', () =>
          flushAssistantBuffer(),
        )
        recordTurnWrite('the flushed thinking buffer', () =>
          flushThinkingBuffer(),
        )
        const pending: PendingCursorInteraction = {
          ...request,
          providerInputItemId: String(id),
        }
        pendingInteractions.set(id, pending)
        recordTurnWrite('the input attention', () =>
          setAttention('needs-input'),
        )
        recordTurnWrite('the cleared activity', () => setActivity(null))
        recordTurnWrite('the ask-question request', () => {
          pending.providerInputItemId = sessionEmitter.addInputRequest({
            prompt: request.prompt,
            request: request.request,
            providerItemId: String(id),
            providerEventType: method,
          })
        })
        return
      }

      if (method === 'cursor/create_plan') {
        const request = buildCursorAcpCreatePlanInputRequest(params)
        if (!request) {
          activeRpc.respond(id, {
            outcome: {
              outcome: 'rejected',
              reason: 'Malformed Cursor create-plan request',
            },
          })
          recordTurnWrite('the malformed create-plan note', () =>
            sessionEmitter.addNote({
              text: 'Rejected malformed Cursor create-plan request',
              level: 'warning',
              providerItemId: String(id),
              providerEventType: method,
            }),
          )
          return
        }

        recordTurnWrite('the flushed assistant buffer', () =>
          flushAssistantBuffer(),
        )
        recordTurnWrite('the flushed thinking buffer', () =>
          flushThinkingBuffer(),
        )
        const pending: PendingCursorInteraction = {
          ...request,
          providerInputItemId: String(id),
        }
        pendingInteractions.set(id, pending)
        recordTurnWrite('the input attention', () =>
          setAttention('needs-input'),
        )
        recordTurnWrite('the cleared activity', () => setActivity(null))
        recordTurnWrite('the create-plan request', () => {
          pending.providerInputItemId = sessionEmitter.addInputRequest({
            prompt: request.prompt,
            request: request.request,
            providerItemId: String(id),
            providerEventType: method,
          })
        })
        return
      }

      if (method === 'cursor/update_todos') {
        // Answer first — R4: byte-for-byte acknowledgement before the note.
        activeRpc.respond(
          id,
          buildCursorAcpPassiveUpdateAcknowledgement(method, params),
        )
        recordCursorTodoUpdate(params, id)
        return
      }

      const passiveNote = buildCursorAcpPassiveUpdateNote(method, params)
      if (passiveNote) {
        // Answer first — a refused note must not leave Cursor waiting
        // (MAR-3143 lap 2, A).
        activeRpc.respond(
          id,
          buildCursorAcpPassiveUpdateAcknowledgement(method, params),
        )
        recordTurnWrite('the flushed assistant buffer', () =>
          flushAssistantBuffer(),
        )
        recordTurnWrite('the flushed thinking buffer', () =>
          flushThinkingBuffer(),
        )
        recordTurnWrite('the passive update note', () =>
          sessionEmitter.addNote({
            text: passiveNote.text,
            level: passiveNote.level,
            providerItemId: passiveNote.providerItemId ?? String(id),
            providerEventType: method,
          }),
        )
        return
      }

      activeRpc.respondError(
        id,
        -32601,
        `Convergence does not support Cursor ACP server request "${method}" yet`,
      )
      recordTurnWrite('the unsupported request note', () =>
        sessionEmitter.addNote({
          text: `Unsupported Cursor ACP server request: ${method}`,
          level: 'error',
          providerEventType: method,
        }),
      )
    }

    async function resolveSelectedSkills(
      text: string,
      selections: SkillSelection[] | undefined,
    ): Promise<NativeSkillInvocationResolution> {
      if (!selections || selections.length === 0) {
        return {
          ok: true,
          commandText: '',
          promptText: text,
        }
      }

      try {
        if (liveCommandCatalogPayload != null) {
          const liveCatalog = mapCursorCommandCatalog(liveCommandCatalogPayload)
          const knownIds = new Set(liveCatalog.skills.map((skill) => skill.id))
          const allKnown = selections.every((selection) =>
            knownIds.has(selection.id),
          )
          if (allKnown) {
            return resolveNativeSkillInvocation({
              providerId: 'cursor',
              providerName: 'Cursor',
              catalog: liveCatalog,
              selections,
              syntax: 'plain-slash',
              text,
            })
          }
        }

        const catalog = await thisProviderSkillsService.list(
          config.workingDirectory,
        )
        return resolveNativeSkillInvocation({
          providerId: 'cursor',
          providerName: 'Cursor',
          catalog,
          selections,
          syntax: 'plain-slash',
          text,
        })
      } catch (err) {
        return failedNativeSkillInvocation({
          providerName: 'Cursor',
          selections,
          error: err,
        })
      }
    }

    function addSkillInvocationFailureNote(
      resolution: Extract<NativeSkillInvocationResolution, { ok: false }>,
    ): void {
      sessionEmitter.addNote({
        text: `Cursor command ${resolution.status}: ${resolution.message}`,
        level: 'error',
      })
    }

    function patchUserMessageSkills(
      userMessageItemId: string,
      selections: SkillSelection[] | undefined,
      status: Parameters<typeof markSkillSelectionsStatus>[1],
    ): void {
      const updatedSelections = markSkillSelectionsStatus(selections, status)
      if (!updatedSelections) {
        return
      }

      sessionEmitter.patchMessage(userMessageItemId, {
        skillSelections: updatedSelections,
      })
    }

    async function sendPrompt(
      text: string,
      attachments?: Attachment[],
      deliveryMode?: MidRunInputMode,
      skillSelections?: SkillSelection[],
    ): Promise<void> {
      reconnectIfIdleProcessDied()
      await readyPromise
      if (stopped) return
      if (interruptRequested) {
        settleInterruptedWithoutSend({
          text,
          attachments,
          deliveryMode,
          skillSelections,
        })
        return
      }
      const activeRpc = rpc
      const activeSessionId = cursorSessionId
      if (!activeRpc || !activeSessionId) {
        recordTeardown('the disconnected user message', () =>
          sessionEmitter.addUserMessage({
            providerAccountId: null,
            text,
            attachmentIds: attachments?.length
              ? attachments.map((attachment) => attachment.id)
              : undefined,
            deliveryMode:
              deliveryMode === 'follow-up' || deliveryMode === 'steer'
                ? deliveryMode
                : undefined,
          }),
        )
        recordTeardown('the disconnected note', () =>
          sessionEmitter.addNote({
            text: 'Cursor is no longer connected, so this message was not sent.',
            level: 'error',
          }),
        )
        recordFailedTurnState()
        recordTeardown('the cleared activity', () => setActivity(null))
        return
      }

      const skillResolution = await resolveSelectedSkills(text, skillSelections)
      if (stopped) return
      if (interruptRequested) {
        settleInterruptedWithoutSend({
          text,
          attachments,
          deliveryMode,
          skillSelections: skillResolution.skillSelections,
        })
        return
      }

      const userMessageItemId = sessionEmitter.addUserMessage({
        providerAccountId: null,
        text,
        skillSelections: skillResolution.skillSelections,
        attachmentIds: attachments?.length
          ? attachments.map((attachment) => attachment.id)
          : undefined,
        deliveryMode:
          deliveryMode === 'follow-up' || deliveryMode === 'steer'
            ? deliveryMode
            : undefined,
      })
      setStatus('running')
      setAttention('none')
      setActivity('streaming')

      if (!skillResolution.ok) {
        recordTeardown('the skill failure note', () =>
          addSkillInvocationFailureNote(skillResolution),
        )
        recordFailedTurnState()
        recordTeardown('the cleared activity', () => setActivity(null))
        return
      }

      try {
        const parts = await loadCursorParts(attachments)
        if (stopped) return
        if (interruptRequested) {
          // User message already written — only the settle note (lap 3, A2).
          settleInterruptedWithoutSend()
          return
        }
        promptInFlight = true
        const promptPromise = activeRpc.request(
          'session/prompt',
          {
            sessionId: activeSessionId,
            prompt: buildCursorAcpPrompt({
              text: skillResolution.promptText,
              parts,
            }),
          },
          {
            // A turn has no wall-clock limit, only a progress one: every
            // session/update re-arms the budget (MAR-3142 R4).
            silenceBudgetMs: CURSOR_ACP_PROMPT_SILENCE_BUDGET_MS,
            onSilenceExpired: () =>
              activeRpc.notify('session/cancel', {
                sessionId: activeSessionId,
              }),
          },
        )
        // Acceptance begins where the CLI takes the send (R1), not at the
        // user-message write above.
        turnAccepted = true
        const result = (await promptPromise) as {
          stopReason?: unknown
        } | null

        patchUserMessageSkills(
          userMessageItemId,
          skillResolution.skillSelections,
          'sent',
        )

        flushThinkingBuffer()
        // Taken before the flush, which would record the line as a finished
        // reply (MAR-3302 R2).
        const deadTurnSegment = takeDeadTurnSegment()
        flushAssistantBuffer()

        const stopReason = classifyCursorAcpStopReason(result)
        const stopReasonClass = stopReason.kind
        endTurn(() => {
          setActivity(null)
          if (deadTurnSegment) {
            // A turn whose last word is the CLI's own `Error: …` line died,
            // whatever its stopReason says (MAR-3302 R2): it settles failed on
            // the same path a rejected prompt takes, so the seat reads failed
            // and no return is carried.
            //
            // No retry here (R4). `RetriableError` means Cursor's client thinks
            // a retry is possible, but the turn may have half-acted (the lane
            // held eight modified files). The mastermind's continue baton is
            // the retry.
            recordDeadTurnNote(deadTurnSegment)
            recordFailedTurnState()
            return
          }
          if (stopReasonClass === 'cancelled') {
            // A cancelled turn is a finished turn, never a failed one: the
            // user stopped it and the process stays alive (MAR-3142 R2).
            // Clear interruptRequested *after* this callback so the service
            // still reads retainQueuedInputsOnCompletion while completed is
            // delivered (MAR-3142 lap 3, A1).
            sessionEmitter.addNote({
              text: 'stopped by user',
              level: 'info',
            })
            setStatus('completed')
            setAttention('finished')
            return
          }
          // cut-short, refused and unknown each say how the turn ended;
          // done says nothing. All four settle completed (MAR-3242 R2).
          const stopReasonNote = formatCursorAcpStopReasonNote(stopReason)
          if (stopReasonNote) {
            sessionEmitter.addNote({ text: stopReasonNote, level: 'warning' })
          }
          setStatus('completed')
          setAttention('finished')
        })
        // The flag is a property of one turn — clear it at every turn end so
        // a late Stop after end_turn cannot sticky-retain the app queue
        // (MAR-3142 lap 2, A). Must stay after endTurn so A1's pin holds.
        interruptRequested = false
      } catch (error) {
        patchUserMessageSkills(
          userMessageItemId,
          skillResolution.skillSelections,
          'failed',
        )
        throw error
      } finally {
        promptInFlight = false
      }
    }

    /**
     * Stop landed before `session/prompt` — completed, no send (lap 2, D).
     * When the user message has not been written yet, record it and note
     * "not sent — stopped by user" so typed text does not vanish (lap 3, D1).
     */
    function settleInterruptedWithoutSend(pendingMessage?: {
      text: string
      attachments?: Attachment[]
      deliveryMode?: MidRunInputMode
      skillSelections?: SkillSelection[]
    }): void {
      endTurn(() => {
        if (pendingMessage) {
          sessionEmitter.addUserMessage({
            providerAccountId: null,
            text: pendingMessage.text,
            skillSelections: pendingMessage.skillSelections,
            attachmentIds: pendingMessage.attachments?.length
              ? pendingMessage.attachments.map((attachment) => attachment.id)
              : undefined,
            deliveryMode:
              pendingMessage.deliveryMode === 'follow-up' ||
              pendingMessage.deliveryMode === 'steer'
                ? pendingMessage.deliveryMode
                : undefined,
          })
          sessionEmitter.addNote({
            text: 'not sent — stopped by user',
            level: 'info',
          })
        } else {
          sessionEmitter.addNote({
            text: 'stopped by user',
            level: 'info',
          })
        }
        setStatus('completed')
        interruptRequested = false
        setAttention('finished')
        setActivity(null)
      })
    }

    /**
     * Runs one turn without a queue of its own: the app owns follow-ups
     * (MAR-3142 R3), so a second send while this one is live is deferred by
     * `sendMessage` rather than chained here.
     */
    function runPrompt(
      text: string,
      attachments?: Attachment[],
      deliveryMode?: MidRunInputMode,
      skillSelections?: SkillSelection[],
    ): void {
      // Clear a sticky interrupt from a prior turn before this one starts
      // (MAR-3142 lap 2, A; Claude clears at turn start too).
      interruptRequested = false
      promptStarting = true
      void sendPrompt(text, attachments, deliveryMode, skillSelections)
        .catch(handlePromptFailure)
        .finally(() => {
          promptStarting = false
          promptInFlight = false
        })
    }

    function handlePromptFailure(error: unknown): void {
      if (stopped) return
      endTurn()
      interruptRequested = false
      recordTeardown('the flushed assistant buffer', () =>
        flushAssistantBuffer(),
      )
      recordTeardown('the flushed thinking buffer', () => flushThinkingBuffer())
      recordTeardown(
        error instanceof CursorAcpSilenceBudgetError
          ? 'the silence budget note'
          : 'the prompt failure note',
        () =>
          sessionEmitter.addNote({
            text:
              error instanceof CursorAcpSilenceBudgetError
                ? formatCursorAcpSilenceBudgetNote(error.budgetMs)
                : `Cursor prompt failed: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
            level: 'error',
          }),
      )
      recordFailedTurnState()
      recordTeardown('the cleared activity', () => setActivity(null))
    }

    async function applySessionConfig(sessionResult: unknown): Promise<void> {
      const activeRpc = rpc
      const sessionId = cursorSessionId
      if (!activeRpc || !sessionId) return

      const requestedModel = config.model?.trim() || null
      const currentModel = getCursorAcpCurrentModelId(sessionResult)
      setContextWindow(
        buildCursorUnavailableContextWindow(requestedModel ?? currentModel),
      )

      if (!requestedModel || requestedModel === currentModel) return

      recordDebug({
        direction: 'out',
        channel: 'request',
        method: 'session/set_config_option',
        payload: {
          sessionId,
          configId: CURSOR_ACP_MODEL_CONFIG_ID,
          value: requestedModel,
        },
        note: 'Apply Cursor model selection to the active ACP session',
      })
      await activeRpc.request('session/set_config_option', {
        sessionId,
        configId: CURSOR_ACP_MODEL_CONFIG_ID,
        value: requestedModel,
      })
    }

    async function startNewSession(
      activeRpc: CursorAcpJsonRpcClient,
    ): Promise<void> {
      clearLiveSessionState()
      const sessionResult = await activeRpc.request(
        'session/new',
        buildCursorAcpSessionParams(config.workingDirectory),
      )
      const discoveredSessionId = readCursorAcpSessionId(sessionResult)
      if (!discoveredSessionId) {
        throw new Error('Cursor ACP session/new did not return a sessionId')
      }
      setContinuationToken(discoveredSessionId)
      await applySessionConfig(sessionResult)
    }

    /**
     * Resumes the stored Cursor session, or starts a fresh one when the token
     * no longer names a session Cursor knows (MAR-3142 R5). Every other
     * `session/load` refusal is still an initialization failure.
     */
    async function loadStoredSession(
      activeRpc: CursorAcpJsonRpcClient,
      storedSessionId: string,
    ): Promise<void> {
      try {
        suppressReplayUpdates = true
        const sessionResult = await activeRpc.request('session/load', {
          sessionId: storedSessionId,
          ...buildCursorAcpSessionParams(config.workingDirectory),
        })
        suppressReplayUpdates = false
        await applySessionConfig(sessionResult)
      } catch (error) {
        suppressReplayUpdates = false
        if (!isMissingContinuationError(error, ['session', 'cursor'])) {
          throw error
        }
        await startNewSession(activeRpc)
        const recovery = buildContinuationRecoveryEntry('Cursor', now())
        recordTeardown('the continuation recovery note', () =>
          sessionEmitter.addNote({
            text: recovery.text,
            level: recovery.level,
            timestamp: recovery.timestamp,
          }),
        )
      }
    }

    /**
     * A `resume` start reports its own failure and never rejects. A `fresh`
     * start is a reset's (MAR-3216): it cleans up the same way but rejects, so
     * the reset says what went wrong once, in its own words.
     */
    async function initializeAndStart(
      opening: CursorSessionOpening,
    ): Promise<void> {
      const activeRpc = rpc
      if (!activeRpc || stopped) {
        connecting = false
        return
      }

      try {
        await performCursorAcpHandshake(activeRpc, {
          appVersion,
          onDebugNote: (note) =>
            recordDebug({ direction: 'in', channel: 'lifecycle', note }),
        })

        if (opening === 'fresh') {
          await startNewSession(activeRpc)
        } else if (cursorSessionId) {
          await loadStoredSession(activeRpc, cursorSessionId)
        } else {
          await startNewSession(activeRpc)
        }

        connecting = false
        resolveReady?.()
        // A respawn resumes the stored session; only the first start owes the
        // session its opening message (MAR-3142 R1).
        if (!initialMessageDelivered) {
          initialMessageDelivered = true
          runPrompt(
            config.initialMessage,
            config.initialAttachments,
            'normal',
            config.initialSkillSelections,
          )
        }
      } catch (error) {
        connecting = false
        if (stopped) return
        suppressReplayUpdates = false
        resolveReady?.()
        if (opening === 'resume') {
          recordTeardown('the initialization failure note', () =>
            sessionEmitter.addNote({
              text: `Cursor initialization failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
              level: 'error',
            }),
          )
          recordFailedTurnState()
          recordTeardown('the cleared activity', () => setActivity(null))
        }
        rpc?.destroy()
        rpc = null
        if (child && !child.killed) {
          child.kill('SIGTERM')
        }
        child = null
        if (opening === 'fresh') throw error
      }
    }

    /**
     * Brings the resident process back for the next send (MAR-3142 R1). A
     * process that died while the session sat idle left the stored session id
     * behind, so the respawn resumes it with `session/load`; a process that
     * died mid-turn already reported a failed turn and is not resurrected
     * behind the user's back.
     */
    function reconnectIfIdleProcessDied(): void {
      if (stopped || child || rpc) return
      // Before the start timer fires, the start itself spawns. After it, a
      // start that spawned nothing — a `/clear` with nothing to clear
      // (MAR-3216) — is brought up here like any idle respawn.
      if (startScheduled || status !== 'completed') return
      armReadyGate()
      void spawnCursor()
    }

    /**
     * Resolves when the spawn's start settles. Only a `fresh` opening can
     * reject; a `resume` start reports its own failures (see
     * `initializeAndStart`).
     */
    function spawnCursor(
      opening: CursorSessionOpening = 'resume',
    ): Promise<void> {
      if (stopped || child || rpc) return Promise.resolve()
      connecting = true
      clearLiveSessionState()

      child = spawn(binaryPath, ['acp'], {
        cwd: config.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      if (!child.stdin || !child.stdout) {
        connecting = false
        resolveReady?.()
        child.kill('SIGTERM')
        if (opening === 'fresh') {
          child = null
          return Promise.reject(new Error('Failed to open Cursor ACP stdio'))
        }
        recordTeardown('the stdio failure note', () =>
          sessionEmitter.addNote({
            text: 'Failed to open Cursor ACP stdio',
            level: 'error',
          }),
        )
        recordFailedTurnState()
        return Promise.resolve()
      }

      rpc = new CursorAcpJsonRpcClient(child.stdin, child.stdout, {
        requestTimeoutMs: providerOptions.requestTimeoutMs,
        onDebug: recordTransportDebug,
      })
      rpc.onNotification((method, params) => {
        if (stopped) return
        if (method === 'session/update') {
          handleSessionUpdate(params)
          return
        }

        if (method === 'cursor/update_todos') {
          recordCursorTodoUpdate(params)
          return
        }

        const passiveNote = buildCursorAcpPassiveUpdateNote(method, params)
        if (passiveNote) {
          // Same recorder as the request-side passive path (MAR-3152): bare
          // inside acceptance so emitDelta announces; labeled teardown outside.
          recordTurnWrite('the flushed assistant buffer', () =>
            flushAssistantBuffer(),
          )
          recordTurnWrite('the flushed thinking buffer', () =>
            flushThinkingBuffer(),
          )
          recordTurnWrite('the passive update note', () =>
            sessionEmitter.addNote({
              text: passiveNote.text,
              level: passiveNote.level,
              providerItemId: passiveNote.providerItemId,
              providerEventType: method,
            }),
          )
        }
      })
      rpc.onServerRequest((method, params, id, activeRpc) => {
        if (stopped) return
        handleServerRequest(method, params, id, activeRpc)
      })

      child.stderr?.on('data', (chunk: Buffer | string) => {
        recordDebug({
          direction: 'in',
          channel: 'stderr',
          bytes: Buffer.byteLength(chunk.toString()),
        })
      })
      child.once('error', (error) => {
        if (stopped) return
        resolveReady?.()
        endTurn()
        recordTeardown('the ACP error note', () =>
          sessionEmitter.addNote({
            text: `Cursor ACP failed: ${error.message}`,
            level: 'error',
          }),
        )
        recordFailedTurnState()
        recordTeardown('the cleared activity', () => setActivity(null))
      })
      child.once('exit', (code, signal) => {
        if (stopped) return
        resolveReady?.()
        clearLiveSessionState()
        rpc?.destroy('Cursor ACP process exited')
        rpc = null
        child = null
        if (status === 'completed' || attention === 'finished') return
        endTurn()
        recordTeardown('the exit note', () =>
          sessionEmitter.addNote({
            text: `Cursor ACP exited before the session finished: code=${
              code ?? 'null'
            } signal=${signal ?? 'null'}`,
            level: 'error',
          }),
        )
        recordFailedTurnState()
        recordTeardown('the cleared activity', () => setActivity(null))
      })

      return initializeAndStart(opening)
    }

    /** A turn is running, settling, or on its way in: a reset must wait. */
    function turnUnderWayOrArriving(): boolean {
      return (
        startScheduled ||
        connecting ||
        resetting ||
        promptStarting ||
        promptInFlight
      )
    }

    /**
     * A live, idle process opens the new session on its own connection, with
     * the same function a first start uses — so the model the session was
     * given is applied to the new session too (R6).
     */
    async function resetLiveSession(
      activeRpc: CursorAcpJsonRpcClient,
    ): Promise<CursorResetOutcome> {
      try {
        await startNewSession(activeRpc)
      } catch (error) {
        return { kind: 'failed', reason: describeCursorResetError(error) }
      }
      return { kind: 'restarted' }
    }

    /**
     * No live process: after an app restart, or after the idle process died.
     * The record keeps a token that a patch leaves blank, so a reset cannot
     * just drop it — it has to REPLACE it. Starts the process through the
     * new-session branch and sends no prompt; the old session is never
     * loaded. A conversation that never had a session has nothing to clear,
     * so nothing is opened and no boundary is written, as Codex's thread-less
     * reset (`codex-provider.ts`, `oldThreadId !== null`).
     */
    async function resetDormantSession(
      previousSessionId: string | null,
    ): Promise<CursorResetOutcome> {
      if (!previousSessionId) return { kind: 'nothing-to-clear' }
      if (child) {
        return {
          kind: 'failed',
          reason: 'the Cursor ACP process is still shutting down.',
        }
      }
      // Whatever the handle still owed its first start — a start whose
      // initialization failed never delivered it — the reset replaces it: the
      // fresh session opens with no prompt.
      initialMessageDelivered = true
      armReadyGate()
      try {
        await spawnCursor('fresh')
      } catch (error) {
        return { kind: 'failed', reason: describeCursorResetError(error) }
      }
      return { kind: 'restarted' }
    }

    /**
     * The reset's own work, and the whole life of the `resetting` window: it
     * opens here, synchronously, and closes the moment the work is over —
     * before the caller announces anything.
     *
     * A settlement status is the turn boundary the app's input queue drains
     * on, and it drains by calling `sendMessage` synchronously from the
     * status listener. A handle that still said "resetting" there answered
     * `'queue-follow-up'` and put the message back into a queue whose only
     * drain is the boundary that had just passed, so a relay's `/clear` ran
     * and its payload never arrived (MAR-3245). Keeping every announcement
     * outside this function is what makes that unreachable, rather than an
     * ordering rule inside one to remember.
     */
    async function runReset(
      previousSessionId: string | null,
    ): Promise<CursorResetOutcome> {
      resetting = true
      try {
        setStatus('running')
        setAttention('none')
        const activeRpc = rpc
        return activeRpc
          ? await resetLiveSession(activeRpc)
          : await resetDormantSession(previousSessionId)
      } finally {
        resetting = false
      }
    }

    /**
     * `/clear`: a command, never a prompt (MAR-3216). The same contract as
     * Codex's reset (`codex-provider.ts`, `sendCodexTurn`) and Pi's: no user
     * message, no `session/prompt`, one boundary on success and none
     * otherwise, a turn that settles `completed` or `failed`. The process
     * stays resident, so the next message prompts into the new session.
     */
    async function resetConversation(): Promise<void> {
      const previousSessionId = cursorSessionId
      const outcome = await runReset(previousSessionId)
      if (stopped) return
      if (outcome.kind === 'failed') {
        // `startNewSession` adopts the new id before it applies the model;
        // a reset that failed after that point must not leave the record
        // naming a session the conversation never moved into.
        if (previousSessionId && cursorSessionId !== previousSessionId) {
          setContinuationToken(previousSessionId)
        }
        sessionEmitter.addNote({
          text: `Could not clear the conversation: ${outcome.reason} The previous conversation is still active; your next message will resume it.`,
          level: 'error',
        })
        setStatus('failed')
        setAttention('failed')
        return
      }
      if (outcome.kind === 'restarted') {
        sessionEmitter.addNote({
          text: CONTEXT_RESTARTED_NOTE_TEXT,
          level: 'warning',
          providerEventType: SESSION_RESTARTED_EVENT_TYPE,
        })
      }
      setStatus('completed')
      setAttention('finished')
    }

    function handleResetFailure(error: unknown): void {
      if (stopped) return
      recordTeardown('the reset failure note', () =>
        sessionEmitter.addNote({
          text: `Could not clear the conversation: ${describeCursorResetError(error)}`,
          level: 'error',
        }),
      )
      recordFailedTurnState()
    }

    const startTimer = setTimeout(() => {
      startScheduled = false
      if (config.initialMessage === CONVERSATION_RESET_COMMAND) {
        // The reset IS the opening message: a later respawn owes it nothing.
        initialMessageDelivered = true
        void resetConversation().catch(handleResetFailure)
        return
      }
      void spawnCursor()
    }, 10)

    function disposeRuntime(): void {
      if (stopped) return
      endTurn()
      stopped = true
      promptInFlight = false
      promptStarting = false
      connecting = false
      interruptRequested = false
      clearLiveSessionState()
      resolveReady?.()
      clearTimeout(startTimer)
      pendingApprovals.clear()
      pendingInteractions.clear()
      toolCallItems.clear()
      rpc?.destroy()
      rpc = null
      assistantTextBuffer = ''
      thinkingBuffer = ''

      if (child && !child.killed) {
        const pending = child
        pending.kill('SIGTERM')
        const killTimer = setTimeout(() => {
          if (pending.exitCode === null && pending.signalCode === null) {
            pending.kill('SIGKILL')
          }
        }, 3000)
        killTimer.unref?.()
      }
      child = null
    }

    return {
      /** The ACP process and its session outlive a completed turn (R1). */
      resident: true,
      get retainQueuedInputsOnCompletion() {
        return interruptRequested
      },
      /**
       * Applies a model selection to the live ACP session and remembers it for
       * a respawn (MAR-3142 lap 2, C). Apply first, remember on success so a
       * refused option cannot stick on the handle (lap 3, C1a). Refuses while
       * a turn is starting or in flight — having this method must not open a
       * mid-turn switch the service would otherwise block (lap 3, C1b).
       */
      setModelSelection: async (model, effort) => {
        if (promptStarting || promptInFlight) {
          throw new Error(
            'Model and effort can only change while the session is idle. Wait for the current turn to finish.',
          )
        }
        const activeRpc = rpc
        const sessionId = cursorSessionId
        const requestedModel = model?.trim() || null
        if (activeRpc && sessionId && !stopped && requestedModel) {
          recordDebug({
            direction: 'out',
            channel: 'request',
            method: 'session/set_config_option',
            payload: {
              sessionId,
              configId: CURSOR_ACP_MODEL_CONFIG_ID,
              value: requestedModel,
            },
            note: 'Apply Cursor model selection to the active ACP session',
          })
          await activeRpc.request('session/set_config_option', {
            sessionId,
            configId: CURSOR_ACP_MODEL_CONFIG_ID,
            value: requestedModel,
          })
        }
        config.model = model
        config.effort = effort
      },
      /**
       * Cancels the turn without ending the process (R2): Cursor answers the
       * pending `session/prompt` with `stopReason: 'cancelled'`, which settles
       * the turn as stopped rather than failed. During `promptStarting` there
       * is nothing on the wire yet — the flag alone stops the send (lap 2, D).
       * With neither starting nor in-flight, the service falls back to `stop`.
       */
      interrupt: async () => {
        if (stopped) return 'not-applicable'
        // In-flight prompt first: `promptStarting` stays true until sendPrompt
        // settles, so checking it ahead of `promptInFlight` would skip cancel
        // for every live turn (MAR-3142 lap 2, D).
        if (promptInFlight) {
          const activeRpc = rpc
          const activeSessionId = cursorSessionId
          if (!activeRpc || !activeSessionId) return 'not-applicable'
          try {
            // Answer pending human requests first so Cursor is not left blocked
            // on an unanswered permission while we cancel (MAR-3142 lap 2, E;
            // lap 3, E1 — inside the try so a throw is a note, not hard-stop).
            cancelOpenRequests(activeRpc)
            activeRpc.notify('session/cancel', { sessionId: activeSessionId })
          } catch (error) {
            recordTeardown('the cancel failure note', () =>
              sessionEmitter.addNote({
                text: `Cursor cancel failed: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                level: 'error',
              }),
            )
            return 'not-applicable'
          }
          interruptRequested = true
          return 'interrupted'
        }
        if (promptStarting) {
          interruptRequested = true
          return 'interrupted'
        }
        return 'not-applicable'
      },
      onDelta: (callback) => {
        listeners.delta.push(callback)
      },
      onStatusChange: (callback) => {
        listeners.status.push(callback)
      },
      onAttentionChange: (callback) => {
        listeners.attention.push(callback)
      },
      onContinuationToken: (callback) => {
        listeners.continuationToken.push(callback)
        if (cursorSessionId) callback(cursorSessionId)
      },
      onContextWindowChange: (callback) => {
        listeners.contextWindow.push(callback)
      },
      onActivityChange: (callback) => {
        listeners.activity.push(callback)
      },
      onActivityHeartbeat: (callback) => {
        listeners.heartbeat.push(callback)
      },
      sendMessage: (text, attachments, skillSelections, options) => {
        if (stopped) return
        if (text === CONVERSATION_RESET_COMMAND) {
          if (turnUnderWayOrArriving()) {
            // Typed, as Codex's and Pi's are (MAR-2888): "not now" is a fact
            // about timing that a relay answers by queueing. Never a
            // `session/cancel` to make room — the running turn is the user's.
            throw new ProviderBusyError(
              'Wait for the current turn to finish before clearing the conversation.',
            )
          }
          void resetConversation().catch(handleResetFailure)
          return
        }
        // A message sent while the reset is under way would race it for the
        // session id; it belongs to the turn after the boundary, which the
        // app queue delivers when the reset settles (R3's deferral).
        if (resetting) return 'queue-follow-up'
        const pendingInteraction = findPendingInteraction(pendingInteractions)
        if (rpc && pendingInteraction && options?.deliveryMode === 'answer') {
          const [id, interaction] = pendingInteraction
          const interactionResponse = options.interactionResponse as
            | InteractionResponse
            | undefined
          rpc.respond(
            id,
            buildCursorAcpInteractionResponse(
              interaction.pending,
              interactionResponse,
              text,
            ),
          )
          pendingInteractions.delete(id)
          if (pendingInteractions.size === 0 && pendingApprovals.size === 0) {
            recordTeardown('the cleared attention', () => setAttention('none'))
          }
          return
        }
        // Cursor ACP takes one prompt per turn, so mid-turn text belongs to
        // the next one and the app holds it (R3). Only a live connection can
        // defer: once the process is gone the turn it was carrying is over,
        // and this send is an honest failed send rather than a follow-up
        // waiting for a turn boundary that will never arrive.
        if (rpc && (promptStarting || promptInFlight)) return 'queue-follow-up'
        runPrompt(text, attachments, options?.deliveryMode, skillSelections)
      },
      approve: (providerApprovalId) => {
        if (!rpc) return
        const pending = findPendingApproval(
          pendingApprovals,
          providerApprovalId,
        )
        if (!pending) return
        const [id, approval] = pending
        rpc.respond(id, approval.approveResult)
        pendingApprovals.delete(id)
        if (pendingApprovals.size === 0) {
          // Not dead insurance: no approval outlives its turn (MAR-3154), but
          // one can be born outside a turn (a permission request before any
          // prompt), and outside acceptance a refused write throws. Same in
          // deny (MAR-3247 R4).
          recordTeardown('the cleared attention', () => setAttention('none'))
        }
      },
      deny: (providerApprovalId) => {
        if (!rpc) return
        const pending = findPendingApproval(
          pendingApprovals,
          providerApprovalId,
        )
        if (!pending) return
        const [id, approval] = pending
        rpc.respond(id, approval.denyResult)
        pendingApprovals.delete(id)
        if (pendingApprovals.size === 0) {
          recordTeardown('the cleared attention', () => setAttention('none'))
        }
      },
      dispose: disposeRuntime,
      /**
       * The hard stop (R2). With no prompt in flight there is no turn to fail:
       * the process is released and the session keeps the state its last turn
       * left. With a prompt still in flight this is the fallback the service
       * takes when `interrupt` could not be used, so the turn dies with the
       * process and is reported failed.
       */
      stop: () => {
        if (stopped) return
        const hadPromptInFlight = promptInFlight || promptStarting
        cancelOpenRequests(rpc)
        // End acceptance first so a refused flush is a teardown record, not an
        // announced mid-turn loss that emitDelta swallows (MAR-3143 lap 2, B).
        endTurn()
        recordTeardown('the flushed thinking buffer', () =>
          flushThinkingBuffer(),
        )
        recordTeardown('the flushed assistant buffer', () =>
          flushAssistantBuffer(),
        )
        disposeRuntime()
        if (hadPromptInFlight) recordFailedTurnState()
        recordTeardown('the cleared activity', () => setActivity(null))
      },
    }
  }
}
