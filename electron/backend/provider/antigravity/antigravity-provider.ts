import { spawn, type ChildProcess } from 'child_process'
import { mkdtemp, readFile, rm, writeFile, chmod } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { SessionDelta } from '../../session/conversation-item.types'
import type { TaskProgressService } from '../../task-progress/task-progress.service'
import { createTaskProgressEmitter } from '../../task-progress/task-progress.emitter'
import type {
  ProviderDebugChannel,
  ProviderDebugEntry,
} from '../../provider-debug/provider-debug.types'
import {
  noopDebugSink,
  type ProviderDebugSink,
} from '../../provider-debug/provider-debug-sink'
import {
  failedNativeSkillInvocation,
  resolveNativeSkillInvocation,
  type NativeSkillInvocationResolution,
} from '../../skills/native-skill-invocation.pure'
import { markSkillSelectionsStatus } from '../../skills/skill-invocation.pure'
import { AntigravitySkillsService } from '../../skills/antigravity-skills.service'
import type { SkillSelection } from '../../skills/skills.types'
import {
  buildFallbackAntigravityDescriptor,
  normalizeProviderDescriptor,
} from '../provider-descriptor.pure'
import { ProviderSessionEmitter } from '../provider-session.emitter'
import type {
  ActivitySignal,
  Attachment,
  AttentionState,
  MidRunInputMode,
  OneShotInput,
  OneShotResult,
  Provider,
  ProviderDescriptor,
  SessionContextWindow,
  SessionHandle,
  SessionPermissionConfig,
  SessionStartConfig,
  SessionStatus,
} from '../provider.types'
import { resolveAntigravityModelLabel } from './antigravity-models.pure'
import { extractAntigravityPrintDelta } from './antigravity-output.pure'
import { AntigravitySettingsService } from './antigravity-settings.service'
import {
  mapAntigravityContextWindow,
  parseAntigravityStatusLineJson,
  type AntigravityStatusLineSnapshot,
} from './antigravity-statusline.pure'
import {
  AntigravityTrajectoryTelemetryService,
  type AntigravityTrajectoryTelemetry,
} from './antigravity-trajectory.service'
import type { AntigravityTrajectoryToolEvent } from './antigravity-trajectory.pure'

interface AntigravityTemporarySettingsService {
  withTemporarySettings<T>(
    patch: {
      modelLabel?: string | null
      statusLineCommand?: string | null
    },
    operation: () => Promise<T>,
  ): Promise<T>
}

interface AntigravityPrintInput {
  binaryPath: string
  prompt: string
  workingDirectory: string
  continuationToken?: string | null
  timeoutMs?: number | null
  requestId?: string
  permissionConfig?: SessionPermissionConfig
  taskProgress?: TaskProgressService | null
  statusCapturePath?: string | null
  onStdoutChunk?: (chunk: Buffer) => void
  onChild?: (child: ChildProcess) => void
  onStatusSnapshot?: (snapshot: AntigravityStatusLineSnapshot) => void
}

interface AntigravityPrintResult {
  stdout: string
  stderr: string
}

interface AntigravityStatusLineCapture {
  command: string
  capturePath: string
  cleanup: () => Promise<void>
}

function now(): string {
  return new Date().toISOString()
}

function formatGoDuration(ms: number): string {
  return `${Math.max(1, Math.ceil(ms / 1000))}s`
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function buildAntigravityPrintArgs(input: {
  continuationToken?: string | null
  timeoutMs?: number | null
  permissionConfig?: SessionPermissionConfig
}): string[] {
  const args = ['--print']

  if (input.continuationToken?.trim()) {
    args.push('--conversation', input.continuationToken.trim())
  }

  if (input.timeoutMs && input.timeoutMs > 0) {
    args.push('--print-timeout', formatGoDuration(input.timeoutMs))
  }

  if (input.permissionConfig?.preset === 'yolo') {
    args.push('--dangerously-skip-permissions')
  } else {
    args.push('--sandbox')
  }

  return args
}

function extractJsonObjectCandidate(line: string): string | null {
  const start = line.indexOf('{')
  const end = line.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return line.slice(start, end + 1)
}

function parseStatusLineSnapshots(
  raw: string,
): AntigravityStatusLineSnapshot[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const direct = parseAntigravityStatusLineJson(line)
      if (direct) return direct
      const candidate = extractJsonObjectCandidate(line)
      return candidate ? parseAntigravityStatusLineJson(candidate) : null
    })
    .filter(
      (snapshot): snapshot is AntigravityStatusLineSnapshot =>
        snapshot !== null,
    )
}

async function readLatestStatusLineSnapshot(
  capturePath: string,
): Promise<AntigravityStatusLineSnapshot | null> {
  try {
    const raw = await readFile(capturePath, 'utf8')
    const snapshots = parseStatusLineSnapshots(raw)
    return snapshots[snapshots.length - 1] ?? null
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return null
    }
    throw error
  }
}

async function createStatusLineCapture(): Promise<AntigravityStatusLineCapture> {
  const directory = await mkdtemp(join(tmpdir(), 'convergence-antigravity-'))
  const capturePath = join(directory, 'statusline.jsonl')
  const scriptPath = join(directory, 'capture-statusline.sh')
  const script = `#!/bin/sh
if [ -n "$CONVERGENCE_ANTIGRAVITY_STATUS_FILE" ]; then
  if [ -t 0 ]; then
    exit 0
  fi
  IFS= read -r payload || payload=""
  if [ -n "$payload" ]; then
    printf '%s\\n' "$payload" >> "$CONVERGENCE_ANTIGRAVITY_STATUS_FILE"
  fi
fi
exit 0
`
  await writeFile(scriptPath, script, 'utf8')
  await chmod(scriptPath, 0o700)

  return {
    capturePath,
    command: `CONVERGENCE_ANTIGRAVITY_STATUS_FILE=${shellQuote(
      capturePath,
    )} ${shellQuote(scriptPath)}`,
    cleanup: async () => {
      await rm(directory, { recursive: true, force: true })
    },
  }
}

async function buildPromptWithTextAttachments(
  text: string,
  attachments: Attachment[] | undefined,
): Promise<string> {
  if (!attachments || attachments.length === 0) return text

  const blocks: string[] = []
  for (const attachment of attachments) {
    if (attachment.kind !== 'text') {
      throw new Error(
        'Antigravity CLI only supports text attachments in Convergence.',
      )
    }
    const content = await readFile(attachment.storagePath, 'utf8')
    blocks.push(
      `<attachment filename="${attachment.filename}" mimeType="${attachment.mimeType}">\n${content}\n</attachment>`,
    )
  }

  return `${text.trimEnd()}\n\n<attachments>\n${blocks.join('\n\n')}\n</attachments>`
}

function resolveSelectedModelLabel(input: {
  modelId: string | null | undefined
  effortId?: OneShotInput['effort']
}): string {
  return (
    resolveAntigravityModelLabel({
      modelId: input.modelId,
      effortId: input.effortId ?? null,
    }) ??
    resolveAntigravityModelLabel({
      modelId: 'gemini-3.5-flash',
      effortId: null,
    }) ??
    'Gemini 3.5 Flash'
  )
}

function runAntigravityPrint(
  input: AntigravityPrintInput,
): Promise<AntigravityPrintResult> {
  return new Promise((resolve, reject) => {
    const args = buildAntigravityPrintArgs({
      continuationToken: input.continuationToken,
      timeoutMs: input.timeoutMs,
      permissionConfig: input.permissionConfig,
    })
    const child = spawn(input.binaryPath, args, {
      cwd: input.workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        AGY_CLI_HIDE_ACCOUNT_INFO: '1',
      },
    })
    input.onChild?.(child)

    const progress = createTaskProgressEmitter(
      input.requestId,
      input.taskProgress,
    )
    progress?.started()

    let stdout = ''
    let stderr = ''
    let settled = false
    let lastStatusRaw = ''

    const pollStatus = async (): Promise<void> => {
      if (!input.statusCapturePath || settled) return
      try {
        const raw = await readFile(input.statusCapturePath, 'utf8')
        if (raw === lastStatusRaw) return
        lastStatusRaw = raw
        const snapshots = parseStatusLineSnapshots(raw)
        const latest = snapshots[snapshots.length - 1]
        if (latest) input.onStatusSnapshot?.(latest)
      } catch (error) {
        if (
          !error ||
          typeof error !== 'object' ||
          (error as { code?: unknown }).code !== 'ENOENT'
        ) {
          // Status-line telemetry is best-effort; process output still wins.
        }
      }
    }

    const statusPollTimer = input.statusCapturePath
      ? setInterval(() => {
          void pollStatus()
        }, 750)
      : null

    const timeout =
      input.timeoutMs && input.timeoutMs > 0
        ? setTimeout(() => {
            if (settled) return
            settled = true
            if (statusPollTimer) clearInterval(statusPollTimer)
            child.kill('SIGTERM')
            progress?.settled('timeout')
            reject(new Error('antigravity print timed out'))
          }, input.timeoutMs + 5_000)
        : null

    function settleWithError(error: Error): void {
      if (settled) return
      settled = true
      if (statusPollTimer) clearInterval(statusPollTimer)
      if (timeout) clearTimeout(timeout)
      progress?.settled('error')
      reject(error)
    }

    function settleOk(): void {
      if (settled) return
      settled = true
      if (statusPollTimer) clearInterval(statusPollTimer)
      if (timeout) clearTimeout(timeout)
      progress?.settled('ok')
      resolve({ stdout, stderr })
    }

    if (!child.stdin || !child.stdout) {
      settleWithError(new Error('antigravity print failed to open stdio'))
      return
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      progress?.stdoutChunk(chunk.length)
      input.onStdoutChunk?.(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      progress?.stderrChunk(chunk.length)
    })

    child.on('error', (error) => {
      settleWithError(error)
    })

    child.on('exit', (code) => {
      void (async () => {
        await pollStatus()
        const latestStatus = input.statusCapturePath
          ? await readLatestStatusLineSnapshot(input.statusCapturePath)
          : null
        if (latestStatus) input.onStatusSnapshot?.(latestStatus)

        if (code !== 0 && code !== null) {
          settleWithError(
            new Error(
              `antigravity print exited with code ${code}: ${
                stderr.trim() || 'no stderr'
              }`,
            ),
          )
          return
        }
        settleOk()
      })().catch((error: unknown) => {
        settleWithError(
          error instanceof Error ? error : new Error(String(error)),
        )
      })
    })

    child.stdin.write(`${input.prompt}\n`)
    child.stdin.end()
  })
}

export class AntigravityProvider implements Provider {
  id = 'antigravity'
  name = 'Antigravity CLI'
  supportsContinuation = true

  private readonly skillsService = new AntigravitySkillsService()

  constructor(
    private binaryPath: string,
    private taskProgress: TaskProgressService | null = null,
    private debugSink: ProviderDebugSink = noopDebugSink,
    private settingsService: AntigravityTemporarySettingsService = new AntigravitySettingsService(),
    private trajectoryTelemetry: AntigravityTrajectoryTelemetry = new AntigravityTrajectoryTelemetryService(),
  ) {}

  async describe(): Promise<ProviderDescriptor> {
    return normalizeProviderDescriptor(buildFallbackAntigravityDescriptor())
  }

  async oneShot(input: OneShotInput): Promise<OneShotResult> {
    const modelLabel = resolveSelectedModelLabel({
      modelId: input.modelId,
      effortId: input.effort,
    })

    const result = await this.settingsService.withTemporarySettings(
      { modelLabel },
      () =>
        runAntigravityPrint({
          binaryPath: this.binaryPath,
          prompt: input.prompt,
          workingDirectory: input.workingDirectory,
          timeoutMs: input.timeoutMs,
          requestId: input.requestId,
          permissionConfig: input.permissionConfig,
          taskProgress: this.taskProgress,
        }),
    )

    return { text: extractAntigravityPrintDelta({ stdout: result.stdout }) }
  }

  start(config: SessionStartConfig): SessionHandle {
    const binaryPath = this.binaryPath
    const taskProgress = this.taskProgress
    const debugSink = this.debugSink
    const settingsService = this.settingsService
    const trajectoryTelemetry = this.trajectoryTelemetry
    const skillsService = this.skillsService
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

    let stopped = false
    let running = false
    let continuationToken = config.continuationToken
    let previousAssistantTexts = [...(config.previousAssistantTexts ?? [])]
    let activeChild: ChildProcess | null = null
    let lastActivity: ActivitySignal = null
    const importedTrajectoryEventIds = new Set<string>()
    const trajectoryToolCallItemIds = new Map<string, string>()

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
        providerId: 'antigravity',
        at: Date.now(),
        channel,
        ...partial,
      })
      fireHeartbeat()
    }

    function emitDelta(delta: SessionDelta): void {
      listeners.delta.forEach((cb) => cb(delta))
    }

    const sessionEmitter = new ProviderSessionEmitter({
      providerId: 'antigravity',
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
      if (continuationToken === token) return
      continuationToken = token
      listeners.continuationToken.forEach((cb) => cb(token))
      sessionEmitter.patchSession({ continuationToken: token })
    }

    function setContextWindow(contextWindow: SessionContextWindow): void {
      listeners.contextWindow.forEach((cb) => cb(contextWindow))
      sessionEmitter.patchSession({ contextWindow })
    }

    function setActivity(activity: ActivitySignal): void {
      if (activity === lastActivity) return
      lastActivity = activity
      listeners.activity.forEach((cb) => cb(activity))
      sessionEmitter.patchSession({ activity })
    }

    function handleStatusSnapshot(
      snapshot: AntigravityStatusLineSnapshot,
    ): void {
      recordDebug('event', {
        direction: 'in',
        method: 'statusline',
        payload: snapshot,
      })
      if (snapshot.conversationId) {
        setContinuationToken(snapshot.conversationId)
      }
      setContextWindow(mapAntigravityContextWindow(snapshot.contextWindow))
      if (snapshot.agentState) {
        setActivity(
          /thinking|running|working|generating/i.test(snapshot.agentState)
            ? 'thinking'
            : lastActivity,
        )
      }
    }

    async function getTrajectoryBaseline(): Promise<{
      afterStepIndex: number | null
      importEnabled: boolean
    }> {
      if (!continuationToken) {
        return { afterStepIndex: null, importEnabled: true }
      }

      try {
        return {
          afterStepIndex:
            await trajectoryTelemetry.getMaxStepIndex(continuationToken),
          importEnabled: true,
        }
      } catch (error) {
        recordDebug('event', {
          direction: 'in',
          method: 'trajectory-baseline',
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
        })
        return { afterStepIndex: null, importEnabled: false }
      }
    }

    function emitTrajectoryToolEvent(
      event: AntigravityTrajectoryToolEvent,
    ): void {
      if (importedTrajectoryEventIds.has(event.providerItemId)) return
      importedTrajectoryEventIds.add(event.providerItemId)

      if (event.kind === 'tool-call') {
        const itemId = sessionEmitter.addToolCall({
          toolName: event.toolName,
          inputText: event.inputText,
          providerItemId: event.providerItemId,
          providerEventType: 'trajectory-tool-call',
        })
        if (event.toolCallId) {
          trajectoryToolCallItemIds.set(event.toolCallId, itemId)
        }
        return
      }

      sessionEmitter.addToolResult({
        toolName: event.toolName,
        outputText: event.outputText,
        relatedItemId: event.toolCallId
          ? (trajectoryToolCallItemIds.get(event.toolCallId) ?? null)
          : null,
        providerItemId: event.providerItemId,
        providerEventType: 'trajectory-tool-result',
      })
    }

    async function importTrajectoryTelemetry(
      baseline: Awaited<ReturnType<typeof getTrajectoryBaseline>>,
    ): Promise<void> {
      if (!baseline.importEnabled || !continuationToken) return

      try {
        const events = await trajectoryTelemetry.readToolEvents(
          continuationToken,
          baseline.afterStepIndex,
        )
        events.forEach(emitTrajectoryToolEvent)
        if (events.length > 0) {
          recordDebug('event', {
            direction: 'in',
            method: 'trajectory-telemetry',
            payload: { importedEvents: events.length },
          })
        }
      } catch (error) {
        recordDebug('event', {
          direction: 'in',
          method: 'trajectory-telemetry',
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
        })
      }
    }

    async function recoverTrajectoryConversationId(
      updatedAfterMs: number,
    ): Promise<void> {
      if (continuationToken) return

      try {
        const conversationId =
          await trajectoryTelemetry.findLatestConversationIdUpdatedAfter(
            updatedAfterMs,
          )
        if (!conversationId) return

        setContinuationToken(conversationId)
        recordDebug('event', {
          direction: 'in',
          method: 'trajectory-conversation-fallback',
          payload: { conversationId },
        })
      } catch (error) {
        recordDebug('event', {
          direction: 'in',
          method: 'trajectory-conversation-fallback',
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
        })
      }
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
          providerId: 'antigravity',
          providerName: 'Antigravity CLI',
          catalog,
          selections,
          syntax: 'antigravity-slash',
          text,
        })
      } catch (error) {
        return failedNativeSkillInvocation({
          providerName: 'Antigravity CLI',
          selections,
          error,
        })
      }
    }

    function patchUserMessageSkills(
      userMessageItemId: string | null,
      selections: SkillSelection[] | undefined,
      status: Parameters<typeof markSkillSelectionsStatus>[1],
    ): void {
      if (!userMessageItemId) return
      const updatedSelections = markSkillSelectionsStatus(selections, status)
      if (!updatedSelections) return
      sessionEmitter.patchMessage(userMessageItemId, {
        skillSelections: updatedSelections,
      })
    }

    function addSkillInvocationFailureNote(
      resolution: Extract<NativeSkillInvocationResolution, { ok: false }>,
    ): void {
      sessionEmitter.addNote({
        text: `Antigravity CLI skill ${resolution.status}: ${resolution.message}`,
        level: 'error',
      })
    }

    async function startTurn(
      text: string,
      attachments?: Attachment[],
      options?: {
        skillSelections?: SkillSelection[]
        userMessageItemId?: string | null
        emitUserEntry?: boolean
      },
    ): Promise<void> {
      if (stopped) return
      if (running) {
        sessionEmitter.addNote({
          text: 'Antigravity CLI is already running; send follow-up input to queue the next turn.',
          level: 'warning',
        })
        return
      }

      const skillResolution = await resolveSelectedSkills(
        text,
        options?.skillSelections,
      )
      if (stopped) return

      const userMessageItemId =
        options?.emitUserEntry !== false
          ? sessionEmitter.addUserMessage({
              text,
              skillSelections: skillResolution.skillSelections,
              attachmentIds: attachments?.length
                ? attachments.map((attachment) => attachment.id)
                : undefined,
            })
          : (options?.userMessageItemId ?? null)

      if (!skillResolution.ok) {
        addSkillInvocationFailureNote(skillResolution)
        setStatus('failed')
        setAttention('failed')
        return
      }

      running = true
      setStatus('running')
      setAttention('none')
      setActivity('thinking')
      setContextWindow(mapAntigravityContextWindow(null))

      let capture: AntigravityStatusLineCapture | null = null
      try {
        const turnStartedAt = Date.now() - 1_000
        const trajectoryBaseline = await getTrajectoryBaseline()
        const modelLabel = resolveSelectedModelLabel({
          modelId: config.model,
          effortId: config.effort,
        })
        const prompt = await buildPromptWithTextAttachments(
          skillResolution.promptText,
          attachments,
        )
        capture = await createStatusLineCapture()

        recordDebug('request', {
          direction: 'out',
          method: 'print',
          payload: {
            promptLength: prompt.length,
            attachmentCount: attachments?.length ?? 0,
            modelLabel,
            continuation: continuationToken ? 'conversation' : 'new',
          },
        })

        const result = await settingsService.withTemporarySettings(
          {
            modelLabel,
            statusLineCommand: capture.command,
          },
          () =>
            runAntigravityPrint({
              binaryPath,
              prompt,
              workingDirectory: config.workingDirectory,
              continuationToken,
              permissionConfig: config.permissionConfig,
              statusCapturePath: capture?.capturePath ?? null,
              onStatusSnapshot: handleStatusSnapshot,
              onChild: (child) => {
                activeChild = child
              },
              onStdoutChunk: (chunk) => {
                setActivity('streaming')
                recordDebug('stdout', { direction: 'in', bytes: chunk.length })
              },
              taskProgress,
            }),
        )
        if (stopped) return

        patchUserMessageSkills(
          userMessageItemId,
          skillResolution.skillSelections,
          'sent',
        )
        await recoverTrajectoryConversationId(turnStartedAt)
        await importTrajectoryTelemetry(trajectoryBaseline)
        const deltaText = extractAntigravityPrintDelta({
          stdout: result.stdout,
          previousAssistantTexts,
        })
        if (deltaText.trim()) {
          sessionEmitter.addAssistantMessage({
            text: deltaText,
            state: 'complete',
            providerEventType: 'print',
          })
          previousAssistantTexts = [...previousAssistantTexts, deltaText]
        }
        if (result.stderr.trim()) {
          sessionEmitter.addNote({
            text: result.stderr.trim(),
            level: 'info',
          })
        }
        setActivity(null)
        setStatus('completed')
        setAttention('finished')
      } catch (error) {
        if (stopped) return
        patchUserMessageSkills(
          userMessageItemId,
          skillResolution.skillSelections,
          'failed',
        )
        sessionEmitter.addNote({
          text: `Antigravity CLI failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          level: 'error',
        })
        setActivity(null)
        setStatus('failed')
        setAttention('failed')
      } finally {
        activeChild = null
        running = false
        if (capture) {
          await capture.cleanup()
        }
      }
    }

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
        if (continuationToken) cb(continuationToken)
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
        if (stopped) return
        const deliveryMode: MidRunInputMode = options?.deliveryMode ?? 'normal'
        if (deliveryMode !== 'normal') {
          sessionEmitter.addNote({
            text: `Antigravity CLI does not support ${deliveryMode} input directly. Use follow-up queueing for the next turn.`,
            level: 'warning',
          })
          return
        }
        void startTurn(text, attachments, { skillSelections })
      },
      approve: () => {
        sessionEmitter.addNote({
          text: 'Antigravity CLI approval requests are not available through Convergence yet.',
          level: 'warning',
        })
      },
      deny: () => {
        sessionEmitter.addNote({
          text: 'Antigravity CLI approval requests are not available through Convergence yet.',
          level: 'warning',
        })
      },
      stop: () => {
        stopped = true
        if (activeChild) {
          activeChild.kill('SIGTERM')
          const pending = activeChild
          setTimeout(() => {
            if (pending && !pending.killed) {
              pending.kill('SIGKILL')
            }
          }, 3000)
          activeChild = null
        }
        setActivity(null)
        setStatus('failed')
        setAttention('failed')
      },
    }

    return handle
  }
}
