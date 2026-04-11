import type {
  Provider,
  SessionStartConfig,
  SessionHandle,
  TranscriptEntry,
  SessionStatus,
  AttentionState,
} from './provider.types'

function now(): string {
  return new Date().toISOString()
}

export class FakeProvider implements Provider {
  id = 'fake'
  name = 'Fake Provider'
  supportsContinuation = false

  start(config: SessionStartConfig): SessionHandle {
    const listeners = {
      transcript: [] as ((entry: TranscriptEntry) => void)[],
      status: [] as ((status: SessionStatus) => void)[],
      attention: [] as ((attention: AttentionState) => void)[],
    }

    const timers: ReturnType<typeof setTimeout>[] = []
    let stopped = false

    function schedule(fn: () => void, delay: number): void {
      if (stopped) return
      timers.push(
        setTimeout(() => {
          if (!stopped) fn()
        }, delay),
      )
    }

    function emit(entry: TranscriptEntry): void {
      listeners.transcript.forEach((cb) => cb(entry))
    }

    function setStatus(status: SessionStatus): void {
      listeners.status.forEach((cb) => cb(status))
    }

    function setAttention(attention: AttentionState): void {
      listeners.attention.forEach((cb) => cb(attention))
    }

    let approveResolve: (() => void) | null = null
    let inputResolve: ((text: string) => void) | null = null

    // Start the simulation after a tick (so listeners can be attached)
    schedule(() => {
      setStatus('running')

      // Emit user message
      emit({ type: 'user', text: config.initialMessage, timestamp: now() })

      // Stream assistant response in chunks
      schedule(() => {
        emit({
          type: 'assistant',
          text: `I'll help you with that. Let me analyze the codebase in ${config.workingDirectory}...`,
          timestamp: now(),
        })
      }, 300)

      schedule(() => {
        emit({
          type: 'assistant',
          text: 'I found the relevant files. I need to make a change to implement this.',
          timestamp: now(),
        })
      }, 800)

      // Request approval
      schedule(() => {
        emit({
          type: 'approval-request',
          description:
            'Edit file: src/main.ts — Add error handling to the process function',
          timestamp: now(),
        })
        setAttention('needs-approval')

        // Wait for approval
        new Promise<void>((resolve) => {
          approveResolve = resolve
        }).then(() => {
          if (stopped) return
          setAttention('none')

          emit({
            type: 'tool-use',
            tool: 'edit_file',
            input: 'src/main.ts',
            timestamp: now(),
          })

          schedule(() => {
            emit({
              type: 'tool-result',
              result:
                'File edited successfully. Added try-catch block around process function.',
              timestamp: now(),
            })
          }, 400)

          schedule(() => {
            emit({
              type: 'assistant',
              text: "Done! I've added error handling to the process function. The changes look good and should handle edge cases properly.",
              timestamp: now(),
            })
          }, 800)

          schedule(() => {
            setStatus('completed')
            setAttention('finished')
          }, 1000)
        })
      }, 1500)
    }, 50)

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
        if (stopped) return
        emit({ type: 'user', text, timestamp: now() })
        if (inputResolve) {
          inputResolve(text)
          inputResolve = null
        }
      },
      approve: () => {
        if (approveResolve) {
          approveResolve()
          approveResolve = null
        }
      },
      deny: () => {
        if (stopped) return
        approveResolve = null
        emit({
          type: 'system',
          text: 'User denied the action.',
          timestamp: now(),
        })
        setStatus('completed')
        setAttention('finished')
      },
      stop: () => {
        stopped = true
        timers.forEach(clearTimeout)
        timers.length = 0
        approveResolve = null
        inputResolve = null
        setStatus('failed')
        setAttention('failed')
      },
    }

    return handle
  }
}
