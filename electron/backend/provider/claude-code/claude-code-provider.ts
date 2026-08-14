import { spawn, type ChildProcess } from 'child_process'
import { promises as fs } from 'fs'
import type {
  InteractionResponse,
  SessionDelta,
} from '../../session/conversation-item.types'
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
  ProviderContextManagementInput,
  ProviderContextManagementResult,
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
import {
  noopDebugSink,
  type ProviderDebugSink,
} from '../../provider-debug/provider-debug-sink'
import type {
  ProviderDebugChannel,
  ProviderDebugEntry,
} from '../../provider-debug/provider-debug.types'
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
import {
  buildClaudeAskUserQuestionHookResponse,
  buildClaudeAskUserQuestionHookSettings,
  buildClaudeAskUserQuestionRequest,
  buildClaudeExitPlanModeHookResponse,
  buildClaudeExitPlanModeRequest,
  CLAUDE_DEFERRED_TOOL_USE_MIN_VERSION,
  normalizeClaudeDeferredToolUse,
  supportsClaudeDeferredToolUseVersion,
  type ClaudeDeferredToolHookResponse,
  type PendingClaudeDeferredToolUse,
} from './claude-ask-user-question.pure'
import { resolveClaudeCodePermissionMode } from '../session-permissions.pure'
import { resolveClaudeAccountEnv } from '../../provider-account/provider-account-env.service'
import type { ClaudeAccountEnvTarget } from '../../provider-account/provider-account-env.pure'
import { selectTurnAccountSnapshot } from '../../provider-account/provider-account-resolution.pure'
import {
  describeMcpAuthorizationNote,
  matchClaudeMcpAuthFailure,
} from '../../provider-account/provider-account-mcp.pure'

function now(): string {
  return new Date().toISOString()
}

interface ClaudeStreamEvent {
  type: string
  session_id?: string
  event?: {
    type: string
    delta?: { type: string; text?: string; thinking?: string }
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
      thinking?: string
      name?: string
      input?: unknown
      tool_use_id?: string
      content?: string | Array<{ type: string; text?: string }>
    }>
  }
  is_error?: boolean
  result?: string
  stop_reason?: string
  deferred_tool_use?: unknown
  usage?: {
    input_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
  model?: string
}

async function runClaudeOneShot(
  binaryPath: string,
  input: OneShotInput,
  taskProgress?: TaskProgressService | null,
  account: ClaudeAccountEnvTarget | null = null,
): Promise<OneShotResult> {
  // Session naming, fork summarisation, analytics, space synthesis and guided
  // review all reach Claude through here, so this one resolve scopes every
  // one-shot rather than each caller spending the ambient default account.
  const env = await resolveClaudeAccountEnv({
    account,
    workingDirectory: input.workingDirectory,
  })

  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--output-format',
      'json',
      '--permission-mode',
      resolveClaudeCodePermissionMode(input.permissionConfig),
      '--model',
      input.modelId,
    ]
    if (input.effort) {
      args.push('--effort', input.effort)
    }
    const child = spawn(binaryPath, args, {
      cwd: input.workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
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

/**
 * Turns a recorded account id into the directories that decide which credential
 * serves a process. Injected rather than imported so the provider never reaches
 * into the database, and so tests can drive selection without one.
 *
 * Throws for an account that is missing or disabled — failing loudly beats
 * silently spending a different subscription.
 */
export type ClaudeAccountLookup = (
  accountId: string | null | undefined,
) => ClaudeAccountEnvTarget | null

const noAccountLookup: ClaudeAccountLookup = () => null

/** Resolves an account id to something a person recognises — usually the email. */
export type ClaudeAccountLabelLookup = (
  accountId: string | null,
) => string | null

export class ClaudeCodeProvider implements Provider {
  id = 'claude-code'
  name = 'Claude Code'
  supportsContinuation = true
  private readonly skillsService = new ClaudeCodeSkillsService()

  constructor(
    private binaryPath: string,
    private taskProgress: TaskProgressService | null = null,
    private debugSink: ProviderDebugSink = noopDebugSink,
    private version: string | null = null,
    private accountLookup: ClaudeAccountLookup = noAccountLookup,
    /**
     * Names the account a turn ran as, for the dirty-reconnect note (PA11).
     * "Linear needs authentication" is ambiguous with several accounts on one
     * machine — the connector may be fine under yesterday's.
     */
    private accountLabelLookup: ClaudeAccountLabelLookup = () => null,
    /**
     * False where no browser handoff is possible. The note then says so rather
     * than offering an action that would appear to do nothing.
     */
    private canOpenBrowser: boolean = true,
  ) {}

  async describe(): Promise<ProviderDescriptor> {
    return buildClaudeDescriptor()
  }

  async oneShot(input: OneShotInput): Promise<OneShotResult> {
    return runClaudeOneShot(
      this.binaryPath,
      input,
      this.taskProgress,
      this.accountLookup(input.providerAccountId),
    )
  }

  async manageContext(
    config: SessionStartConfig,
    input: ProviderContextManagementInput,
  ): Promise<ProviderContextManagementResult> {
    if (input.kind !== 'compact') {
      throw new Error(`Unsupported Claude context action: ${input.kind}`)
    }
    const continuationToken = config.continuationToken?.trim()
    if (!continuationToken) {
      throw new Error('Claude context compaction requires a continuation token')
    }

    const args = [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode',
      resolveClaudeCodePermissionMode(config.permissionConfig),
      '--resume',
      continuationToken,
    ]
    if (config.model?.trim()) args.push('--model', config.model.trim())
    if (config.effort?.trim()) args.push('--effort', config.effort.trim())

    const env = await resolveClaudeAccountEnv({
      account: this.accountLookup(config.providerAccountId),
      workingDirectory: config.workingDirectory,
    })

    const child = spawn(this.binaryPath, args, {
      cwd: config.workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    })
    if (!child.stdin || !child.stdout) {
      child.kill('SIGTERM')
      throw new Error('Claude Code did not expose stdio pipes')
    }

    let sawCompaction = false
    let resultError: string | null = null
    let parseError: Error | null = null
    let previousActivity: ActivitySignal = null
    parseJsonLines(
      child.stdout,
      (event) => {
        const activity = deriveClaudeActivity(event, previousActivity)
        if (activity === 'compacting') sawCompaction = true
        if (activity !== 'keep') previousActivity = activity
        if (
          event &&
          typeof event === 'object' &&
          (event as { type?: unknown }).type === 'result' &&
          (event as { is_error?: unknown }).is_error === true
        ) {
          const result = (event as { result?: unknown }).result
          resultError =
            typeof result === 'string' ? result : 'Claude compaction failed'
        }
      },
      (error) => {
        parseError = error
      },
    )

    const completion = new Promise<void>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code) => {
        if (parseError) return reject(parseError)
        if (code !== 0) {
          return reject(
            new Error(`Claude context compaction exited with code ${code}`),
          )
        }
        if (resultError) return reject(new Error(resultError))
        if (!sawCompaction) {
          return reject(
            new Error(
              'The installed Claude Code CLI did not report compaction support in headless mode',
            ),
          )
        }
        resolve()
      })
    })

    const command = input.instructions?.trim()
      ? `/compact ${input.instructions.trim()}`
      : '/compact'
    child.stdin.write(
      buildClaudeUserMessageLine({ text: command, parts: [] }) + '\n',
    )
    child.stdin.end()

    let timeout: ReturnType<typeof setTimeout> | null = null
    try {
      await Promise.race([
        completion,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            child.kill('SIGTERM')
            reject(new Error('Claude context compaction timed out'))
          }, 120_000)
          timeout.unref?.()
        }),
      ])
      return {
        kind: 'compact',
        contextWindow: createUnavailableContextWindow(
          'Context compacted. Claude will report an updated estimate after the next turn.',
        ),
      }
    } finally {
      if (timeout) clearTimeout(timeout)
      if (!child.killed) child.kill('SIGTERM')
    }
  }

  start(config: SessionStartConfig): SessionHandle {
    const binaryPath = this.binaryPath
    const skillsService = this.skillsService
    const debugSink = this.debugSink
    const claudeCodeVersion = this.version
    const accountLookup = this.accountLookup
    const accountLabelLookup = this.accountLabelLookup
    const canOpenBrowser = this.canOpenBrowser
    /** Servers already reported this turn, so one broken connector says it once. */
    const mcpAuthNotedServers = new Set<string>()
    const sessionId = config.sessionId
    const listeners = {
      delta: [] as ((delta: SessionDelta) => void)[],
      status: [] as ((status: SessionStatus) => void)[],
      attention: [] as ((attention: AttentionState) => void)[],
      continuationToken: [] as ((token: string) => void)[],
      contextWindow: [] as ((contextWindow: SessionContextWindow) => void)[],
      activity: [] as ((activity: ActivitySignal) => void)[],
      heartbeat: [] as (() => void)[],
    }

    function fireHeartbeat(): void {
      listeners.heartbeat.forEach((cb) => cb())
    }

    function recordDebug(
      channel: ProviderDebugChannel,
      partial: Omit<
        ProviderDebugEntry,
        'sessionId' | 'providerId' | 'at' | 'channel'
      >,
    ): void {
      debugSink.record({
        sessionId,
        providerId: 'claude-code',
        at: Date.now(),
        channel,
        ...partial,
      })
      fireHeartbeat()
    }

    let child: ChildProcess | null = null
    let stopped = false
    let claudeSessionId: string | null = config.continuationToken
    let assistantTextBuffer = ''
    let assistantMessageItemId: string | null = null
    let thinkingBuffer = ''
    let thinkingItemId: string | null = null
    let currentTurnHasAssistantText = false
    let currentTurnHasThinkingText = false
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
    /**
     * The account serving the logical turn in flight, resolved once when the
     * turn begins and held for every process it spawns — deferred-tool answers,
     * plan approvals, recovery restarts. Re-resolving per spawn would let a
     * selection made mid-turn leak into a continuation the user believes is
     * still running on the previous account.
     */
    let currentTurnAccount: {
      /** The recorded id, so limit signals can be filed under the right account. */
      id: string | null
      target: ClaudeAccountEnvTarget | null
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
    let pendingDeferredToolUse: PendingClaudeDeferredToolUse | null = null
    let warnedUnsupportedDeferredToolUse = false

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

    function flushThinkingBuffer(): void {
      if (thinkingBuffer) {
        const timestamp = now()
        if (thinkingItemId) {
          sessionEmitter.patchThinking(thinkingItemId, {
            text: thinkingBuffer,
            state: 'complete',
            updatedAt: timestamp,
          })
        } else {
          thinkingItemId = sessionEmitter.addThinking({
            text: thinkingBuffer,
            state: 'complete',
            timestamp,
          })
        }
        thinkingBuffer = ''
        thinkingItemId = null
        currentTurnHasThinkingText = true
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

    /**
     * Files Claude's own limit reading against the account serving this turn
     * (ADR 0007, PA8). Unparseable input is dropped rather than displayed —
     * degrade, never invent — and a signal is never recorded without an account
     * scope to file it under.
     */
    /**
     * Dirty reconnection (ADR 0007, PA11).
     *
     * A connector this account has not authorized fails inside a tool result,
     * where it reads as an ordinary tool error and the turn carries on with
     * that capability quietly missing. Because MCP tokens are per credential
     * slot, the same connector may be perfectly authorized under the account
     * used yesterday — so the note names the server *and* the account, and
     * carries the action rather than telling the user to go and find it.
     *
     * Once per server per turn: a failing connector usually fails on every
     * call, and repeating the same note would bury the turn.
     */
    function noteMcpAuthFailure(text: string): void {
      const failure = matchClaudeMcpAuthFailure(text)
      if (!failure) return
      if (mcpAuthNotedServers.has(failure.serverName)) return
      mcpAuthNotedServers.add(failure.serverName)

      const accountId = currentTurnAccount?.id ?? null
      sessionEmitter.addNote({
        level: 'warning',
        text: describeMcpAuthorizationNote({
          serverName: failure.serverName,
          accountLabel: accountLabelLookup(accountId),
          canOpenBrowser,
        }),
        providerEventType: 'mcp_auth',
        action: {
          kind: 'authorize-mcp-server',
          serverName: failure.serverName,
          providerAccountId: accountId,
        },
      })
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
        // Same logical turn: this restarts work the user already asked for,
        // so it must not land on a different account than the one that
        // started it.
        continuesCurrentTurn: true,
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

      if (event.type === 'rate_limit_event') {
        // Deliberately ignored: Claude's usage surface was retired in
        // MAR-2401, so nothing reads this signal any more. It is not a
        // transcript entry either, so it stops here rather than reaching the
        // switch below.
        return
      }

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
            event.event.delta?.type === 'thinking_delta' &&
            typeof event.event.delta.thinking === 'string'
          ) {
            thinkingBuffer += event.event.delta.thinking
            if (!thinkingItemId) {
              thinkingItemId = sessionEmitter.addThinking({
                text: thinkingBuffer,
                state: 'streaming',
                providerEventType: 'stream_event',
              })
            } else {
              sessionEmitter.patchThinking(thinkingItemId, {
                text: thinkingBuffer,
                state: 'streaming',
              })
            }
          } else if (
            event.event?.type === 'content_block_delta' &&
            event.event.delta?.type === 'text_delta' &&
            event.event.delta?.text
          ) {
            flushThinkingBuffer()
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
          const hadStreamedThinking =
            currentTurnHasThinkingText || thinkingBuffer.length > 0
          let skippedStreamedThinkingBlock = false
          flushThinkingBuffer()
          flushAssistantBuffer()
          if (event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'tool_use' && block.name) {
                flushThinkingBuffer()
                sessionEmitter.addToolCall({
                  toolName: block.name,
                  inputText:
                    typeof block.input === 'string'
                      ? block.input
                      : JSON.stringify(block.input, null, 2),
                  providerEventType: 'tool_use',
                })
              } else if (block.type === 'thinking' && block.thinking) {
                if (hadStreamedThinking && !skippedStreamedThinkingBlock) {
                  skippedStreamedThinkingBlock = true
                  continue
                }
                sessionEmitter.addThinking({
                  text: block.thinking,
                  state: 'complete',
                  providerEventType: 'thinking',
                })
                currentTurnHasThinkingText = true
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
                noteMcpAuthFailure(resultText)
              }
            }
          }
          break

        case 'result':
          sawTurnOutput = true
          flushThinkingBuffer()
          flushAssistantBuffer()
          refreshContextWindowFromLogs()
          if (event.stop_reason === 'tool_deferred') {
            const deferredToolUse = normalizeClaudeDeferredToolUse(
              event.deferred_tool_use,
            )
            const inputRequest = deferredToolUse
              ? (buildClaudeAskUserQuestionRequest(deferredToolUse) ??
                buildClaudeExitPlanModeRequest(deferredToolUse))
              : null

            if (inputRequest) {
              pendingDeferredToolUse =
                inputRequest.kind === 'exit-plan-mode'
                  ? {
                      kind: 'exit-plan-mode',
                      pending: inputRequest.pending,
                    }
                  : {
                      kind: 'ask-user-question',
                      pending: inputRequest.pending,
                    }
              sessionEmitter.addInputRequest({
                prompt: inputRequest.prompt,
                request: inputRequest.request,
                providerItemId: inputRequest.pending.toolUseId,
                providerEventType: 'deferred_tool_use',
              })
              setStatus('running')
              setAttention('needs-input')
              setActivity(null)
              currentTurn = null
              break
            }

            sessionEmitter.addNote({
              text: 'Claude Code deferred a tool call that Convergence could not render.',
              level: 'error',
            })
            setStatus('failed')
            setAttention('failed')
            currentTurn = null
            break
          }
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
        skipPromptInput?: boolean
        deferredToolResponse?: ClaudeDeferredToolHookResponse
        providerAccountId?: string | null
        /**
         * True for a process that continues the logical turn already in
         * flight rather than starting a new one.
         */
        continuesCurrentTurn?: boolean
      },
    ): Promise<void> {
      if (stopped || child) return

      // Resolved before any await, so a selection changing mid-turn cannot
      // land between the snapshot and the spawn that uses it.
      currentTurnAccount = selectTurnAccountSnapshot({
        continuesCurrentTurn: options?.continuesCurrentTurn === true,
        currentSnapshot: currentTurnAccount,
        resolveFresh: () => ({
          id: options?.providerAccountId ?? null,
          target: accountLookup(options?.providerAccountId),
        }),
      })

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
              attachmentIds: attachments?.length
                ? attachments.map((a) => a.id)
                : undefined,
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
      // Resolved here, alongside the other pre-spawn await, so the guard below
      // still covers every suspension point before the process starts.
      const env = await resolveClaudeAccountEnv({
        account: currentTurnAccount?.target ?? null,
        workingDirectory: config.workingDirectory,
        injections: {
          ...(telemetrySink?.env ?? {}),
          ...(options?.deferredToolResponse
            ? {
                CONVERGENCE_CLAUDE_DEFERRED_TOOL_RESPONSE: JSON.stringify(
                  options.deferredToolResponse,
                ),
              }
            : {}),
        },
      })
      if (stopped || child) return

      assistantTextBuffer = ''
      assistantMessageItemId = null
      thinkingBuffer = ''
      thinkingItemId = null
      currentTurnHasAssistantText = false
      currentTurnHasThinkingText = false
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
      const supportsDeferredToolUse =
        claudeCodeVersion === null ||
        supportsClaudeDeferredToolUseVersion(claudeCodeVersion)
      if (!supportsDeferredToolUse && !warnedUnsupportedDeferredToolUse) {
        warnedUnsupportedDeferredToolUse = true
        sessionEmitter.addNote({
          text: `Claude Code ${claudeCodeVersion} does not support deferred tool-use. AskUserQuestion and ExitPlanMode cards require Claude Code ${CLAUDE_DEFERRED_TOOL_USE_MIN_VERSION} or newer.`,
          level: 'warning',
        })
      }

      const args = [
        '-p',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose',
        '--permission-mode',
        resolveClaudeCodePermissionMode(config.permissionConfig),
        '--include-partial-messages',
      ]
      if (supportsDeferredToolUse) {
        args.push('--settings', buildClaudeAskUserQuestionHookSettings())
      }
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
        env,
      })

      if (child.stdout) {
        parseJsonLines(
          child.stdout,
          (event) => {
            const eventType =
              event && typeof event === 'object' && 'type' in event
                ? typeof (event as { type: unknown }).type === 'string'
                  ? (event as { type: string }).type
                  : undefined
                : undefined
            recordDebug('event', {
              direction: 'in',
              method: eventType,
              payload: event,
            })
            handleEvent(event)
          },
          (err) => {
            recordDebug('lifecycle', {
              direction: 'in',
              note: `stream parse error: ${err.message}`,
            })
            if (!stopped) {
              sessionEmitter.addNote({
                text: `Stream error: ${err.message}`,
                level: 'error',
              })
            }
          },
        )
      }

      if (child.stderr) {
        child.stderr.on('data', (chunk: Buffer) => {
          recordDebug('stderr', { direction: 'in', bytes: chunk.length })
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
            if (!options?.skipPromptInput) {
              stdin.write(line + '\n')
            }
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
        recordDebug('lifecycle', {
          direction: 'in',
          note: `child exited with code ${code}`,
        })
        flushThinkingBuffer()
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
        recordDebug('lifecycle', {
          direction: 'in',
          note: `child error: ${err.message}`,
        })
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
    const startTimer = setTimeout(() => {
      void startTurn(config.initialMessage, config.initialAttachments, {
        skillSelections: config.initialSkillSelections,
        providerAccountId: config.providerAccountId,
      })
    }, 10)

    function disposeRuntime(): void {
      if (stopped) return
      stopped = true
      clearTimeout(startTimer)
      disposeTelemetrySink()
      if (clearSkillInvocationTargetTimer) {
        clearTimeout(clearSkillInvocationTargetTimer)
        clearSkillInvocationTargetTimer = null
      }
      latestSkillInvocationTarget = null
      currentTurn = null
      pendingRecoveryTurn = null
      pendingDeferredToolUse = null
      assistantTextBuffer = ''
      thinkingBuffer = ''
      stderrBuffer = ''

      if (child) {
        const pending = child
        pending.kill('SIGTERM')
        const killTimer = setTimeout(() => {
          if (pending.exitCode === null && pending.signalCode === null) {
            pending.kill('SIGKILL')
          }
        }, 3000)
        killTimer.unref?.()
        child = null
      }
    }

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
      onActivityHeartbeat: (cb) => {
        listeners.heartbeat.push(cb)
      },
      sendMessage: (text, attachments, skillSelections, options) => {
        if (
          pendingDeferredToolUse &&
          options?.deliveryMode === 'answer' &&
          claudeSessionId
        ) {
          const pending = pendingDeferredToolUse
          pendingDeferredToolUse = null
          const interactionResponse = options.interactionResponse as
            | InteractionResponse
            | undefined
          const deferredToolResponse =
            pending.kind === 'ask-user-question'
              ? buildClaudeAskUserQuestionHookResponse(
                  pending.pending,
                  interactionResponse,
                  text,
                )
              : buildClaudeExitPlanModeHookResponse(
                  pending.pending,
                  interactionResponse,
                  text,
                )
          void startTurn('', undefined, {
            emitUserEntry: false,
            allowContinuationRecovery: false,
            skipPromptInput: true,
            deferredToolResponse,
            // An answer belongs to the account that asked the question, so a
            // selection made while the card was open does not apply here.
            continuesCurrentTurn: true,
          })
          return
        }

        void startTurn(text, attachments, {
          skillSelections,
          providerAccountId: options?.providerAccountId,
        })
      },
      approve: () => {
        // Claude Code permission handling is controlled at process startup.
      },
      deny: () => {
        // Claude Code permission handling is controlled at process startup.
      },
      dispose: disposeRuntime,
      stop: () => {
        if (stopped) return
        disposeRuntime()
        setStatus('failed')
        setAttention('failed')
      },
    }

    return handle
  }
}
