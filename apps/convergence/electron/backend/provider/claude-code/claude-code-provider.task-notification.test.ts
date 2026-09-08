import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('child_process', () => ({ spawn: spawnMock }))
import { ClaudeCodeProvider } from './claude-code-provider'

class FakeChild extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  kill = vi.fn(() => true)
}
type Item = Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  spawnMock.mockReset()
})

async function turn() {
  const child = new FakeChild()
  spawnMock.mockReturnValue(child)
  const handle = new ClaudeCodeProvider('/test/claude').start({
    sessionId: 'session-test',
    workingDirectory: '/tmp',
    initialMessage: 'hello',
    model: null,
    effort: null,
    continuationToken: 'prior-session',
  })
  cleanups.push(() => handle.dispose?.())
  const items: Item[] = []
  const completed: string[][] = []
  const answers = () =>
    items.flatMap((item) =>
      item.kind === 'message' && item.actor === 'assistant' ? [item.text] : [],
    )
  handle.onDelta((delta) => {
    if (delta.kind === 'conversation.item.add') items.push(delta.item)
  })
  handle.onStatusChange((status) => {
    if (status === 'completed') completed.push(answers())
  })
  await vi.waitUntil(() => child.stdin.writableEnded)
  return {
    completed,
    notes: () =>
      items.flatMap((item) =>
        item.kind === 'note'
          ? [
              {
                text: item.text,
                level: item.level,
                event: item.providerMeta.providerEventType,
                id: item.providerMeta.providerItemId,
              },
            ]
          : [],
      ),
    send: (event: unknown) => child.stdout.write(JSON.stringify(event) + '\n'),
  }
}
const notification = {
  type: 'system',
  subtype: 'task_notification',
  task_id: 'task-1',
  tool_use_id: 'tool-1',
  status: 'stopped',
  summary: 'Background sleep',
}
const init = { type: 'system', subtype: 'init', session_id: 'prior-session' }
const synthetic = {
  type: 'result',
  subtype: 'success',
  origin: { kind: 'task-notification' },
  result: '',
}
const assistant = {
  type: 'assistant',
  message: { content: [{ type: 'text', text: 'The real answer' }] },
}
const result = { type: 'result', subtype: 'success', result: 'The real answer' }
const note = {
  text: 'A background task from an earlier turn was stopped: Background sleep',
  level: 'info',
  event: 'harness.task',
  id: 'task-1',
}

describe('Claude task-notification results', () => {
  it('completes only with the real resumed answer and one note — end on every result or duplicate the notification turns red', async () => {
    const bed = await turn()
    for (const event of [
      { type: 'system', subtype: 'hook_started' },
      { type: 'system', subtype: 'hook_response' },
      notification,
      init,
      synthetic,
      init,
      assistant,
      result,
    ])
      bed.send(event)
    expect({ completed: bed.completed, notes: bed.notes() }).toEqual({
      completed: [['The real answer']],
      notes: [note],
    })
  })
  it('completes an ordinary turn without task notes — suppress an originless result turns red', async () => {
    const bed = await turn()
    for (const event of [init, assistant, result]) bed.send(event)
    expect({ completed: bed.completed, notes: bed.notes() }).toEqual({
      completed: [['The real answer']],
      notes: [],
    })
  })
  it('records a notification without a synthetic result and keeps reading — drop system task notes or task-id dedupe turns red', async () => {
    const bed = await turn()
    bed.send(notification)
    bed.send(notification)
    const beforeAnswer = { completed: [...bed.completed], notes: bed.notes() }
    for (const event of [init, assistant, result]) bed.send(event)
    expect({
      beforeAnswer,
      completed: bed.completed,
      notes: bed.notes(),
    }).toEqual({
      beforeAnswer: { completed: [], notes: [note] },
      completed: [['The real answer']],
      notes: [note],
    })
  })
  it('records an origin-only cleanup without inventing a summary — drop the fallback note turns red', async () => {
    const bed = await turn()
    for (const event of [init, synthetic, init, assistant, result])
      bed.send(event)
    expect({ completed: bed.completed, notes: bed.notes() }).toEqual({
      completed: [['The real answer']],
      notes: [
        {
          text: 'A background task from an earlier turn was stopped: No task summary was supplied.',
          level: 'info',
          event: 'harness.task',
          id: null,
        },
      ],
    })
  })
})
