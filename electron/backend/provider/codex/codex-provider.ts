import { spawn, type ChildProcess } from 'child_process'
import type {
  Provider,
  SessionStartConfig,
  SessionHandle,
  TranscriptEntry,
  SessionStatus,
  AttentionState,
} from '../provider.types'
import { JsonRpcClient } from './jsonrpc'

function now(): string {
  return new Date().toISOString()
}

export class CodexProvider implements Provider {
  id = 'codex'
  name = 'Codex'
  supportsContinuation = true

  constructor(private binaryPath: string) {}

  start(config: SessionStartConfig): SessionHandle {
    const listeners = {
      transcript: [] as ((entry: TranscriptEntry) => void)[],
      status: [] as ((status: SessionStatus) => void)[],
      attention: [] as ((attention: AttentionState) => void)[],
    }

    let child: ChildProcess | null = null
    let rpc: JsonRpcClient | null = null
    let stopped = false
    let threadId: string | null = null
    let assistantTextBuffer = ''
    let resolveThreadReady: (() => void) | null = null

    // Map of pending approval request IDs (JSON-RPC id → our description)
    const pendingApprovals = new Map<number, string>()
    const pendingUserInputs = new Map<number, string[]>()

    function emit(entry: TranscriptEntry): void {
      listeners.transcript.forEach((cb) => cb(entry))
    }

    function setStatus(status: SessionStatus): void {
      listeners.status.forEach((cb) => cb(status))
    }

    function setAttention(attention: AttentionState): void {
      listeners.attention.forEach((cb) => cb(attention))
    }

    function flushAssistantBuffer(): void {
      if (assistantTextBuffer) {
        emit({
          type: 'assistant',
          text: assistantTextBuffer,
          timestamp: now(),
        })
        assistantTextBuffer = ''
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

    async function initialize(): Promise<void> {
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

        // Start thread
        const threadResult = await rpc.request('thread/start', {
          cwd: config.workingDirectory,
          approvalPolicy: 'on-request',
          sandbox: 'workspace-write',
        })

        threadId = readThreadId(threadResult) ?? threadId
        if (!threadId) {
          threadId = await waitForThreadId()
        }

        // Emit user message and start turn
        emit({
          type: 'user',
          text: config.initialMessage,
          timestamp: now(),
        })
        setStatus('running')

        await rpc.request('turn/start', {
          threadId,
          input: [
            {
              type: 'text',
              text: config.initialMessage,
              text_elements: [],
            },
          ],
        })
      } catch (err) {
        if (stopped) return
        emit({
          type: 'system',
          text: `Initialization failed: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: now(),
        })
        setStatus('failed')
        setAttention('failed')
      }
    }

    // Spawn after a tick so listeners can be attached
    setTimeout(() => {
      if (stopped) return

      child = spawn(this.binaryPath, ['app-server'], {
        cwd: config.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      if (!child.stdin || !child.stdout) {
        emit({
          type: 'system',
          text: 'Failed to open stdio',
          timestamp: now(),
        })
        setStatus('failed')
        setAttention('failed')
        return
      }

      rpc = new JsonRpcClient(child.stdin, child.stdout)

      // Handle notifications (no response needed)
      rpc.onNotification((method, params) => {
        if (stopped) return
        const p = params as Record<string, unknown>

        switch (method) {
          case 'thread/started':
            threadId = readThreadId(params) ?? threadId
            resolveThreadReady?.()
            break

          case 'turn/started':
            setStatus('running')
            setAttention('none')
            break

          case 'item/agentMessage/delta':
            if (typeof p.delta === 'string') {
              assistantTextBuffer += p.delta
            } else if (typeof p.textDelta === 'string') {
              assistantTextBuffer += p.textDelta
            }
            break

          case 'turn/completed':
            flushAssistantBuffer()
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
                  emit({
                    type: 'system',
                    text: errorMessage,
                    timestamp: now(),
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
            emit({
              type: 'system',
              text: 'Turn interrupted',
              timestamp: now(),
            })
            break

          case 'item/completed': {
            const item =
              typeof p.item === 'object' && p.item !== null
                ? (p.item as Record<string, unknown>)
                : null
            const itemType = typeof item?.type === 'string' ? item.type : null

            if (itemType === 'agentMessage') {
              const hadBufferedText = assistantTextBuffer.length > 0
              flushAssistantBuffer()
              const text = typeof item?.text === 'string' ? item.text : ''
              if (text && !hadBufferedText) {
                emit({
                  type: 'assistant',
                  text,
                  timestamp: now(),
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
              emit({
                type: 'tool-result',
                result: `${command}: ${output}`,
                timestamp: now(),
              })
              break
            }

            if (itemType === 'fileChange' || itemType === 'mcpToolCall') {
              emit({
                type: 'tool-result',
                result: JSON.stringify(item ?? 'Done'),
                timestamp: now(),
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
            emit({
              type: 'system',
              text: `Error: ${typeof error?.message === 'string' ? error.message : typeof p.message === 'string' ? p.message : 'Unknown error'}`,
              timestamp: now(),
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

          emit({
            type: 'approval-request',
            description,
            timestamp: now(),
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

          emit({
            type: 'input-request',
            prompt,
            timestamp: now(),
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

      initialize()
    }, 10)

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
      sendMessage: (text) => {
        if (stopped || !rpc || !threadId) return
        emit({ type: 'user', text, timestamp: now() })

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

        setStatus('running')
        setAttention('none')
        rpc
          .request('turn/start', {
            threadId,
            input: [{ type: 'text', text, text_elements: [] }],
          })
          .catch(() => {})
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
}
