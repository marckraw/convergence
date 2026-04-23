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
import { JsonRpcClient } from './jsonrpc'
import { ProviderSessionEmitter } from '../provider-session.emitter'
import {
  buildFallbackCodexDescriptor,
  normalizeProviderDescriptor,
} from '../provider-descriptor.pure'
import type {
  ProviderDescriptor,
  ProviderEffortOption,
  ProviderModelOption,
  ReasoningEffort,
} from '../provider.types'
import { deriveCodexContextWindow } from '../context-window.pure'
import {
  buildCodexThreadRecoveryEntry,
  buildTurnFailureEntry,
  isCodexThreadNotFoundError,
} from './codex-errors.pure'
import {
  buildCodexUserInput,
  partFromAttachment,
  type CodexMessagePart,
} from './codex-message.pure'
import {
  initialCodexActivityState,
  reduceCodexActivity,
  type CodexActivityState,
} from './codex-activity.pure'
import type { TaskProgressService } from '../../task-progress/task-progress.service'
import { createTaskProgressEmitter } from '../../task-progress/task-progress.emitter'

async function loadCodexParts(
  attachments: Attachment[] | undefined,
): Promise<CodexMessagePart[]> {
  if (!attachments || attachments.length === 0) return []
  const parts: CodexMessagePart[] = []
  for (const att of attachments) {
    if (att.kind === 'text') {
      const buf = await fs.readFile(att.storagePath)
      parts.push(
        partFromAttachment(
          att,
          new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
        ),
      )
    } else {
      parts.push(partFromAttachment(att))
    }
  }
  return parts
}

function now(): string {
  return new Date().toISOString()
}

function isContextCompactionItemType(itemType: string | null): boolean {
  return (
    itemType === 'contextCompaction' ||
    itemType === 'compacted' ||
    itemType === 'context_compacted'
  )
}

function runCodexOneShot(
  binaryPath: string,
  input: OneShotInput,
  taskProgress?: TaskProgressService | null,
): Promise<OneShotResult> {
  return new Promise((resolve, reject) => {
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--model',
      input.modelId,
      input.prompt,
    ]
    const child = spawn(binaryPath, args, {
      cwd: input.workingDirectory,
      stdio: ['ignore', 'pipe', 'pipe'],
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
      reject(new Error('codex oneShot timed out'))
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
            `codex oneShot exited with code ${code}: ${stderr.trim() || 'no stderr'}`,
          ),
        )
        return
      }
      progress?.settled('ok')
      resolve({ text: extractCodexExecText(stdout) })
    })
  })
}

function extractCodexExecText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  const lines = trimmed.split(/\r?\n/)
  const lastMarkerIndex = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\s*\[.*codex\s*\]\s*$/i.test(line))
    .map(({ index }) => index)
    .pop()

  if (lastMarkerIndex !== undefined) {
    return lines
      .slice(lastMarkerIndex + 1)
      .join('\n')
      .trim()
  }

  return trimmed
}

export class CodexProvider implements Provider {
  id = 'codex'
  name = 'Codex'
  supportsContinuation = true
  private descriptorPromise: Promise<ProviderDescriptor> | null = null

  constructor(
    private binaryPath: string,
    private taskProgress: TaskProgressService | null = null,
  ) {}

  describe(): Promise<ProviderDescriptor> {
    if (!this.descriptorPromise) {
      this.descriptorPromise = this.fetchDescriptor().catch(() =>
        buildFallbackCodexDescriptor(),
      )
    }

    return this.descriptorPromise
  }

  async oneShot(input: OneShotInput): Promise<OneShotResult> {
    return runCodexOneShot(this.binaryPath, input, this.taskProgress)
  }

  start(config: SessionStartConfig): SessionHandle {
    const binaryPath = this.binaryPath
    const listeners = {
      delta: [] as ((delta: SessionDelta) => void)[],
      status: [] as ((status: SessionStatus) => void)[],
      attention: [] as ((attention: AttentionState) => void)[],
      continuationToken: [] as ((token: string) => void)[],
      contextWindow: [] as ((contextWindow: SessionContextWindow) => void)[],
      activity: [] as ((activity: ActivitySignal) => void)[],
    }

    let child: ChildProcess | null = null
    let rpc: JsonRpcClient | null = null
    let stopped = false
    let threadId: string | null = config.continuationToken
    let threadReady = config.continuationToken === null
    let assistantTextBuffer = ''
    let assistantMessageItemId: string | null = null
    let resolveThreadReady: (() => void) | null = null

    // Map of pending approval request IDs (JSON-RPC id → our description)
    const pendingApprovals = new Map<number, string>()
    const pendingUserInputs = new Map<number, string[]>()

    function emitDelta(delta: SessionDelta): void {
      listeners.delta.forEach((cb) => cb(delta))
    }

    const sessionEmitter = new ProviderSessionEmitter({
      providerId: 'codex',
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
      threadReady = true
      if (threadId === token) {
        resolveThreadReady?.()
        return
      }

      threadId = token
      listeners.continuationToken.forEach((cb) => cb(token))
      sessionEmitter.patchSession({ continuationToken: token })
      resolveThreadReady?.()
    }

    function markThreadReady(): void {
      threadReady = true
      resolveThreadReady?.()
    }

    function setContextWindow(contextWindow: SessionContextWindow): void {
      listeners.contextWindow.forEach((cb) => cb(contextWindow))
      sessionEmitter.patchSession({ contextWindow })
    }

    let activityState: CodexActivityState = initialCodexActivityState()
    function applyActivity(
      input: Parameters<typeof reduceCodexActivity>[1],
    ): void {
      const { state, activity } = reduceCodexActivity(activityState, input)
      activityState = state
      if (activity !== 'keep') {
        listeners.activity.forEach((cb) => cb(activity))
        sessionEmitter.patchSession({ activity })
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
      }
    }

    function readThreadId(payload: unknown): string | null {
      if (!payload || typeof payload !== 'object') return null
      const record = payload as {
        threadId?: unknown
        thread?: { id?: unknown }
      }

      if (typeof record.threadId === 'string') {
        return record.threadId
      }

      if (typeof record.thread?.id === 'string') {
        return record.thread.id
      }

      return null
    }

    function waitForThreadId(): Promise<string> {
      if (threadId) {
        return Promise.resolve(threadId)
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolveThreadReady = null
          reject(new Error('thread/start response did not include a thread id'))
        }, 1000)

        resolveThreadReady = () => {
          clearTimeout(timeout)
          resolveThreadReady = null
          if (threadId) {
            resolve(threadId)
          } else {
            reject(
              new Error('thread/start response did not include a thread id'),
            )
          }
        }
      })
    }

    async function startFreshThread(activeRpc: JsonRpcClient): Promise<string> {
      const threadResult = await activeRpc.request('thread/start', {
        cwd: config.workingDirectory,
        approvalPolicy: 'on-request',
        sandbox: 'workspace-write',
      })

      const discoveredThreadId = readThreadId(threadResult)
      if (discoveredThreadId) {
        setContinuationToken(discoveredThreadId)
      }
      if (!threadId) {
        threadId = await waitForThreadId()
      }

      return threadId
    }

    async function resumeExistingThread(
      activeRpc: JsonRpcClient,
      continuationThreadId: string,
    ): Promise<string> {
      try {
        const threadResult = await activeRpc.request('thread/resume', {
          threadId: continuationThreadId,
          cwd: config.workingDirectory,
          approvalPolicy: 'on-request',
          sandbox: 'workspace-write',
        })

        const discoveredThreadId = readThreadId(threadResult)
        if (discoveredThreadId) {
          setContinuationToken(discoveredThreadId)
          return discoveredThreadId
        }

        markThreadReady()
        return continuationThreadId
      } catch (err) {
        if (!isCodexThreadNotFoundError(err)) {
          throw err
        }

        const recoveryEntry = buildCodexThreadRecoveryEntry(now())
        sessionEmitter.addNote({
          text: recoveryEntry.text,
          level: recoveryEntry.level,
          timestamp: recoveryEntry.timestamp,
        })

        threadId = null
        threadReady = false
        return startFreshThread(activeRpc)
      }
    }

    async function ensureThread(activeRpc: JsonRpcClient): Promise<string> {
      if (threadId) {
        if (!threadReady) {
          return resumeExistingThread(activeRpc, threadId)
        }
        return threadId
      }

      return startFreshThread(activeRpc)
    }

    async function startTurn(
      activeRpc: JsonRpcClient,
      input: ReturnType<typeof buildCodexUserInput>,
    ): Promise<void> {
      assistantTextBuffer = ''
      assistantMessageItemId = null
      const currentThreadId = await ensureThread(activeRpc)

      try {
        await activeRpc.request('turn/start', {
          threadId: currentThreadId,
          model: config.model,
          effort: config.effort,
          input,
        })
      } catch (err) {
        if (!threadId || !isCodexThreadNotFoundError(err)) {
          throw err
        }

        const recoveryEntry = buildCodexThreadRecoveryEntry(now())
        sessionEmitter.addNote({
          text: recoveryEntry.text,
          level: recoveryEntry.level,
          timestamp: recoveryEntry.timestamp,
        })
        threadId = null
        threadReady = false
        const recoveredThreadId = await startFreshThread(activeRpc)
        await activeRpc.request('turn/start', {
          threadId: recoveredThreadId,
          model: config.model,
          effort: config.effort,
          input,
        })
      }
    }

    async function initialize(
      initialMessage: string,
      initialAttachments?: Attachment[],
    ): Promise<void> {
      if (!rpc || stopped) return

      try {
        // Handshake
        await rpc.request('initialize', {
          clientInfo: {
            name: 'convergence',
            title: 'Convergence',
            version: '0.0.0',
          },
          capabilities: {
            experimentalApi: true,
          },
        })
        rpc.notify('initialized')

        // Emit user message and start turn
        sessionEmitter.addUserMessage({ text: initialMessage })
        setStatus('running')

        const parts = await loadCodexParts(initialAttachments)
        await startTurn(
          rpc,
          buildCodexUserInput({ text: initialMessage, parts }),
        )
      } catch (err) {
        if (stopped) return
        sessionEmitter.addNote({
          text: `Initialization failed: ${err instanceof Error ? err.message : String(err)}`,
          level: 'error',
        })
        setStatus('failed')
        setAttention('failed')
      }
    }

    function spawnServer(
      initialMessage: string,
      initialAttachments?: Attachment[],
    ): void {
      if (stopped) return
      if (child || rpc) return

      child = spawn(binaryPath, ['app-server'], {
        cwd: config.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      if (!child.stdin || !child.stdout) {
        sessionEmitter.addNote({
          text: 'Failed to open stdio',
          level: 'error',
        })
        setStatus('failed')
        setAttention('failed')
        return
      }

      rpc = new JsonRpcClient(child.stdin, child.stdout)

      // Handle notifications (no response needed)
      rpc.onNotification((method, params) => {
        if (stopped) return
        applyActivity({ kind: 'notification', method, params })
        const p = params as Record<string, unknown>

        switch (method) {
          case 'thread/started':
            {
              const discoveredThreadId = readThreadId(params)
              if (discoveredThreadId) {
                setContinuationToken(discoveredThreadId)
              } else {
                resolveThreadReady?.()
              }
            }
            break

          case 'turn/started':
            setStatus('running')
            setAttention('none')
            break

          case 'thread/tokenUsage/updated': {
            const contextWindow = deriveCodexContextWindow(
              (p.tokenUsage ?? p.usage ?? params) as {
                last?: { inputTokens?: unknown; cachedInputTokens?: unknown }
                modelContextWindow?: unknown
              },
            )
            if (contextWindow) {
              setContextWindow(contextWindow)
            }
            break
          }

          case 'item/agentMessage/delta':
            if (typeof p.delta === 'string') {
              assistantTextBuffer += p.delta
            } else if (typeof p.textDelta === 'string') {
              assistantTextBuffer += p.textDelta
            }
            if (assistantTextBuffer) {
              if (!assistantMessageItemId) {
                assistantMessageItemId = sessionEmitter.addAssistantMessage({
                  text: assistantTextBuffer,
                  state: 'streaming',
                  providerEventType: method,
                })
              } else {
                sessionEmitter.patchMessage(assistantMessageItemId, {
                  text: assistantTextBuffer,
                  state: 'streaming',
                })
              }
            }
            break

          case 'turn/completed':
            flushAssistantBuffer()
            {
              const contextWindow = deriveCodexContextWindow(
                (p.usage ??
                  (typeof p.turn === 'object' && p.turn !== null
                    ? (p.turn as { usage?: unknown }).usage
                    : null) ??
                  params) as {
                  last?: {
                    inputTokens?: unknown
                    cachedInputTokens?: unknown
                  }
                  modelContextWindow?: unknown
                },
              )
              if (contextWindow) {
                setContextWindow(contextWindow)
              }
            }
            if (typeof p.turn === 'object' && p.turn !== null) {
              const turn = p.turn as {
                status?: unknown
                error?: { message?: unknown } | null
              }
              const errorMessage =
                typeof turn.error?.message === 'string'
                  ? turn.error.message
                  : null
              if (turn.status === 'failed' || errorMessage) {
                if (errorMessage) {
                  sessionEmitter.addNote({
                    text: errorMessage,
                    level: 'error',
                  })
                }
                setStatus('failed')
                setAttention('failed')
                break
              }
            }
            setStatus('completed')
            setAttention('finished')
            break

          case 'turn/interrupt':
            flushAssistantBuffer()
            sessionEmitter.addNote({
              text: 'Turn interrupted',
              level: 'warning',
            })
            break

          case 'item/started': {
            const item =
              typeof p.item === 'object' && p.item !== null
                ? (p.item as Record<string, unknown>)
                : null
            const itemType = typeof item?.type === 'string' ? item.type : null

            if (isContextCompactionItemType(itemType)) {
              sessionEmitter.addNote({
                text: 'Compacting context...',
                level: 'info',
                providerEventType: itemType,
              })
            }
            break
          }

          case 'item/completed': {
            const item =
              typeof p.item === 'object' && p.item !== null
                ? (p.item as Record<string, unknown>)
                : null
            const itemType = typeof item?.type === 'string' ? item.type : null

            if (isContextCompactionItemType(itemType)) {
              sessionEmitter.addNote({
                text: 'Compaction complete',
                level: 'info',
                providerEventType: itemType,
              })
              break
            }

            if (itemType === 'agentMessage') {
              const hadBufferedText = assistantTextBuffer.length > 0
              flushAssistantBuffer()
              const text = typeof item?.text === 'string' ? item.text : ''
              if (text && !hadBufferedText) {
                sessionEmitter.addAssistantMessage({
                  text,
                  state: 'complete',
                  providerEventType: itemType,
                })
              }
              break
            }

            if (itemType === 'commandExecution') {
              const command =
                typeof item?.command === 'string' ? item.command : 'command'
              const output =
                typeof item?.aggregatedOutput === 'string'
                  ? item.aggregatedOutput
                  : typeof item?.exitCode === 'number'
                    ? `exit code ${item.exitCode}`
                    : 'Done'
              sessionEmitter.addToolResult({
                outputText: `${command}: ${output}`,
                toolName: command,
                providerEventType: itemType,
              })
              break
            }

            if (itemType === 'fileChange' || itemType === 'mcpToolCall') {
              sessionEmitter.addToolResult({
                outputText: JSON.stringify(item ?? 'Done'),
                providerEventType: itemType,
              })
            }
            break
          }

          case 'error': {
            flushAssistantBuffer()
            const error =
              typeof p.error === 'object' && p.error !== null
                ? (p.error as { message?: unknown })
                : null
            sessionEmitter.addNote({
              text: `Error: ${typeof error?.message === 'string' ? error.message : typeof p.message === 'string' ? p.message : 'Unknown error'}`,
              level: 'error',
            })
            setStatus('failed')
            setAttention('failed')
            break
          }
        }
      })

      // Handle server requests (need response — approvals)
      rpc.onServerRequest((method, params, id) => {
        if (stopped) return
        applyActivity({ kind: 'request', method, params, requestId: id })
        const p = params as Record<string, unknown>

        if (
          method === 'item/commandExecution/requestApproval' ||
          method === 'item/fileChange/requestApproval' ||
          method === 'item/fileRead/requestApproval' ||
          method === 'item/mcpToolCall/requestApproval'
        ) {
          flushAssistantBuffer()
          const description =
            typeof p.command === 'string'
              ? `Command: ${p.command}`
              : typeof p.path === 'string'
                ? `File: ${p.path}`
                : method.split('/')[1]

          pendingApprovals.set(id, description)

          sessionEmitter.addApprovalRequest({
            description,
            providerEventType: method,
          })
          setAttention('needs-approval')
        } else if (method === 'item/tool/requestUserInput') {
          flushAssistantBuffer()
          const questions = Array.isArray(p.questions) ? p.questions : []
          const questionIds = questions
            .map((question) => {
              if (!question || typeof question !== 'object') return null
              const record = question as {
                id?: unknown
                question?: unknown
                prompt?: unknown
                header?: unknown
              }
              return typeof record.id === 'string' ? record.id : null
            })
            .filter((questionId): questionId is string => questionId !== null)
          const prompt =
            questions
              .map((question) => {
                if (!question || typeof question !== 'object') return null
                const record = question as {
                  question?: unknown
                  prompt?: unknown
                  header?: unknown
                }
                if (typeof record.question === 'string') return record.question
                if (typeof record.prompt === 'string') return record.prompt
                if (typeof record.header === 'string') return record.header
                return null
              })
              .filter((question): question is string => !!question)
              .join('\n') || 'Input needed'

          pendingUserInputs.set(id, questionIds)

          sessionEmitter.addInputRequest({
            prompt,
            providerEventType: method,
          })
          setAttention('needs-input')
        }
      })

      if (child.stderr) {
        child.stderr.on('data', () => {
          // Consume stderr to prevent blocking
        })
      }

      child.on('exit', (code) => {
        if (stopped) return
        flushAssistantBuffer()
        applyActivity({ kind: 'close' })
        if (code !== 0 && code !== null) {
          sessionEmitter.addNote({
            text: `Process exited with code ${code}`,
            level: 'error',
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
        sessionEmitter.addNote({
          text: `Process error: ${err.message}`,
          level: 'error',
        })
        setStatus('failed')
        setAttention('failed')
        child = null
      })

      void initialize(initialMessage, initialAttachments)
    }

    // Spawn after a tick so listeners can be attached
    setTimeout(() => {
      spawnServer(config.initialMessage, config.initialAttachments)
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
        if (threadId) {
          cb(threadId)
        }
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
          spawnServer(text, attachments)
          return
        }

        const pendingUserInput = pendingUserInputs.entries().next().value as
          | [number, string[]]
          | undefined
        if (pendingUserInput) {
          const [requestId, questionIds] = pendingUserInput
          const answers = Object.fromEntries(
            questionIds.map((questionId) => [questionId, { answers: [text] }]),
          )
          rpc.respond(requestId, { answers })
          pendingUserInputs.delete(requestId)
          setAttention('none')
          return
        }

        if (!threadId) {
          spawnServer(text, attachments)
          return
        }

        sessionEmitter.addUserMessage({ text })
        setStatus('running')
        setAttention('none')
        const activeRpc = rpc
        loadCodexParts(attachments)
          .then((parts) =>
            startTurn(activeRpc, buildCodexUserInput({ text, parts })),
          )
          .catch((err) => {
            if (stopped) return
            const failureEntry = buildTurnFailureEntry(err, now())
            sessionEmitter.addNote({
              text: failureEntry.text,
              level: failureEntry.level,
              timestamp: failureEntry.timestamp,
            })
            setStatus('failed')
            setAttention('failed')
          })
      },
      approve: () => {
        if (!rpc) return
        // Approve the first pending approval
        const [id] = pendingApprovals.keys()
        if (id !== undefined) {
          rpc.respond(id, { decision: 'accept' })
          pendingApprovals.delete(id)
          if (pendingApprovals.size === 0) {
            setAttention('none')
          }
        }
      },
      deny: () => {
        if (!rpc) return
        const [id] = pendingApprovals.keys()
        if (id !== undefined) {
          rpc.respond(id, { decision: 'deny' })
          pendingApprovals.delete(id)
          if (pendingApprovals.size === 0) {
            setAttention('none')
          }
        }
      },
      stop: () => {
        stopped = true
        rpc?.destroy()
        rpc = null
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

  private async fetchDescriptor(): Promise<ProviderDescriptor> {
    const fallback = buildFallbackCodexDescriptor()

    const child = spawn(this.binaryPath, ['app-server'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    if (!child.stdin || !child.stdout) {
      child.kill('SIGTERM')
      return fallback
    }

    const rpc = new JsonRpcClient(child.stdin, child.stdout)
    if (child.stderr) {
      child.stderr.on('data', () => {
        // Drain stderr so discovery cannot block.
      })
    }

    try {
      await rpc.request('initialize', {
        clientInfo: {
          name: 'convergence',
          title: 'Convergence',
          version: '0.0.0',
        },
        capabilities: {
          experimentalApi: true,
        },
      })
      rpc.notify('initialized')

      const result = (await rpc.request('model/list', {
        includeHidden: false,
        limit: 100,
      })) as { data?: unknown }
      const models = Array.isArray(result?.data) ? result.data : []

      if (models.length === 0) {
        return fallback
      }

      const modelOptions = models
        .map((model) => this.toModelOption(model))
        .filter((option): option is ProviderModelOption => option !== null)

      if (modelOptions.length === 0) {
        return fallback
      }

      const defaultModelId =
        this.readDefaultModelId(models) ??
        modelOptions[0]?.id ??
        fallback.defaultModelId

      return normalizeProviderDescriptor({
        ...fallback,
        defaultModelId,
        modelOptions,
      })
    } finally {
      rpc.destroy()
      child.kill('SIGTERM')
    }
  }

  private toModelOption(model: unknown): ProviderModelOption | null {
    if (!model || typeof model !== 'object') return null
    const record = model as {
      model?: unknown
      displayName?: unknown
      hidden?: unknown
      defaultReasoningEffort?: unknown
      supportedReasoningEfforts?: Array<{
        reasoningEffort?: unknown
        description?: unknown
      }>
    }

    if (record.hidden === true || typeof record.model !== 'string') {
      return null
    }

    const effortOptions =
      record.supportedReasoningEfforts?.reduce<ProviderEffortOption[]>(
        (options, effort) => {
          const id = this.readReasoningEffort(effort?.reasoningEffort)
          if (!id) {
            return options
          }

          options.push({
            id,
            label: this.formatEffortLabel(id),
            description:
              typeof effort?.description === 'string'
                ? effort.description
                : undefined,
          })
          return options
        },
        [],
      ) ?? []

    return {
      id: record.model,
      label:
        typeof record.displayName === 'string' && record.displayName.trim()
          ? record.displayName
          : record.model,
      defaultEffort: this.readReasoningEffort(record.defaultReasoningEffort),
      effortOptions,
    }
  }

  private readDefaultModelId(models: unknown[]): string | null {
    for (const model of models) {
      if (!model || typeof model !== 'object') continue
      const record = model as { isDefault?: unknown; model?: unknown }
      if (record.isDefault === true && typeof record.model === 'string') {
        return record.model
      }
    }

    return null
  }

  private readReasoningEffort(value: unknown): ReasoningEffort | null {
    switch (value) {
      case 'none':
      case 'minimal':
      case 'low':
      case 'medium':
      case 'high':
      case 'max':
      case 'xhigh':
        return value
      default:
        return null
    }
  }

  private formatEffortLabel(effort: ReasoningEffort): string {
    switch (effort) {
      case 'none':
        return 'None'
      case 'minimal':
        return 'Minimal'
      case 'low':
        return 'Low'
      case 'medium':
        return 'Medium'
      case 'high':
        return 'High'
      case 'max':
        return 'Max'
      case 'xhigh':
        return 'Very High'
    }
  }
}
