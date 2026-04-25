import { spawn, type ChildProcess } from 'child_process'
import { promises as fs } from 'fs'
import type { SessionDelta } from '../../session/conversation-item.types'
import type {
  Provider,
  SessionStartConfig,
  SessionHandle,
  SessionStatus,
  AttentionState,
  SessionContextWindow,
  Attachment,
  ActivitySignal,
  OneShotInput,
  OneShotResult,
} from '../provider.types'
import { parseJsonLines } from '../line-parser'
import { buildClaudeDescriptor } from '../provider-descriptor.pure'
import type { ProviderDescriptor } from '../provider.types'
import { ProviderSessionEmitter } from '../provider-session.emitter'
import {
  buildClaudeUserMessageLine,
  type ClaudeMessagePart,
} from './claude-code-message.pure'
import {
  createUnavailableContextWindow,
  deriveClaudeContextWindow,
  deriveClaudeEstimatedContextWindow,
} from '../context-window.pure'
import {
  buildContinuationRecoveryEntry,
  isMissingContinuationError,
} from '../continuation-recovery.pure'
import { readClaudeLoggedContextWindow } from './claude-context-log.service'
import { deriveClaudeActivity } from './claude-code-activity.pure'
import type { TaskProgressService } from '../../task-progress/task-progress.service'
import { createTaskProgressEmitter } from '../../task-progress/task-progress.emitter'
import { ClaudeCodeSkillsService } from '../../skills/claude-code-skills.service'
import {
  failedNativeSkillInvocation,
  resolveNativeSkillInvocation,
  type NativeSkillInvocationResolution,
} from '../../skills/native-skill-invocation.pure'
import { markSkillSelectionsStatus } from '../../skills/skill-invocation.pure'
import type { SkillSelection } from '../../skills/skills.types'
import {
  isConcreteClaudeSkillName,
  type ClaudeSkillActivationEvent,
} from './claude-skill-telemetry.pure'
import {
  startClaudeSkillTelemetrySink,
  type ClaudeSkillTelemetrySink,
} from './claude-skill-telemetry.service'

function now(): string {
  return new Date().toISOString()
}

interface ClaudeStreamEvent {
  type: string
  session_id?: string
  event?: {
    type: string
    delta?: { type: string; text?: string }
  }
  message?: {
    model?: string
    usage?: {
      input_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
    content?: Array<{
      type: string
      text?: string
      name?: string
      input?: unknown
      tool_use_id?: string
      content?: string | Array<{ type: string; text?: string }>
    }>
  }
  is_error?: boolean
  result?: string
  usage?: {
    input_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
  model?: string
}

function runClaudeOneShot(
  binaryPath: string,
  input: OneShotInput,
  taskProgress?: TaskProgressService | null,
): Promise<OneShotResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--output-format',
      'json',
      '--dangerously-skip-permissions',
      '--model',
      input.modelId,
    ]
    const child = spawn(binaryPath, args, {
      cwd: input.workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    const progress = createTaskProgressEmitter(input.requestId, taskProgress)
    progress?.started()

    let stdout = ''
    let stderr = ''
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      progress?.settled('timeout')
      reject(new Error('claude oneShot timed out'))
    }, input.timeoutMs ?? 20000)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      progress?.stdoutChunk(chunk.length)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      progress?.stderrChunk(chunk.length)
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      progress?.settled('error')
      reject(err)
    })

    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (code !== 0) {
        progress?.settled('error')
        reject(
          new Error(
            `claude oneShot exited with code ${code}: ${stderr.trim() || 'no stderr'}`,
          ),
        )
        return
      }
      try {
        const parsed = JSON.parse(stdout) as { result?: unknown }
        const text = typeof parsed.result === 'string' ? parsed.result : ''
        progress?.settled('ok')
        resolve({ text })
      } catch (err) {
        progress?.settled('error')
        reject(
          err instanceof Error
            ? err
            : new Error('failed to parse claude oneShot output'),
        )
      }
    })

    if (child.stdin) {
      child.stdin.write(input.prompt + '\n')
      child.stdin.end()
    }
  })
}

export class ClaudeCodeProvider implements Provider {
  id = 'claude-code'
  name = 'Claude Code'
  supportsContinuation = true
  private readonly skillsService = new ClaudeCodeSkillsService()

  constructor(
    private binaryPath: string,
    private taskProgress: TaskProgressService | null = null,
  ) {}

  async describe(): Promise<ProviderDescriptor> {
    return buildClaudeDescriptor()
  }

  async oneShot(input: OneShotInput): Promise<OneShotResult> {
    return runClaudeOneShot(this.binaryPath, input, this.taskProgress)
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
    let stopped = false
    let claudeSessionId: string | null = config.continuationToken
    let assistantTextBuffer = ''
    let assistantMessageItemId: string | null = null
    let currentTurnHasAssistantText = false
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
    let telemetrySinkPromise: Promise<ClaudeSkillTelemetrySink | null> | null =
      null
    let latestSkillInvocationTarget: {
      userMessageItemId: string
      skillSelections: SkillSelection[]
    } | null = null
    let clearSkillInvocationTargetTimer: ReturnType<typeof setTimeout> | null =
      null
    let sawTurnOutput = false
    let stderrBuffer = ''

    function emitDelta(delta: SessionDelta): void {
      listeners.delta.forEach((cb) => cb(delta))
    }

    const sessionEmitter = new ProviderSessionEmitter({
      providerId: 'claude-code',
      emitDelta,
      now,
    })

    function setStatus(status: SessionStatus): void {
      listeners.status.forEach((cb) => cb(status))
      sessionEmitter.patchSession({ status })
      if (status === 'failed') {
        disposeTelemetrySink()
      }
    }

    function setAttention(attention: AttentionState): void {
      listeners.attention.forEach((cb) => cb(attention))
      sessionEmitter.patchSession({ attention })
    }

    function setContinuationToken(token: string): void {
      if (claudeSessionId === token) {
        return
      }

      claudeSessionId = token
      listeners.continuationToken.forEach((cb) => cb(token))
      sessionEmitter.patchSession({ continuationToken: token })
    }

    function setContextWindow(contextWindow: SessionContextWindow): void {
      listeners.contextWindow.forEach((cb) => cb(contextWindow))
      sessionEmitter.patchSession({ contextWindow })
    }

    let lastActivity: ActivitySignal = null
    function setActivity(activity: ActivitySignal): void {
      if (activity === lastActivity) return
      lastActivity = activity
      listeners.activity.forEach((cb) => cb(activity))
      sessionEmitter.patchSession({ activity })
    }

    function clearSkillInvocationTargetSoon(): void {
      if (clearSkillInvocationTargetTimer) {
        clearTimeout(clearSkillInvocationTargetTimer)
      }
      clearSkillInvocationTargetTimer = setTimeout(() => {
        latestSkillInvocationTarget = null
        clearSkillInvocationTargetTimer = null
      }, 30_000)
    }

    function trackSkillInvocationTarget(
      userMessageItemId: string | null,
      skillSelections: SkillSelection[] | undefined,
    ): void {
      if (
        !userMessageItemId ||
        !skillSelections ||
        skillSelections.length === 0
      ) {
        return
      }

      latestSkillInvocationTarget = {
        userMessageItemId,
        skillSelections,
      }
      clearSkillInvocationTargetSoon()
    }

    function disposeTelemetrySink(): void {
      if (!telemetrySinkPromise) {
        return
      }

      void telemetrySinkPromise
        .then((sink) => sink?.dispose())
        .catch(() => {
          // Telemetry shutdown is best-effort.
        })
      telemetrySinkPromise = null
    }

    function confirmSkillActivation(event: ClaudeSkillActivationEvent): void {
      const target = latestSkillInvocationTarget
      if (!target || !isConcreteClaudeSkillName(event.skillName)) {
        return
      }

      let changed = false
      const updatedSelections = target.skillSelections.map((selection) => {
        if (
          selection.providerId === 'claude-code' &&
          selection.name === event.skillName &&
          selection.status !== 'confirmed'
        ) {
          changed = true
          return {
            ...selection,
            status: 'confirmed' as const,
          }
        }
        return selection
      })

      if (!changed) {
        return
      }

      latestSkillInvocationTarget = {
        userMessageItemId: target.userMessageItemId,
        skillSelections: updatedSelections,
      }
      clearSkillInvocationTargetSoon()
      sessionEmitter.patchMessage(target.userMessageItemId, {
        skillSelections: updatedSelections,
      })
    }

    function getTelemetrySink(): Promise<ClaudeSkillTelemetrySink | null> {
      telemetrySinkPromise ??= startClaudeSkillTelemetrySink({
        onSkillActivated: confirmSkillActivation,
      })
      return telemetrySinkPromise
    }

    function refreshContextWindowFromLogs(): void {
      if (!claudeSessionId) {
        return
      }

      const contextWindow = readClaudeLoggedContextWindow({
        sessionId: claudeSessionId,
        workingDirectory: config.workingDirectory,
        fallbackModel: config.model,
      })

      if (contextWindow) {
        setContextWindow(contextWindow)
      }
    }

    function flushAssistantBuffer(): void {
      if (assistantTextBuffer) {
        const timestamp = now()
        if (assistantMessageItemId) {
          sessionEmitter.patchMessage(assistantMessageItemId, {
            text: assistantTextBuffer,
            state: 'complete',
            updatedAt: timestamp,
          })
        } else {
          assistantMessageItemId = sessionEmitter.addAssistantMessage({
            text: assistantTextBuffer,
            state: 'complete',
            timestamp,
          })
        }
        assistantTextBuffer = ''
        assistantMessageItemId = null
        currentTurnHasAssistantText = true
        sawTurnOutput = true
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
        isMissingContinuationError(message, [
          'session',
          'resume',
          'conversation',
        ])
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
      const recoveryEntry = buildContinuationRecoveryEntry('Claude Code', now())
      sessionEmitter.addNote({
        text: recoveryEntry.text,
        level: recoveryEntry.level,
        timestamp: recoveryEntry.timestamp,
      })
      claudeSessionId = null
      currentTurn = null
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
      void startTurn(recoveryTurn.message, recoveryTurn.attachments, {
        skillSelections: recoveryTurn.skillSelections,
        userMessageItemId: recoveryTurn.userMessageItemId,
        emitUserEntry: false,
        allowContinuationRecovery: false,
      })
      return true
    }

    function getSignificantStderr(): string {
      return stderrBuffer
        .split('\n')
        .filter((line) => line.trim() && !line.includes('DEBUG'))
        .join('\n')
        .trim()
    }

    function handleEvent(data: unknown): void {
      if (stopped) return
      const event = data as ClaudeStreamEvent
      const previousActivity = lastActivity
      const activityDelta = deriveClaudeActivity(data, previousActivity)
      if (activityDelta !== 'keep') {
        setActivity(activityDelta)
        if (
          activityDelta === 'compacting' &&
          previousActivity !== 'compacting'
        ) {
          sessionEmitter.addNote({
            text: 'Compacting context...',
            level: 'info',
            providerEventType: 'compaction',
          })
        } else if (
          previousActivity === 'compacting' &&
          activityDelta !== 'compacting'
        ) {
          sessionEmitter.addNote({
            text: 'Compaction complete',
            level: 'info',
            providerEventType: 'compaction',
          })
        }
      }
      if (event.session_id) {
        setContinuationToken(event.session_id)
      }
      const contextWindow =
        deriveClaudeContextWindow(event) ??
        deriveClaudeEstimatedContextWindow(event, config.model)
      if (contextWindow) {
        setContextWindow(contextWindow)
      }

      // Skip non-essential event types
      if (event.type === 'rate_limit_event') return

      switch (event.type) {
        case 'system': {
          // Skip hook events — they're internal
          const rawEvent = event as unknown as Record<string, unknown>
          const subtype = rawEvent.subtype as string | undefined
          if (
            subtype === 'hook_started' ||
            subtype === 'hook_response' ||
            subtype === 'rate_limit_event'
          ) {
            break
          }
          if (subtype === 'init' && event.session_id) {
            const isNewSession = claudeSessionId !== event.session_id
            setContinuationToken(event.session_id)
            if (!isNewSession) {
              break
            }
            sessionEmitter.addNote({
              text: 'Session started',
              level: 'info',
            })
          }
          break
        }

        case 'stream_event':
          sawTurnOutput = true
          if (
            event.event?.type === 'content_block_delta' &&
            event.event.delta?.type === 'text_delta' &&
            event.event.delta?.text
          ) {
            assistantTextBuffer += event.event.delta.text
            if (!assistantMessageItemId) {
              assistantMessageItemId = sessionEmitter.addAssistantMessage({
                text: assistantTextBuffer,
                state: 'streaming',
                providerEventType: 'stream_event',
              })
            } else {
              sessionEmitter.patchMessage(assistantMessageItemId, {
                text: assistantTextBuffer,
                state: 'streaming',
              })
            }
          }
          break

        case 'assistant': {
          sawTurnOutput = true
          // If we already streamed text via stream_events, flush that
          // and skip text blocks in the assistant message (they're duplicates)
          const hadStreamedText = assistantTextBuffer.length > 0
          flushAssistantBuffer()
          if (event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'tool_use' && block.name) {
                sessionEmitter.addToolCall({
                  toolName: block.name,
                  inputText:
                    typeof block.input === 'string'
                      ? block.input
                      : JSON.stringify(block.input, null, 2),
                  providerEventType: 'tool_use',
                })
              } else if (
                block.type === 'text' &&
                block.text &&
                !hadStreamedText &&
                !currentTurnHasAssistantText
              ) {
                sessionEmitter.addAssistantMessage({
                  text: block.text,
                  state: 'complete',
                })
                currentTurnHasAssistantText = true
              }
            }
          }
          break
        }

        case 'user':
          sawTurnOutput = true
          if (event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'tool_result') {
                const resultText =
                  typeof block.content === 'string'
                    ? block.content
                    : Array.isArray(block.content)
                      ? block.content
                          .filter((c) => c.type === 'text')
                          .map((c) => c.text)
                          .join('\n')
                      : 'Done'
                sessionEmitter.addToolResult({
                  outputText: resultText,
                  providerEventType: 'tool_result',
                })
              }
            }
          }
          break

        case 'result':
          sawTurnOutput = true
          flushAssistantBuffer()
          refreshContextWindowFromLogs()
          if (event.is_error) {
            if (shouldRecoverFromMessage(event.result)) {
              scheduleContinuationRecovery()
              break
            }
            sessionEmitter.addNote({
              text: `Error: ${event.result ?? 'Unknown error'}`,
              level: 'error',
            })
            setStatus('failed')
            setAttention('failed')
            currentTurn = null
          } else {
            if (!currentTurnHasAssistantText && event.result?.trim()) {
              sessionEmitter.addAssistantMessage({
                text: event.result,
                state: 'complete',
              })
            }
            setStatus('completed')
            setAttention('finished')
            currentTurn = null
          }
          break
      }
    }

    async function loadAttachmentParts(
      attachments: Attachment[] | undefined,
    ): Promise<ClaudeMessagePart[]> {
      if (!attachments || attachments.length === 0) return []
      const parts: ClaudeMessagePart[] = []
      for (const att of attachments) {
        const buf = await fs.readFile(att.storagePath)
        parts.push({
          kind: att.kind,
          mimeType: att.mimeType,
          filename: att.filename,
          bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
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
          providerId: 'claude-code',
          providerName: 'Claude Code',
          catalog,
          selections,
          syntax: 'claude-slash',
          text,
        })
      } catch (err) {
        return failedNativeSkillInvocation({
          providerName: 'Claude Code',
          selections,
          error: err,
        })
      }
    }

    function addSkillInvocationFailureNote(
      resolution: Extract<NativeSkillInvocationResolution, { ok: false }>,
    ): void {
      sessionEmitter.addNote({
        text: `Claude Code skill ${resolution.status}: ${resolution.message}`,
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

      if (
        latestSkillInvocationTarget?.userMessageItemId === userMessageItemId
      ) {
        latestSkillInvocationTarget = {
          userMessageItemId,
          skillSelections: updatedSelections,
        }
        clearSkillInvocationTargetSoon()
      }
      sessionEmitter.patchMessage(userMessageItemId, {
        skillSelections: updatedSelections,
      })
    }

    async function startTurn(
      message: string,
      attachments?: Attachment[],
      options?: {
        skillSelections?: SkillSelection[]
        userMessageItemId?: string | null
        emitUserEntry?: boolean
        allowContinuationRecovery?: boolean
      },
    ): Promise<void> {
      if (stopped || child) return

      const skillResolution = await resolveSelectedSkills(
        message,
        options?.skillSelections,
      )
      if (stopped || child) return

      const userMessageItemId =
        options?.emitUserEntry !== false
          ? sessionEmitter.addUserMessage({
              text: message,
              skillSelections: skillResolution.skillSelections,
            })
          : (options?.userMessageItemId ?? null)
      if (!skillResolution.ok) {
        addSkillInvocationFailureNote(skillResolution)
        setStatus('failed')
        setAttention('failed')
        return
      }
      trackSkillInvocationTarget(
        userMessageItemId,
        skillResolution.skillSelections,
      )
      const telemetrySink =
        skillResolution.skillSelections &&
        skillResolution.skillSelections.length > 0
          ? await getTelemetrySink()
          : null
      if (stopped || child) return

      assistantTextBuffer = ''
      assistantMessageItemId = null
      currentTurnHasAssistantText = false
      sawTurnOutput = false
      stderrBuffer = ''
      currentTurn = {
        message,
        attachments,
        skillSelections: options?.skillSelections,
        userMessageItemId,
        allowContinuationRecovery: options?.allowContinuationRecovery ?? true,
        usedContinuationToken: !!claudeSessionId,
      }
      setStatus('running')
      setAttention('none')
      setActivity(null)
      setContextWindow(
        createUnavailableContextWindow(
          'Waiting for Claude turn usage. When available, Convergence will show an estimated context value because Claude headless mode does not expose exact live context telemetry yet.',
        ),
      )

      const args = [
        '-p',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',
        '--include-partial-messages',
      ]
      if (claudeSessionId) {
        args.push('--resume', claudeSessionId)
      }
      if (config.model?.trim()) {
        args.push('--model', config.model.trim())
      }
      if (config.effort?.trim()) {
        args.push('--effort', config.effort.trim())
      }

      child = spawn(binaryPath, args, {
        cwd: config.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...(telemetrySink?.env ?? {}),
        },
      })

      if (child.stdout) {
        parseJsonLines(child.stdout, handleEvent, (err) => {
          if (!stopped) {
            sessionEmitter.addNote({
              text: `Stream error: ${err.message}`,
              level: 'error',
            })
          }
        })
      }

      if (child.stderr) {
        child.stderr.on('data', (chunk: Buffer) => {
          stderrBuffer += chunk.toString()
        })
        child.stderr.on('end', () => {
          if (stopped) {
            return
          }
          const significant = getSignificantStderr()
          if (shouldRecoverFromMessage(significant)) {
            scheduleContinuationRecovery()
            return
          }
          if (significant && !pendingRecoveryTurn) {
            sessionEmitter.addNote({
              text: significant,
              level: 'info',
            })
          }
        })
      }

      const stdin = child.stdin
      if (stdin) {
        loadAttachmentParts(attachments)
          .then((parts) => {
            if (stopped || stdin.destroyed) return
            const line = buildClaudeUserMessageLine({
              text: skillResolution.promptText,
              parts,
            })
            stdin.write(line + '\n')
            if (userMessageItemId) {
              patchUserMessageSkills(
                userMessageItemId,
                skillResolution.skillSelections,
                'sent',
              )
            }
            stdin.end()
          })
          .catch((err) => {
            if (stopped) return
            if (userMessageItemId) {
              patchUserMessageSkills(
                userMessageItemId,
                skillResolution.skillSelections,
                'failed',
              )
            }
            sessionEmitter.addNote({
              text: `Failed to send attachments: ${err instanceof Error ? err.message : String(err)}`,
              level: 'error',
            })
            setStatus('failed')
            setAttention('failed')
            try {
              stdin.end()
            } catch {
              // ignore
            }
          })
      }

      child.on('exit', (code) => {
        if (stopped) return
        flushAssistantBuffer()
        refreshContextWindowFromLogs()
        const significant = getSignificantStderr()
        if (
          code !== 0 &&
          code !== null &&
          (shouldRecoverFromMessage(significant) ||
            (canRecoverContinuation() && !sawTurnOutput))
        ) {
          scheduleContinuationRecovery()
        }
        child = null
        if (maybeRestartRecoveredTurn()) {
          return
        }
        if (code !== 0 && code !== null) {
          sessionEmitter.addNote({
            text: `Process exited with code ${code}`,
            level: 'error',
            timestamp: now(),
          })
          setStatus('failed')
          setAttention('failed')
          currentTurn = null
        }
      })

      child.on('error', (err) => {
        if (stopped) return
        sessionEmitter.addNote({
          text: `Process error: ${err.message}`,
          level: 'error',
          timestamp: now(),
        })
        setStatus('failed')
        setAttention('failed')
        child = null
        currentTurn = null
      })
    }

    // Spawn after a tick so listeners can be attached
    setTimeout(() => {
      void startTurn(config.initialMessage, config.initialAttachments, {
        skillSelections: config.initialSkillSelections,
      })
    }, 10)

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
        if (claudeSessionId) {
          cb(claudeSessionId)
        }
      },
      onContextWindowChange: (cb) => {
        listeners.contextWindow.push(cb)
      },
      onActivityChange: (cb) => {
        listeners.activity.push(cb)
      },
      sendMessage: (text, attachments, skillSelections) => {
        void startTurn(text, attachments, { skillSelections })
      },
      approve: () => {
        // Using --dangerously-skip-permissions, no approvals needed
      },
      deny: () => {
        // Using --dangerously-skip-permissions, no approvals needed
      },
      stop: () => {
        stopped = true
        disposeTelemetrySink()
        if (clearSkillInvocationTargetTimer) {
          clearTimeout(clearSkillInvocationTargetTimer)
          clearSkillInvocationTargetTimer = null
        }
        if (child) {
          child.kill('SIGTERM')
          setTimeout(() => {
            if (child && !child.killed) {
              child.kill('SIGKILL')
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
