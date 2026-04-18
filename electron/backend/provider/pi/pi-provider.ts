import { spawn, type ChildProcess } from 'child_process'
import { promises as fs } from 'fs'
import type {
  ActivitySignal,
  Attachment,
  AttentionState,
  Provider,
  ProviderDescriptor,
  SessionContextWindow,
  SessionHandle,
  SessionStartConfig,
  SessionStatus,
  TranscriptEntry,
} from '../provider.types'
import {
  buildFallbackPiDescriptor,
  normalizeProviderDescriptor,
} from '../provider-descriptor.pure'
import { needsShellForSpawn } from '../shell-exec.pure'
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

function now(): string {
  return new Date().toISOString()
}

export class PiProvider implements Provider {
  id = 'pi'
  name = 'Pi Agent'
  supportsContinuation = true

  private descriptorPromise: Promise<ProviderDescriptor> | null = null

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
    const listeners = {
      transcript: [] as ((entry: TranscriptEntry) => void)[],
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
    let isStreaming = false
    const pendingToolCallArgs = new Map<
      string,
      { name: string; args: string }
    >()

    function emit(entry: TranscriptEntry): void {
      listeners.transcript.forEach((cb) => cb(entry))
    }
    function setStatus(status: SessionStatus): void {
      listeners.status.forEach((cb) => cb(status))
    }
    function setAttention(attention: AttentionState): void {
      listeners.attention.forEach((cb) => cb(attention))
    }
    function setContinuationToken(token: string): void {
      if (sessionFile === token) return
      sessionFile = token
      listeners.continuationToken.forEach((cb) => cb(token))
    }
    function setContextWindow(window: SessionContextWindow): void {
      listeners.contextWindow.forEach((cb) => cb(window))
    }

    let activityState: PiActivityState = initialPiActivityState()
    function applyActivity(input: PiActivityInput): void {
      const { state, activity } = reducePiActivity(activityState, input)
      activityState = state
      if (activity !== 'keep') {
        listeners.activity.forEach((cb) => cb(activity))
      }
    }
    function flushText(): void {
      if (textBuffer) {
        emit({ type: 'assistant', text: textBuffer, timestamp: now() })
        textBuffer = ''
      }
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
        emit({
          type: 'tool-use',
          tool: extracted.name,
          input,
          timestamp: now(),
        })
      }
    }

    function handleEvent(event: PiEvent): void {
      if (stopped) return

      switch (event.type) {
        case 'agent_start':
          isStreaming = true
          setStatus('running')
          setAttention('none')
          applyActivity({ kind: 'agent_start' })
          void captureContinuationToken()
          break

        case 'message_update':
          handleAssistantMessageEvent(
            (event as { assistantMessageEvent?: unknown })
              .assistantMessageEvent,
          )
          break

        case 'tool_execution_end': {
          const isError = (event as { isError?: unknown }).isError === true
          const text = extractToolResultText(
            (event as { result?: unknown }).result,
          )
          emit({
            type: 'tool-result',
            result: isError ? `Error: ${text}` : text,
            timestamp: now(),
          })
          applyActivity({ kind: 'tool_end' })
          break
        }

        case 'turn_end':
          flushText()
          applyActivity({ kind: 'turn_end' })
          void refreshContextWindow()
          break

        case 'agent_end': {
          flushText()
          applyActivity({ kind: 'agent_end' })
          isStreaming = false
          const stopReason = extractLastAssistantStopReason(event)
          if (stopReason === 'aborted') {
            setStatus('failed')
            setAttention('failed')
          } else if (stopReason === 'error') {
            emit({
              type: 'system',
              text: 'Agent failed',
              timestamp: now(),
            })
            setStatus('failed')
            setAttention('failed')
          } else {
            setStatus('completed')
            setAttention('finished')
          }
          break
        }

        case 'compaction_start':
          emit({
            type: 'system',
            text: 'Compacting context…',
            timestamp: now(),
          })
          break

        case 'compaction_end':
          emit({
            type: 'system',
            text: 'Compaction complete',
            timestamp: now(),
          })
          break

        case 'auto_retry_start': {
          const msg = (event as { errorMessage?: unknown }).errorMessage
          emit({
            type: 'system',
            text: `Retrying: ${typeof msg === 'string' ? msg : 'transient error'}`,
            timestamp: now(),
          })
          break
        }

        case 'auto_retry_end': {
          const success = (event as { success?: unknown }).success === true
          emit({
            type: 'system',
            text: success ? 'Retry succeeded' : 'Retry failed',
            timestamp: now(),
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

    function sendPromptFromPayload(
      message: string,
      images: ReturnType<typeof buildPiPromptPayload>['images'],
    ): void {
      if (!rpc || stopped) return

      const command: {
        type: string
        message: string
        streamingBehavior?: string
        images?: ReturnType<typeof buildPiPromptPayload>['images']
      } = { type: 'prompt', message }
      if (isStreaming) command.streamingBehavior = 'steer'
      if (images && images.length > 0) command.images = images

      rpc.request(command).then(
        (response) => {
          if (!response.success) {
            emit({
              type: 'system',
              text: `Prompt failed: ${response.error ?? 'unknown error'}`,
              timestamp: now(),
            })
            setStatus('failed')
            setAttention('failed')
          }
        },
        (err) => {
          if (stopped) return
          emit({
            type: 'system',
            text: `Prompt error: ${err instanceof Error ? err.message : String(err)}`,
            timestamp: now(),
          })
          setStatus('failed')
          setAttention('failed')
        },
      )
    }

    function sendPromptWithAttachments(
      text: string,
      attachments?: Attachment[],
    ): void {
      if (!rpc || stopped) return
      loadPiParts(attachments)
        .then((parts) => {
          if (stopped) return
          const payload = buildPiPromptPayload({ text, parts })
          sendPromptFromPayload(payload.message, payload.images)
        })
        .catch((err) => {
          if (stopped) return
          emit({
            type: 'system',
            text: `Failed to send attachments: ${err instanceof Error ? err.message : String(err)}`,
            timestamp: now(),
          })
          setStatus('failed')
          setAttention('failed')
        })
    }

    function spawnPi(
      initialMessage: string,
      initialAttachments?: Attachment[],
    ): void {
      if (stopped || child || rpc) return

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
        shell: needsShellForSpawn(binaryPath, process.platform),
      })

      if (!child.stdin || !child.stdout) {
        emit({ type: 'system', text: 'Failed to open stdio', timestamp: now() })
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
        if (code !== 0 && code !== null) {
          emit({
            type: 'system',
            text: `Process exited with code ${code}`,
            timestamp: now(),
          })
          setStatus('failed')
          setAttention('failed')
        }
        child = null
        rpc?.destroy()
        rpc = null
      })

      child.on('error', (err) => {
        if (stopped) return
        emit({
          type: 'system',
          text: `Process error: ${err.message}`,
          timestamp: now(),
        })
        setStatus('failed')
        setAttention('failed')
        child = null
      })

      emit({ type: 'user', text: initialMessage, timestamp: now() })
      setStatus('running')
      sendPromptWithAttachments(initialMessage, initialAttachments)
    }

    setTimeout(
      () => spawnPi(config.initialMessage, config.initialAttachments),
      10,
    )

    const handle: SessionHandle = {
      onTranscriptEntry: (cb) => {
        listeners.transcript.push(cb)
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
      sendMessage: (text, attachments) => {
        if (stopped) return
        if (!rpc) {
          spawnPi(text, attachments)
          return
        }
        emit({ type: 'user', text, timestamp: now() })
        setStatus('running')
        setAttention('none')
        sendPromptWithAttachments(text, attachments)
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
