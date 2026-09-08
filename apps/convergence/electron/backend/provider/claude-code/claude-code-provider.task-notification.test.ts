vi.mock('./claude-transport.service', async () => ({
  createClaudeTransport: (await import('./claude-transport.fixture'))
    .createFixtureClaudeTransport,
}))
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
  const statuses: string[] = []
  const answers = () =>
    items.flatMap((item) =>
      item.kind === 'message' && item.actor === 'assistant' ? [item.text] : [],
    )
  handle.onDelta((delta) => {
    if (delta.kind === 'conversation.item.add') items.push(delta.item)
  })
  handle.onStatusChange((status) => {
    statuses.push(status)
    if (status === 'completed') completed.push(answers())
  })
  await vi.waitUntil(() => child.stdin.readableLength > 0)
  return {
    child,
    handle,
    statuses,
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
  description: 'Background sleep',
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
  text: 'Background task Background sleep was stopped',
  level: 'info',
  event: 'harness.task',
  id: 'task-1',
}

describe('Claude task-notification results', () => {
  it('records only started and terminal moments — remove the moment from the dedupe key or emit every task patch turns red', async () => {
    const bed = await turn()
    for (const event of [
      {
        type: 'system',
        subtype: 'task_started',
        task_id: 'task-1',
        description: 'Background sleep',
      },
      {
        type: 'system',
        subtype: 'task_started',
        task_id: 'task-1',
        description: 'Background sleep',
      },
      {
        type: 'system',
        subtype: 'task_updated',
        task_id: 'task-1',
        patch: { status: 'running' },
      },
      {
        type: 'system',
        subtype: 'background_tasks_changed',
        tasks: [{ task_id: 'task-1' }],
      },
      { type: 'system', subtype: 'background_tasks_changed', tasks: [] },
      {
        type: 'system',
        subtype: 'task_updated',
        task_id: 'task-1',
        patch: { status: 'killed' },
      },
      notification,
      synthetic,
    ])
      bed.send(event)
    expect(bed.notes()).toEqual([
      { ...note, text: 'Background task started: Background sleep' },
      note,
    ])
  })
  it('fails an unanswered clean exit — drop the open-turn exit branch or clear currentTurn in the synthetic guard turns red', async () => {
    const bed = await turn()
    for (const event of [notification, init, synthetic]) bed.send(event)
    bed.child.emit('exit', 0)
    await vi.waitUntil(() => bed.statuses.includes('failed'))
    expect({
      completed: bed.completed,
      note: bed.notes().at(-1)?.text,
    }).toEqual({
      completed: [],
      note: 'Claude Code ended mid-turn (code 0 / none); nothing was re-sent — send your message again to continue',
    })
  })
  it('does not replay after synthetic harness output — ignore non-init output in the acceptance gate turns red', async () => {
    const bed = await turn()
    bed.send(synthetic)
    bed.child.emit('exit', 1)
    expect({
      spawns: spawnMock.mock.calls.length,
      status: bed.statuses.at(-1),
    }).toEqual({ spawns: 1, status: 'failed' })
  })
  it('keeps an init-proven session after a synthetic result and crash — omit sawHarnessOutput from recovery turns red', async () => {
    const bed = await turn()
    for (const event of [notification, init, synthetic]) bed.send(event)
    const next = new FakeChild()
    spawnMock.mockReturnValue(next)
    bed.child.emit('exit', 1)
    await vi.waitUntil(
      () => bed.statuses.includes('failed') || next.stdin.readableLength > 0,
    )
    const afterCrash = {
      statuses: [...bed.statuses],
      spawns: spawnMock.mock.calls.length,
    }
    bed.handle.sendMessage('try again')
    await vi.waitUntil(() => next.stdin.readableLength > 0)
    expect({ afterCrash, resume: spawnMock.mock.calls.at(-1)?.[1] }).toEqual({
      afterCrash: { statuses: ['running', 'failed'], spawns: 1 },
      resume: expect.arrayContaining(['--resume', 'prior-session']),
    })
  })
  it('starts the next turn without a stale notification — remove the turn-start pending flag reset turns red', async () => {
    const bed = await turn()
    bed.send(notification)
    bed.child.emit('exit', 0)
    const next = new FakeChild()
    spawnMock.mockReturnValue(next)
    bed.handle.sendMessage('try again')
    await vi.waitUntil(() => next.stdin.readableLength > 0)
    next.stdout.write(JSON.stringify(synthetic) + '\n')
    expect(
      bed
        .notes()
        .filter((entry) => entry.event === 'harness.task')
        .map((entry) => entry.text),
    ).toEqual([
      'Background task Background sleep was stopped',
      'Claude Code closed a background-task turn without a notification.',
    ])
  })
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
          text: 'Claude Code closed a background-task turn without a notification.',
          level: 'info',
          event: 'harness.task',
          id: null,
        },
      ],
    })
  })
})
