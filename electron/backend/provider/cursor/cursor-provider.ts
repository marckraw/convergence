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
import { summarizeCursorCommandCatalogUpdate } from '../../skills/cursor-skills.mapper.pure'
import type {
  InteractionResponse,
  SessionDelta,
} from '../../session/conversation-item.types'
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
import {
  buildCursorAcpInitializeParams,
  buildCursorAcpSessionParams,
  readCursorAcpSessionId,
} from './cursor-acp-client'
import {
  buildCursorUnavailableContextWindow,
  CURSOR_ACP_LOGIN_METHOD_ID,
  CURSOR_ACP_MODEL_CONFIG_ID,
  getCursorAcpCurrentModelId,
} from './cursor-acp-contract.pure'
import {
  buildCursorAcpPermissionRequest,
  buildCursorAcpAskQuestionInputRequest,
  buildCursorAcpCreatePlanInputRequest,
  buildCursorAcpInteractionResponse,
  buildCursorAcpPassiveUpdateAcknowledgement,
  buildCursorAcpPassiveUpdateNote,
  buildCursorAcpPrompt,
  buildCursorAcpToolView,
  getCursorAcpSessionUpdate,
  getCursorAcpSessionUpdateType,
  partFromAttachment,
  readCursorAcpUpdateText,
  shouldAutoApproveCursorPermissions,
  type CursorAcpMessagePart,
  type CursorAcpInputRequest,
  type CursorAcpPermissionRequest,
} from './cursor-acp-message.pure'
import {
  CursorAcpJsonRpcClient,
  type CursorAcpJsonRpcId,
} from './cursor-acp-jsonrpc'
import { fetchCursorAcpDescriptorOrFallback } from './cursor-descriptor.service'

const CURSOR_PROVIDER_ID = 'cursor'

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
  list(
    projectPath: string,
    options?: { forceReload?: boolean },
  ): Promise<ProviderSkillCatalog>
}

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

      await activeRpc.request('initialize', buildCursorAcpInitializeParams())
      await activeRpc.request('authenticate', {
        methodId: CURSOR_ACP_LOGIN_METHOD_ID,
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

      const promptResult = await activeRpc.request('session/prompt', {
        sessionId: cursorSessionId,
        prompt: buildCursorAcpPrompt({ text: input.prompt }),
      })
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
  private descriptorPromise: Promise<ProviderDescriptor> | null = null

  constructor(
    private binaryPath: string,
    private debugSink: ProviderDebugSink = noopDebugSink,
    private skillsService: CursorSkillCatalogAdapter = new CursorSkillsService(
      binaryPath,
    ),
  ) {}

  describe(): Promise<ProviderDescriptor> {
    if (!this.descriptorPromise) {
      this.descriptorPromise = fetchCursorAcpDescriptorOrFallback(
        this.binaryPath,
      )
    }

    return this.descriptorPromise
  }

  oneShot(input: OneShotInput): Promise<OneShotResult> {
    return runCursorAcpOneShot(this.binaryPath, input, this.debugSink)
  }

  start(config: SessionStartConfig): SessionHandle {
    const binaryPath = this.binaryPath
    const debugSink = this.debugSink
    const thisProviderSkillsService = this.skillsService
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
    let promptQueue: Promise<void> = Promise.resolve()
    let resolveReady: (() => void) | null = null
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve
    })
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

    function emitDelta(delta: SessionDelta): void {
      listeners.delta.forEach((cb) => cb(delta))
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
          break
        default: {
          const update = getCursorAcpSessionUpdate(params)
          if (updateType === 'plan') {
            sessionEmitter.addThinking({
              text: JSON.stringify(update, null, 2),
              providerEventType: updateType,
            })
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
          sessionEmitter.addNote({
            text: `Auto-approved Cursor permission request:\n\n${permissionRequest.description}`,
            level: 'info',
            providerItemId: String(id),
            providerEventType: method,
          })
          return
        }

        flushAssistantBuffer()
        flushThinkingBuffer()
        const providerApprovalItemId = sessionEmitter.addApprovalRequest({
          description: permissionRequest.description,
          providerItemId: String(id),
          providerEventType: method,
        })
        pendingApprovals.set(id, {
          ...permissionRequest,
          providerApprovalItemId,
        })
        setAttention('needs-approval')
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
          sessionEmitter.addNote({
            text: 'Skipped malformed Cursor ask-question request',
            level: 'warning',
            providerItemId: String(id),
            providerEventType: method,
          })
          return
        }

        flushAssistantBuffer()
        flushThinkingBuffer()
        const providerInputItemId = sessionEmitter.addInputRequest({
          prompt: request.prompt,
          request: request.request,
          providerItemId: String(id),
          providerEventType: method,
        })
        pendingInteractions.set(id, {
          ...request,
          providerInputItemId,
        })
        setAttention('needs-input')
        setActivity(null)
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
          sessionEmitter.addNote({
            text: 'Rejected malformed Cursor create-plan request',
            level: 'warning',
            providerItemId: String(id),
            providerEventType: method,
          })
          return
        }

        flushAssistantBuffer()
        flushThinkingBuffer()
        const providerInputItemId = sessionEmitter.addInputRequest({
          prompt: request.prompt,
          request: request.request,
          providerItemId: String(id),
          providerEventType: method,
        })
        pendingInteractions.set(id, {
          ...request,
          providerInputItemId,
        })
        setAttention('needs-input')
        setActivity(null)
        return
      }

      const passiveNote = buildCursorAcpPassiveUpdateNote(method, params)
      if (passiveNote) {
        flushAssistantBuffer()
        flushThinkingBuffer()
        sessionEmitter.addNote({
          text: passiveNote.text,
          level: passiveNote.level,
          providerItemId: passiveNote.providerItemId ?? String(id),
          providerEventType: method,
        })
        activeRpc.respond(
          id,
          buildCursorAcpPassiveUpdateAcknowledgement(method, params),
        )
        return
      }

      activeRpc.respondError(
        id,
        -32601,
        `Convergence does not support Cursor ACP server request "${method}" yet`,
      )
      sessionEmitter.addNote({
        text: `Unsupported Cursor ACP server request: ${method}`,
        level: 'error',
        providerEventType: method,
      })
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
        const catalog = await thisProviderSkillsService.list(
          config.workingDirectory,
          {
            forceReload: true,
          },
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
      await readyPromise
      const activeRpc = rpc
      const activeSessionId = cursorSessionId
      if (!activeRpc || !activeSessionId || stopped) return

      const skillResolution = await resolveSelectedSkills(text, skillSelections)
      if (stopped) return

      const userMessageItemId = sessionEmitter.addUserMessage({
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
        addSkillInvocationFailureNote(skillResolution)
        setStatus('failed')
        setAttention('failed')
        setActivity(null)
        return
      }

      try {
        const parts = await loadCursorParts(attachments)
        const result = (await activeRpc.request('session/prompt', {
          sessionId: activeSessionId,
          prompt: buildCursorAcpPrompt({
            text: skillResolution.promptText,
            parts,
          }),
        })) as { stopReason?: unknown } | null

        patchUserMessageSkills(
          userMessageItemId,
          skillResolution.skillSelections,
          'sent',
        )

        flushThinkingBuffer()
        flushAssistantBuffer()

        const stopReason =
          result && typeof result.stopReason === 'string'
            ? result.stopReason
            : 'end_turn'
        setActivity(null)
        if (stopReason === 'cancelled') {
          setStatus('completed')
          setAttention('finished')
          return
        }
        setStatus('completed')
        setAttention('finished')
      } catch (error) {
        patchUserMessageSkills(
          userMessageItemId,
          skillResolution.skillSelections,
          'failed',
        )
        throw error
      }
    }

    function enqueuePrompt(
      text: string,
      attachments?: Attachment[],
      deliveryMode?: MidRunInputMode,
      skillSelections?: SkillSelection[],
    ): void {
      promptQueue = promptQueue
        .then(() =>
          sendPrompt(text, attachments, deliveryMode, skillSelections),
        )
        .catch((error) => {
          if (stopped) return
          flushAssistantBuffer()
          flushThinkingBuffer()
          sessionEmitter.addNote({
            text: `Cursor prompt failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            level: 'error',
          })
          setStatus('failed')
          setAttention('failed')
          setActivity(null)
        })
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

    async function initializeAndStart(): Promise<void> {
      const activeRpc = rpc
      if (!activeRpc || stopped) return

      try {
        await activeRpc.request('initialize', buildCursorAcpInitializeParams())
        await activeRpc.request('authenticate', {
          methodId: CURSOR_ACP_LOGIN_METHOD_ID,
        })

        if (cursorSessionId) {
          suppressReplayUpdates = true
          const sessionResult = await activeRpc.request('session/load', {
            sessionId: cursorSessionId,
            ...buildCursorAcpSessionParams(config.workingDirectory),
          })
          suppressReplayUpdates = false
          await applySessionConfig(sessionResult)
        } else {
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

        resolveReady?.()
        enqueuePrompt(
          config.initialMessage,
          config.initialAttachments,
          'normal',
          config.initialSkillSelections,
        )
      } catch (error) {
        if (stopped) return
        suppressReplayUpdates = false
        resolveReady?.()
        sessionEmitter.addNote({
          text: `Cursor initialization failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          level: 'error',
        })
        setStatus('failed')
        setAttention('failed')
        setActivity(null)
        rpc?.destroy()
        rpc = null
        if (child && !child.killed) {
          child.kill('SIGTERM')
        }
        child = null
      }
    }

    function spawnCursor(): void {
      if (stopped || child || rpc) return

      child = spawn(binaryPath, ['acp'], {
        cwd: config.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      if (!child.stdin || !child.stdout) {
        resolveReady?.()
        sessionEmitter.addNote({
          text: 'Failed to open Cursor ACP stdio',
          level: 'error',
        })
        setStatus('failed')
        setAttention('failed')
        child.kill('SIGTERM')
        return
      }

      rpc = new CursorAcpJsonRpcClient(child.stdin, child.stdout, {
        onDebug: recordTransportDebug,
      })
      rpc.onNotification((method, params) => {
        if (stopped) return
        if (method === 'session/update') {
          handleSessionUpdate(params)
          return
        }

        const passiveNote = buildCursorAcpPassiveUpdateNote(method, params)
        if (passiveNote) {
          flushAssistantBuffer()
          flushThinkingBuffer()
          sessionEmitter.addNote({
            text: passiveNote.text,
            level: passiveNote.level,
            providerItemId: passiveNote.providerItemId,
            providerEventType: method,
          })
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
        sessionEmitter.addNote({
          text: `Cursor ACP failed: ${error.message}`,
          level: 'error',
        })
        setStatus('failed')
        setAttention('failed')
        setActivity(null)
      })
      child.once('exit', (code, signal) => {
        if (stopped) return
        resolveReady?.()
        rpc?.destroy('Cursor ACP process exited')
        rpc = null
        child = null
        if (status === 'completed' || attention === 'finished') return
        sessionEmitter.addNote({
          text: `Cursor ACP exited before the session finished: code=${
            code ?? 'null'
          } signal=${signal ?? 'null'}`,
          level: 'error',
        })
        setStatus('failed')
        setAttention('failed')
        setActivity(null)
      })

      void initializeAndStart()
    }

    const startTimer = setTimeout(() => {
      spawnCursor()
    }, 10)

    return {
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
            setAttention('none')
          }
          return
        }
        enqueuePrompt(text, attachments, options?.deliveryMode, skillSelections)
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
        if (pendingApprovals.size === 0) setAttention('none')
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
        if (pendingApprovals.size === 0) setAttention('none')
      },
      stop: () => {
        stopped = true
        resolveReady?.()
        clearTimeout(startTimer)
        for (const [id, approval] of pendingApprovals.entries()) {
          rpc?.respond(id, approval.cancelResult)
        }
        pendingApprovals.clear()
        for (const [id, interaction] of pendingInteractions.entries()) {
          rpc?.respond(id, interaction.cancelResult)
        }
        pendingInteractions.clear()
        flushThinkingBuffer()
        flushAssistantBuffer()
        rpc?.destroy()
        rpc = null
        if (child && !child.killed) {
          const pending = child
          pending.kill('SIGTERM')
          const killTimer = setTimeout(() => {
            if (!pending.killed) {
              pending.kill('SIGKILL')
            }
          }, 3000)
          killTimer.unref?.()
        }
        child = null
        setStatus('failed')
        setAttention('failed')
        setActivity(null)
      },
    }
  }
}
