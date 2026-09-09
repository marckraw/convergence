import { describe, expect, it } from 'vitest'
import {
  readClaudeResultOriginKind,
  readClaudeTaskNote,
  readClaudeToolResultMoment,
} from './claude-code-task.pure'

describe('Claude harness task readers', () => {
  it('rejects a string origin — accept origin directly as a kind turns red', () => {
    expect(
      readClaudeResultOriginKind({
        type: 'result',
        origin: 'task-notification',
      }),
    ).toBeNull()
  })
  it('reads only typed result origins — ignore origin or treat arbitrary values as task notifications turns red', () => {
    expect(
      [
        { type: 'result', origin: { kind: 'task-notification' } },
        { type: 'result', origin: { kind: 'another-origin' } },
        { type: 'result' },
        { type: 'result', origin: null },
        { type: 'result', origin: { kind: 7 } },
        { type: 'assistant', origin: { kind: 'task-notification' } },
        null,
      ].map(readClaudeResultOriginKind),
    ).toEqual([
      'task-notification',
      'another-origin',
      null,
      null,
      null,
      null,
      null,
    ])
  })
  it('writes only human started and terminal notes — emit list snapshots or nonterminal patches or copy raw output turns red', () => {
    expect(
      [
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
          patch: { status: 'killed', output_file: '/private/task-output' },
        },
        {
          type: 'system',
          subtype: 'task_notification',
          task_id: 'task-1',
          status: 'stopped',
          summary: 'Long diagnostic. Not a task description.',
          output_file: '/private/task-output',
        },
        {
          type: 'system',
          subtype: 'task_updated',
          task_id: 'task-1',
          patch: { status: 'completed' },
        },
        {
          type: 'system',
          subtype: 'task_updated',
          task_id: 'task-1',
          patch: { status: 'failed' },
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
        { type: 'system', subtype: 'init' },
        null,
      ].map((event) => readClaudeTaskNote(event)),
    ).toEqual([
      {
        taskId: 'task-1',
        moment: 'started',
        notification: false,
        description: 'Background sleep',
        text: 'Background task started: Background sleep',
      },
      {
        taskId: 'task-1',
        moment: 'terminal',
        notification: false,
        description: 'task-1',
        text: 'Background task task-1 was stopped',
      },
      {
        taskId: 'task-1',
        moment: 'terminal',
        notification: true,
        description: 'task-1',
        text: 'Background task task-1 was stopped',
      },
      {
        taskId: 'task-1',
        moment: 'terminal',
        notification: false,
        description: 'task-1',
        text: 'Background task task-1 finished',
      },
      {
        taskId: 'task-1',
        moment: 'terminal',
        notification: false,
        description: 'task-1',
        text: 'Background task task-1 failed',
      },
      null,
      null,
      null,
      null,
      null,
    ])
  })
})

it('R4 retains launch versus actual completion — mutation call an async launch completed turns red', () => {
  expect(
    ['async_launched', 'completed', 'future'].map((status) =>
      readClaudeToolResultMoment({ tool_use_result: { status } }),
    ),
  ).toEqual(['async_launched', 'completed', null])
})
