import { spawn, type ChildProcess } from 'child_process'
import type {
  Provider,
  SessionStartConfig,
  SessionHandle,
  TranscriptEntry,
  SessionStatus,
  AttentionState,
  SessionContextWindow,
  ActivitySignal,
} from '../provider.types'
import { parseJsonLines } from '../line-parser'
import { buildClaudeDescriptor } from '../provider-descriptor.pure'
import type { ProviderDescriptor } from '../provider.types'
import {
  createUnavailableContextWindow,
  deriveClaudeContextWindow,
  deriveClaudeEstimatedContextWindow,
} from '../context-window.pure'
import { readClaudeLoggedContextWindow } from './claude-context-log.service'
import { deriveClaudeActivity } from './claude-code-activity.pure'

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

export class ClaudeCodeProvider implements Provider {
  id = 'claude-code'
  name = 'Claude Code'
  supportsContinuation = true

  constructor(private binaryPath: string) {}

  async describe(): Promise<ProviderDescriptor> {
    return buildClaudeDescriptor()
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
    let stopped = false
    let claudeSessionId: string | null = config.continuationToken
    let assistantTextBuffer = ''
    let currentTurnHasAssistantText = false

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
      if (claudeSessionId === token) {
        return
      }

      claudeSessionId = token
      listeners.continuationToken.forEach((cb) => cb(token))
    }

    function setContextWindow(contextWindow: SessionContextWindow): void {
      listeners.contextWindow.forEach((cb) => cb(contextWindow))
    }

    let lastActivity: ActivitySignal = null
    function setActivity(activity: ActivitySignal): void {
      if (activity === lastActivity) return
      lastActivity = activity
      listeners.activity.forEach((cb) => cb(activity))
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
        emit({ type: 'assistant', text: assistantTextBuffer, timestamp: now() })
        assistantTextBuffer = ''
        currentTurnHasAssistantText = true
      }
    }

    function handleEvent(data: unknown): void {
      if (stopped) return
      const event = data as ClaudeStreamEvent
      const activityDelta = deriveClaudeActivity(data)
      if (activityDelta !== 'keep') {
        setActivity(activityDelta)
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
          const subtype = (event as unknown as Record<string, unknown>)
            .subtype as string | undefined
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
            emit({
              type: 'system',
              text: `Session started`,
              timestamp: now(),
            })
          }
          break
        }

        case 'stream_event':
          if (
            event.event?.type === 'content_block_delta' &&
            event.event.delta?.type === 'text_delta' &&
            event.event.delta?.text
          ) {
            assistantTextBuffer += event.event.delta.text
          }
          break

        case 'assistant': {
          // If we already streamed text via stream_events, flush that
          // and skip text blocks in the assistant message (they're duplicates)
          const hadStreamedText = assistantTextBuffer.length > 0
          flushAssistantBuffer()
          if (event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'tool_use' && block.name) {
                emit({
                  type: 'tool-use',
                  tool: block.name,
                  input:
                    typeof block.input === 'string'
                      ? block.input
                      : JSON.stringify(block.input, null, 2),
                  timestamp: now(),
                })
              } else if (
                block.type === 'text' &&
                block.text &&
                !hadStreamedText &&
                !currentTurnHasAssistantText
              ) {
                emit({ type: 'assistant', text: block.text, timestamp: now() })
                currentTurnHasAssistantText = true
              }
            }
          }
          break
        }

        case 'user':
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
                emit({
                  type: 'tool-result',
                  result: resultText,
                  timestamp: now(),
                })
              }
            }
          }
          break

        case 'result':
          flushAssistantBuffer()
          refreshContextWindowFromLogs()
          if (event.is_error) {
            emit({
              type: 'system',
              text: `Error: ${event.result ?? 'Unknown error'}`,
              timestamp: now(),
            })
            setStatus('failed')
            setAttention('failed')
          } else {
            if (!currentTurnHasAssistantText && event.result?.trim()) {
              emit({
                type: 'assistant',
                text: event.result,
                timestamp: now(),
              })
            }
            setStatus('completed')
            setAttention('finished')
          }
          break
      }
    }

    function startTurn(message: string): void {
      if (stopped || child) return

      assistantTextBuffer = ''
      currentTurnHasAssistantText = false
      emit({ type: 'user', text: message, timestamp: now() })
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
        env: { ...process.env },
      })

      if (child.stdout) {
        parseJsonLines(child.stdout, handleEvent, (err) => {
          if (!stopped) {
            emit({
              type: 'system',
              text: `Stream error: ${err.message}`,
              timestamp: now(),
            })
          }
        })
      }

      if (child.stderr) {
        let stderrBuffer = ''
        child.stderr.on('data', (chunk: Buffer) => {
          stderrBuffer += chunk.toString()
        })
        child.stderr.on('end', () => {
          if (stderrBuffer.trim() && !stopped) {
            // Only log significant stderr
            const significant = stderrBuffer
              .split('\n')
              .filter((l) => l.trim() && !l.includes('DEBUG'))
              .join('\n')
              .trim()
            if (significant) {
              emit({ type: 'system', text: significant, timestamp: now() })
            }
          }
        })
      }

      // Write prompt and close stdin
      if (child.stdin) {
        child.stdin.write(message + '\n')
        child.stdin.end()
      }

      child.on('exit', (code) => {
        if (stopped) return
        flushAssistantBuffer()
        refreshContextWindowFromLogs()
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
    }

    // Spawn after a tick so listeners can be attached
    setTimeout(() => {
      startTurn(config.initialMessage)
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
      sendMessage: (text) => {
        startTurn(text)
      },
      approve: () => {
        // Using --dangerously-skip-permissions, no approvals needed
      },
      deny: () => {
        // Using --dangerously-skip-permissions, no approvals needed
      },
      stop: () => {
        stopped = true
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
