import { spawn, type ChildProcess } from 'child_process'
import { promises as fs } from 'fs'
import type { SessionDelta } from '../../session/conversation-item.types'
import type {
  ActivitySignal,
  Attachment,
  AttentionState,
  Provider,
  ProviderDescriptor,
  MidRunInputMode,
  SessionContextWindow,
  SessionHandle,
  SessionStartConfig,
  SessionStatus,
} from '../provider.types'
import { ProviderSessionEmitter } from '../provider-session.emitter'
import {
  buildFallbackPiDescriptor,
  normalizeProviderDescriptor,
} from '../provider-descriptor.pure'
import { PiRpcClient, type PiEvent, type PiExtensionUiRequest } from './pi-rpc'
import {
  derivePiContextWindow,
  extractLastAssistantStopReason,
  extractToolCallFromEnd,
  extractToolResultText,
} from './pi-event-mapping.pure'
import { mapEffortToPiThinking, mapPiModels } from './pi-models.pure'
import { probePiAvailableModels } from './pi-models.service'
import { buildPiPromptPayload, type PiMessagePart } from './pi-message.pure'
import {
  initialPiActivityState,
  reducePiActivity,
  type PiActivityInput,
  type PiActivityState,
} from './pi-activity.pure'
import {
  buildContinuationRecoveryEntry,
  isMissingContinuationError,
} from '../continuation-recovery.pure'
import { PiSkillsService } from '../../skills/pi-skills.service'
import {
  failedNativeSkillInvocation,
  resolveNativeSkillInvocation,
  type NativeSkillInvocationResolution,
} from '../../skills/native-skill-invocation.pure'
import { markSkillSelectionsStatus } from '../../skills/skill-invocation.pure'
import type { SkillSelection } from '../../skills/skills.types'

function now(): string {
  return new Date().toISOString()
}

export class PiProvider implements Provider {
  id = 'pi'
  name = 'Pi Agent'
  supportsContinuation = true

  private descriptorPromise: Promise<ProviderDescriptor> | null = null
  private readonly skillsService = new PiSkillsService()

  constructor(private binaryPath: string) {}

  describe(): Promise<ProviderDescriptor> {
    if (!this.descriptorPromise) {
      this.descriptorPromise = this.fetchDescriptor().catch(() =>
        buildFallbackPiDescriptor(),
      )
    }
    return this.descriptorPromise
  }

  private async fetchDescriptor(): Promise<ProviderDescriptor> {
    const fallback = buildFallbackPiDescriptor()
    const rawModels = await probePiAvailableModels(this.binaryPath)
    const modelOptions = mapPiModels(rawModels)
    if (modelOptions.length === 0) return fallback

    return normalizeProviderDescriptor({
      ...fallback,
      defaultModelId: modelOptions[0]?.id ?? fallback.defaultModelId,
      modelOptions,
    })
  }

  start(config: SessionStartConfig): SessionHandle {
    const binaryPath = this.binaryPath
    const skillsService = this.skillsService
    const listeners = {
      delta: [] as ((delta: SessionDelta) => void)[],
      status: [] as ((status: SessionStatus) => void)[],
      attention: [] as ((attention: AttentionState) => void)[],
      continuationToken: [] as ((token: string) => void)[],
      contextWindow: [] as ((contextWindow: SessionContextWindow) => void)[],
      activity: [] as ((activity: ActivitySignal) => void)[],
    }

    let child: ChildProcess | null = null
    let rpc: PiRpcClient | null = null
    let stopped = false
    let sessionFile: string | null = config.continuationToken
    let continuationCaptured = !!config.continuationToken
    let textBuffer = ''
    let assistantMessageItemId: string | null = null
    let isStreaming = false
    let currentTurn: {
      message: string
      attachments?: Attachment[]
      skillSelections?: SkillSelection[]
      userMessageItemId: string | null
      allowContinuationRecovery: boolean
      usedContinuationToken: boolean
    } | null = null
    let pendingRecoveryTurn: {
      message: string
      attachments?: Attachment[]
      skillSelections?: SkillSelection[]
      userMessageItemId: string | null
    } | null = null
    let sawTurnActivity = false
    const pendingToolCallArgs = new Map<
      string,
      { name: string; args: string }
    >()

    function emitDelta(delta: SessionDelta): void {
      listeners.delta.forEach((cb) => cb(delta))
    }
    const sessionEmitter = new ProviderSessionEmitter({
      providerId: 'pi',
      emitDelta,
      now,
    })
    function setStatus(status: SessionStatus): void {
      listeners.status.forEach((cb) => cb(status))
      sessionEmitter.patchSession({ status })
    }
    function setAttention(attention: AttentionState): void {
      listeners.attention.forEach((cb) => cb(attention))
      sessionEmitter.patchSession({ attention })
    }
    function setContinuationToken(token: string): void {
      if (sessionFile === token) return
      sessionFile = token
      listeners.continuationToken.forEach((cb) => cb(token))
      sessionEmitter.patchSession({ continuationToken: token })
    }
    function setContextWindow(window: SessionContextWindow): void {
      listeners.contextWindow.forEach((cb) => cb(window))
      sessionEmitter.patchSession({ contextWindow: window })
    }

    let activityState: PiActivityState = initialPiActivityState()
    function applyActivity(input: PiActivityInput): void {
      const { state, activity } = reducePiActivity(activityState, input)
      activityState = state
      if (activity !== 'keep') {
        listeners.activity.forEach((cb) => cb(activity))
        sessionEmitter.patchSession({ activity })
      }
    }
    function flushText(): void {
      if (textBuffer) {
        const timestamp = now()
        if (assistantMessageItemId) {
          sessionEmitter.patchMessage(assistantMessageItemId, {
            text: textBuffer,
            state: 'complete',
            updatedAt: timestamp,
          })
        } else {
          assistantMessageItemId = sessionEmitter.addAssistantMessage({
            text: textBuffer,
            state: 'complete',
            timestamp,
          })
        }
        textBuffer = ''
        assistantMessageItemId = null
        sawTurnActivity = true
      }
    }

    function canRecoverContinuation(): boolean {
      return !!(
        currentTurn?.allowContinuationRecovery &&
        currentTurn.usedContinuationToken &&
        !pendingRecoveryTurn
      )
    }

    function shouldRecoverFromMessage(message: unknown): boolean {
      return (
        canRecoverContinuation() &&
        isMissingContinuationError(message, ['session', 'resume'])
      )
    }

    function scheduleContinuationRecovery(): void {
      if (!currentTurn || !canRecoverContinuation()) {
        return
      }

      pendingRecoveryTurn = {
        message: currentTurn.message,
        attachments: currentTurn.attachments,
        skillSelections: currentTurn.skillSelections,
        userMessageItemId: currentTurn.userMessageItemId,
      }
      const recoveryEntry = buildContinuationRecoveryEntry('Pi Agent', now())
      sessionEmitter.addNote({
        text: recoveryEntry.text,
        level: recoveryEntry.level,
        timestamp: recoveryEntry.timestamp,
      })
      sessionFile = null
      continuationCaptured = false
      currentTurn = null
      if (rpc) {
        rpc.destroy()
        rpc = null
      }
      if (child) {
        child.kill('SIGTERM')
      }
    }

    function maybeRestartRecoveredTurn(): boolean {
      if (!pendingRecoveryTurn) {
        return false
      }

      const recoveryTurn = pendingRecoveryTurn
      pendingRecoveryTurn = null
      void spawnPi(recoveryTurn.message, recoveryTurn.attachments, {
        skillSelections: recoveryTurn.skillSelections,
        userMessageItemId: recoveryTurn.userMessageItemId,
        emitUserEntry: false,
        allowContinuationRecovery: false,
      })
      return true
    }

    async function captureContinuationToken(): Promise<void> {
      if (continuationCaptured || !rpc || stopped) return
      continuationCaptured = true
      try {
        const response = await rpc.request({ type: 'get_state' })
        if (
          response.success &&
          response.data &&
          typeof response.data === 'object'
        ) {
          const data = response.data as { sessionFile?: unknown }
          if (typeof data.sessionFile === 'string' && data.sessionFile) {
            setContinuationToken(data.sessionFile)
          }
        }
      } catch {
        // Best-effort; leave continuationCaptured=true to avoid retry storms
      }
    }

    async function refreshContextWindow(): Promise<void> {
      if (!rpc || stopped) return
      try {
        const response = await rpc.request({ type: 'get_session_stats' })
        if (response.success) {
          const window = derivePiContextWindow(response.data)
          if (window) setContextWindow(window)
        }
      } catch {
        // Ignore — telemetry is best-effort
      }
    }

    function handleAssistantMessageEvent(raw: unknown): void {
      if (!raw || typeof raw !== 'object') return
      const event = raw as Record<string, unknown>
      const deltaType = event.type

      if (deltaType === 'text_delta') {
        if (typeof event.delta === 'string') textBuffer += event.delta
        if (textBuffer) {
          if (!assistantMessageItemId) {
            assistantMessageItemId = sessionEmitter.addAssistantMessage({
              text: textBuffer,
              state: 'streaming',
              providerEventType: 'message_update',
            })
          } else {
            sessionEmitter.patchMessage(assistantMessageItemId, {
              text: textBuffer,
              state: 'streaming',
            })
          }
        }
        applyActivity({ kind: 'text_delta' })
        return
      }

      if (deltaType === 'thinking_delta') {
        applyActivity({ kind: 'thinking_delta' })
        return
      }

      if (deltaType === 'text_end') {
        flushText()
        return
      }

      if (deltaType === 'toolcall_start') {
        const tc = event.toolCall as
          | { id?: unknown; name?: unknown }
          | undefined
        const id = typeof tc?.id === 'string' ? tc.id : null
        const name = typeof tc?.name === 'string' ? tc.name : 'tool'
        if (id) pendingToolCallArgs.set(id, { name, args: '' })
        applyActivity({ kind: 'tool_start', name })
        return
      }

      if (deltaType === 'toolcall_delta') {
        const id =
          typeof event.toolCallId === 'string' ? event.toolCallId : null
        const delta = typeof event.delta === 'string' ? event.delta : ''
        if (id) {
          const existing = pendingToolCallArgs.get(id) ?? {
            name: 'tool',
            args: '',
          }
          existing.args += delta
          pendingToolCallArgs.set(id, existing)
        }
        return
      }

      if (deltaType === 'toolcall_end') {
        const extracted = extractToolCallFromEnd(event)
        let input = extracted.input
        if (!input && extracted.id) {
          input = pendingToolCallArgs.get(extracted.id)?.args ?? ''
        }
        if (extracted.id) pendingToolCallArgs.delete(extracted.id)
        flushText()
        sessionEmitter.addToolCall({
          toolName: extracted.name,
          inputText: input,
          providerEventType: 'toolcall_end',
        })
      }
    }

    function handleEvent(event: PiEvent): void {
      if (stopped) return

      switch (event.type) {
        case 'agent_start':
          sawTurnActivity = true
          isStreaming = true
          setStatus('running')
          setAttention('none')
          applyActivity({ kind: 'agent_start' })
          void captureContinuationToken()
          break

        case 'message_update':
          sawTurnActivity = true
          handleAssistantMessageEvent(
            (event as { assistantMessageEvent?: unknown })
              .assistantMessageEvent,
          )
          break

        case 'tool_execution_end': {
          sawTurnActivity = true
          const isError = (event as { isError?: unknown }).isError === true
          const text = extractToolResultText(
            (event as { result?: unknown }).result,
          )
          sessionEmitter.addToolResult({
            outputText: isError ? `Error: ${text}` : text,
            state: isError ? 'error' : 'complete',
            providerEventType: 'tool_execution_end',
          })
          applyActivity({ kind: 'tool_end' })
          break
        }

        case 'turn_end':
          sawTurnActivity = true
          flushText()
          applyActivity({ kind: 'turn_end' })
          void refreshContextWindow()
          break

        case 'agent_end': {
          sawTurnActivity = true
          flushText()
          applyActivity({ kind: 'agent_end' })
          isStreaming = false
          const stopReason = extractLastAssistantStopReason(event)
          if (stopReason === 'aborted') {
            setStatus('failed')
            setAttention('failed')
            currentTurn = null
          } else if (stopReason === 'error') {
            sessionEmitter.addNote({
              text: 'Agent failed',
              level: 'error',
            })
            setStatus('failed')
            setAttention('failed')
            currentTurn = null
          } else {
            setStatus('completed')
            setAttention('finished')
            currentTurn = null
          }
          break
        }

        case 'compaction_start':
          applyActivity({ kind: 'compaction_start' })
          sessionEmitter.addNote({
            text: 'Compacting context...',
            level: 'info',
          })
          break

        case 'compaction_end':
          applyActivity({ kind: 'compaction_end' })
          sessionEmitter.addNote({
            text: 'Compaction complete',
            level: 'info',
          })
          break

        case 'auto_retry_start': {
          const msg = (event as { errorMessage?: unknown }).errorMessage
          sessionEmitter.addNote({
            text: `Retrying: ${typeof msg === 'string' ? msg : 'transient error'}`,
            level: 'warning',
          })
          break
        }

        case 'auto_retry_end': {
          const success = (event as { success?: unknown }).success === true
          sessionEmitter.addNote({
            text: success ? 'Retry succeeded' : 'Retry failed',
            level: success ? 'info' : 'warning',
          })
          break
        }
      }
    }

    function handleExtensionUiRequest(request: PiExtensionUiRequest): void {
      if (stopped || !rpc) return
      // v1: auto-cancel dialog methods so pi is not left waiting.
      // Fire-and-forget methods expect no response — ignore.
      if (
        request.method === 'select' ||
        request.method === 'confirm' ||
        request.method === 'input' ||
        request.method === 'editor'
      ) {
        rpc.sendExtensionUiResponse(request.id, { cancelled: true })
      }
    }

    async function loadPiParts(
      attachments: Attachment[] | undefined,
    ): Promise<PiMessagePart[]> {
      if (!attachments || attachments.length === 0) return []
      const parts: PiMessagePart[] = []
      for (const att of attachments) {
        const needsBytes = att.kind === 'image' || att.kind === 'text'
        let bytes: Uint8Array | undefined
        if (needsBytes) {
          const buf = await fs.readFile(att.storagePath)
          bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
        }
        parts.push({
          kind: att.kind,
          mimeType: att.mimeType,
          filename: att.filename,
          storagePath: att.storagePath,
          bytes,
        })
      }
      return parts
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
        const catalog = await skillsService.list(config.workingDirectory, {
          forceReload: true,
        })
        return resolveNativeSkillInvocation({
          providerId: 'pi',
          providerName: 'Pi Agent',
          catalog,
          selections,
          syntax: 'pi-skill-slash',
          text,
        })
      } catch (err) {
        return failedNativeSkillInvocation({
          providerName: 'Pi Agent',
          selections,
          error: err,
        })
      }
    }

    function addSkillInvocationFailureNote(
      resolution: Extract<NativeSkillInvocationResolution, { ok: false }>,
    ): void {
      sessionEmitter.addNote({
        text: `Pi skill ${resolution.status}: ${resolution.message}`,
        level: 'error',
      })
    }

    function patchUserMessageSkills(
      userMessageItemId: string | null,
      selections: SkillSelection[] | undefined,
      status: Parameters<typeof markSkillSelectionsStatus>[1],
    ): void {
      if (!userMessageItemId) {
        return
      }
      const updatedSelections = markSkillSelectionsStatus(selections, status)
      if (!updatedSelections) {
        return
      }

      sessionEmitter.patchMessage(userMessageItemId, {
        skillSelections: updatedSelections,
      })
    }

    function sendPromptFromPayload(
      message: string,
      images: ReturnType<typeof buildPiPromptPayload>['images'],
      skillSelections?: SkillSelection[],
      userMessageItemId?: string | null,
      deliveryMode: Extract<
        MidRunInputMode,
        'normal' | 'follow-up' | 'steer'
      > = 'normal',
    ): void {
      if (!rpc || stopped) return

      const isMidRunInput =
        deliveryMode === 'follow-up' || deliveryMode === 'steer'
      const command: {
        type: string
        message: string
        streamingBehavior?: string
        images?: ReturnType<typeof buildPiPromptPayload>['images']
      } = {
        type:
          deliveryMode === 'follow-up'
            ? 'follow_up'
            : deliveryMode === 'steer'
              ? 'steer'
              : 'prompt',
        message,
      }
      if (deliveryMode === 'normal' && isStreaming) {
        command.streamingBehavior = 'steer'
      }
      if (images && images.length > 0) command.images = images

      rpc.request(command).then(
        (response) => {
          if (!response.success) {
            if (shouldRecoverFromMessage(response.error)) {
              scheduleContinuationRecovery()
              return
            }
            sessionEmitter.addNote({
              text: `Prompt failed: ${response.error ?? 'unknown error'}`,
              level: 'error',
            })
            patchUserMessageSkills(
              userMessageItemId ?? null,
              skillSelections,
              'failed',
            )
            if (!isMidRunInput) {
              setStatus('failed')
              setAttention('failed')
              currentTurn = null
            }
            return
          }
          patchUserMessageSkills(
            userMessageItemId ?? null,
            skillSelections,
            'sent',
          )
        },
        (err) => {
          if (stopped) return
          if (pendingRecoveryTurn) return
          if (shouldRecoverFromMessage(err)) {
            scheduleContinuationRecovery()
            return
          }
          sessionEmitter.addNote({
            text: `Prompt error: ${err instanceof Error ? err.message : String(err)}`,
            level: 'error',
          })
          patchUserMessageSkills(
            userMessageItemId ?? null,
            skillSelections,
            'failed',
          )
          if (!isMidRunInput) {
            setStatus('failed')
            setAttention('failed')
            currentTurn = null
          }
        },
      )
    }

    function sendPromptWithAttachments(
      text: string,
      attachments?: Attachment[],
      skillSelections?: SkillSelection[],
      userMessageItemId?: string | null,
      deliveryMode: Extract<
        MidRunInputMode,
        'normal' | 'follow-up' | 'steer'
      > = 'normal',
    ): void {
      if (!rpc || stopped) return
      loadPiParts(attachments)
        .then((parts) => {
          if (stopped) return
          const payload = buildPiPromptPayload({ text, parts })
          sendPromptFromPayload(
            payload.message,
            payload.images,
            skillSelections,
            userMessageItemId,
            deliveryMode,
          )
        })
        .catch((err) => {
          if (stopped) return
          patchUserMessageSkills(
            userMessageItemId ?? null,
            skillSelections,
            'failed',
          )
          sessionEmitter.addNote({
            text: `Failed to send attachments: ${err instanceof Error ? err.message : String(err)}`,
            level: 'error',
          })
          if (deliveryMode === 'normal') {
            setStatus('failed')
            setAttention('failed')
          }
        })
    }

    async function sendPiTurn(
      text: string,
      attachments?: Attachment[],
      skillSelections?: SkillSelection[],
    ): Promise<void> {
      const skillResolution = await resolveSelectedSkills(text, skillSelections)
      if (stopped || !rpc) return

      const userMessageItemId = sessionEmitter.addUserMessage({
        text,
        skillSelections: skillResolution.skillSelections,
        attachmentIds: attachments?.length
          ? attachments.map((a) => a.id)
          : undefined,
      })
      if (!skillResolution.ok) {
        addSkillInvocationFailureNote(skillResolution)
        setStatus('failed')
        setAttention('failed')
        return
      }

      currentTurn = {
        message: text,
        attachments,
        skillSelections,
        userMessageItemId,
        allowContinuationRecovery: true,
        usedContinuationToken: !!sessionFile,
      }
      setStatus('running')
      setAttention('none')
      sendPromptWithAttachments(
        skillResolution.promptText,
        attachments,
        skillResolution.skillSelections,
        userMessageItemId,
      )
    }

    async function sendPiRunningInput(
      text: string,
      attachments: Attachment[] | undefined,
      skillSelections: SkillSelection[] | undefined,
      deliveryMode: Extract<MidRunInputMode, 'follow-up' | 'steer'>,
    ): Promise<void> {
      const skillResolution = await resolveSelectedSkills(text, skillSelections)
      if (stopped || !rpc) return

      if (!skillResolution.ok) {
        addSkillInvocationFailureNote(skillResolution)
        return
      }

      const userMessageItemId = sessionEmitter.addUserMessage({
        text,
        skillSelections: skillResolution.skillSelections,
        attachmentIds: attachments?.length
          ? attachments.map((a) => a.id)
          : undefined,
        deliveryMode,
      })

      sendPromptWithAttachments(
        skillResolution.promptText,
        attachments,
        skillResolution.skillSelections,
        userMessageItemId,
        deliveryMode,
      )
    }

    async function spawnPi(
      initialMessage: string,
      initialAttachments?: Attachment[],
      options?: {
        skillSelections?: SkillSelection[]
        userMessageItemId?: string | null
        emitUserEntry?: boolean
        allowContinuationRecovery?: boolean
      },
    ): Promise<void> {
      if (stopped || child || rpc) return

      const skillResolution = await resolveSelectedSkills(
        initialMessage,
        options?.skillSelections,
      )
      if (stopped || child || rpc) return

      const userMessageItemId =
        options?.emitUserEntry !== false
          ? sessionEmitter.addUserMessage({
              text: initialMessage,
              skillSelections: skillResolution.skillSelections,
              attachmentIds: initialAttachments?.length
                ? initialAttachments.map((a) => a.id)
                : undefined,
            })
          : (options?.userMessageItemId ?? null)
      if (!skillResolution.ok) {
        addSkillInvocationFailureNote(skillResolution)
        setStatus('failed')
        setAttention('failed')
        return
      }

      const args = ['--mode', 'rpc']
      if (sessionFile) {
        args.push('--session', sessionFile)
      }
      if (config.model && config.model.includes('/')) {
        args.push('--model', config.model)
      }
      const thinking = mapEffortToPiThinking(config.effort)
      if (thinking) {
        args.push('--thinking', thinking)
      }

      child = spawn(binaryPath, args, {
        cwd: config.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      if (!child.stdin || !child.stdout) {
        patchUserMessageSkills(
          userMessageItemId,
          skillResolution.skillSelections,
          'failed',
        )
        sessionEmitter.addNote({
          text: 'Failed to open stdio',
          level: 'error',
        })
        setStatus('failed')
        setAttention('failed')
        return
      }

      rpc = new PiRpcClient(child.stdin, child.stdout)
      rpc.onEvent(handleEvent)
      rpc.onExtensionUiRequest(handleExtensionUiRequest)

      if (child.stderr) {
        child.stderr.on('data', () => {
          // Drain to prevent blocking. Errors surface via events and exit codes.
        })
      }

      child.on('exit', (code) => {
        if (stopped) return
        flushText()
        applyActivity({ kind: 'close' })
        if (
          code !== 0 &&
          code !== null &&
          canRecoverContinuation() &&
          !sawTurnActivity
        ) {
          scheduleContinuationRecovery()
        }
        child = null
        rpc?.destroy()
        rpc = null
        if (maybeRestartRecoveredTurn()) {
          return
        }
        if (code !== 0 && code !== null) {
          patchUserMessageSkills(
            userMessageItemId,
            skillResolution.skillSelections,
            'failed',
          )
          sessionEmitter.addNote({
            text: `Process exited with code ${code}`,
            level: 'error',
          })
          setStatus('failed')
          setAttention('failed')
          currentTurn = null
        }
      })

      child.on('error', (err) => {
        if (stopped) return
        patchUserMessageSkills(
          userMessageItemId,
          skillResolution.skillSelections,
          'failed',
        )
        sessionEmitter.addNote({
          text: `Process error: ${err.message}`,
          level: 'error',
        })
        setStatus('failed')
        setAttention('failed')
        child = null
        currentTurn = null
      })

      sawTurnActivity = false
      textBuffer = ''
      assistantMessageItemId = null
      currentTurn = {
        message: initialMessage,
        attachments: initialAttachments,
        skillSelections: options?.skillSelections,
        userMessageItemId,
        allowContinuationRecovery: options?.allowContinuationRecovery ?? true,
        usedContinuationToken: !!sessionFile,
      }
      setStatus('running')
      setAttention('none')
      sendPromptWithAttachments(
        skillResolution.promptText,
        initialAttachments,
        skillResolution.skillSelections,
        userMessageItemId,
      )
    }

    setTimeout(
      () =>
        void spawnPi(config.initialMessage, config.initialAttachments, {
          skillSelections: config.initialSkillSelections,
        }),
      10,
    )

    const handle: SessionHandle = {
      onDelta: (cb) => {
        listeners.delta.push(cb)
      },
      onStatusChange: (cb) => {
        listeners.status.push(cb)
      },
      onAttentionChange: (cb) => {
        listeners.attention.push(cb)
      },
      onContinuationToken: (cb) => {
        listeners.continuationToken.push(cb)
        if (sessionFile) cb(sessionFile)
      },
      onContextWindowChange: (cb) => {
        listeners.contextWindow.push(cb)
      },
      onActivityChange: (cb) => {
        listeners.activity.push(cb)
      },
      sendMessage: (text, attachments, skillSelections, options) => {
        if (stopped) return
        const deliveryMode = options?.deliveryMode ?? 'normal'
        if (!rpc) {
          if (deliveryMode === 'follow-up' || deliveryMode === 'steer') {
            sessionEmitter.addNote({
              text: 'Pi Agent is not ready to accept mid-run input yet.',
              level: 'error',
            })
            return
          }
          void spawnPi(text, attachments, { skillSelections })
          return
        }
        if (deliveryMode === 'follow-up' || deliveryMode === 'steer') {
          void sendPiRunningInput(
            text,
            attachments,
            skillSelections,
            deliveryMode,
          )
          return
        }
        void sendPiTurn(text, attachments, skillSelections)
      },
      approve: () => {
        // Pi has no built-in approval flow in v1 (extension_ui_request is auto-cancelled).
      },
      deny: () => {
        // Pi has no built-in approval flow in v1 (extension_ui_request is auto-cancelled).
      },
      stop: () => {
        stopped = true
        if (rpc) {
          try {
            rpc.send({ type: 'abort' })
          } catch {
            // Ignore — process may already be gone
          }
          rpc.destroy()
          rpc = null
        }
        if (child) {
          child.kill('SIGTERM')
          const pending = child
          setTimeout(() => {
            if (pending && !pending.killed) {
              pending.kill('SIGKILL')
            }
          }, 3000)
          child = null
        }
        setStatus('failed')
        setAttention('failed')
      },
    }

    return handle
  }
}
