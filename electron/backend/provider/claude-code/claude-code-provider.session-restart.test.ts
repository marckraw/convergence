import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import {
  CONTEXT_RESTARTED_NOTE_TEXT,
  SESSION_RESTARTED_EVENT_TYPE,
} from '../session-restart.pure'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { ClaudeCodeProvider } from './claude-code-provider'

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false
  private exited = false

  kill = vi.fn((_signal?: NodeJS.Signals) => {
    this.killed = true
    this.emitExit(0)
    return true
  })

  emitExit(code: number): void {
    if (this.exited) return
    this.exited = true
    this.emit('exit', code)
  }
}

function waitFor(
  assertion: () => void,
  timeoutMs = 400,
  intervalMs = 10,
): Promise<void> {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(error)
          return
        }
        setTimeout(attempt, intervalMs)
      }
    }

    attempt()
  })
}

type AddedItem = Extract<
  SessionDelta,
  { kind: 'conversation.item.add' }
>['item']

/**
 * Runs one turn against a fake Claude process that announces `initSessionId`,
 * and returns every note the adapter wrote.
 */
async function runTurn(input: {
  continuationToken: string | null
  initSessionId: string
}): Promise<AddedItem[]> {
  const child = new MockChildProcess()
  spawnMock.mockReturnValue(child)

  setTimeout(() => {
    child.stdout.write(
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: input.initSessionId,
      }) + '\n',
    )
    child.stdout.write(
      JSON.stringify({ type: 'result', is_error: false, result: 'Done' }) +
        '\n',
    )
    child.emitExit(0)
  }, 0)

  const provider = new ClaudeCodeProvider('/usr/local/bin/claude')
  const handle = provider.start({
    sessionId: 'session-claude',
    workingDirectory: process.cwd(),
    initialMessage: 'hello claude',
    initialAttachments: undefined,
    model: null,
    effort: null,
    continuationToken: input.continuationToken,
  })

  const items: AddedItem[] = []
  const statuses: string[] = []
  handle.onDelta((delta) => {
    if (delta.kind === 'conversation.item.add') items.push(delta.item)
  })
  handle.onStatusChange((status) => statuses.push(status))
  handle.onContinuationToken(() => {})
  handle.onAttentionChange(() => {})
  handle.onContextWindowChange(() => {})
  handle.onActivityChange(() => {})

  await waitFor(() => {
    expect(statuses).toContain('completed')
  })

  return items.filter((item) => item.kind === 'note')
}

/**
 * The transcript boundary (F9). Convergence never clears its own transcript,
 * so when Claude mints a new conversation id mid-session -- `/clear` does
 * exactly this, and a relay opener does it on purpose -- the transcript would
 * otherwise go on implying a continuity the model no longer has.
 */
describe('ClaudeCodeProvider conversation restarts', () => {
  afterEach(() => {
    spawnMock.mockReset()
  })

  it('marks the boundary when a new id replaces the one it was resuming', async () => {
    const notes = await runTurn({
      continuationToken: 'session-before',
      initSessionId: 'session-after',
    })

    expect(notes).toHaveLength(1)
    const [note] = notes
    if (note.kind !== 'note') throw new Error('expected a note')
    expect(note.text).toBe(CONTEXT_RESTARTED_NOTE_TEXT)
    expect(note.providerMeta.providerEventType).toBe(
      SESSION_RESTARTED_EVENT_TYPE,
    )
    // Not an aside: the reader has to be able to see where the memory stops.
    expect(note.level).toBe('warning')
  })

  it('says nothing when a session is simply beginning', async () => {
    // A first id is not a restart: there is no earlier context for the reader
    // to be warned about losing.
    const notes = await runTurn({
      continuationToken: null,
      initSessionId: 'session-first',
    })

    expect(notes).toEqual([])
  })

  /**
   * The guard that matters most: an ordinary resumed turn keeps its id, and a
   * boundary drawn on every turn would be worse than none at all.
   */
  it('says nothing when the turn resumes the id it already had', async () => {
    const notes = await runTurn({
      continuationToken: 'session-same',
      initSessionId: 'session-same',
    })

    expect(notes).toEqual([])
  })
})
