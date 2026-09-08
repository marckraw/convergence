import { describe, expect, it } from 'vitest'
import {
  readClaudeResultOriginKind,
  readClaudeTaskNote,
} from './claude-code-task.pure'

describe('Claude harness task readers', () => {
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
  it('keeps task facts and ids in notes without copying output paths — drop a task family or copy raw events turns red', () => {
    expect(
      [
        {
          type: 'system',
          subtype: 'task_notification',
          task_id: 'task-1',
          summary: 'Background sleep',
          output_file: '/private/task-output',
        },
        {
          type: 'system',
          subtype: 'task_started',
          task_id: 'task-1',
          tool_use_id: 'tool-1',
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
          subtype: 'background_tasks_changed',
          tasks: [
            {
              task_id: 'task-1',
              tool_use_id: 'tool-1',
              description: 'Background sleep',
            },
          ],
        },
        { type: 'system', subtype: 'background_tasks_changed', tasks: [] },
        { type: 'system', subtype: 'init' },
        null,
      ].map(readClaudeTaskNote),
    ).toEqual([
      {
        taskId: 'task-1',
        notification: true,
        text: 'A background task from an earlier turn was stopped: Background sleep',
      },
      {
        taskId: 'task-1',
        notification: false,
        text: 'task_started: {"task_id":"task-1","tool_use_id":"tool-1","description":"Background sleep"}',
      },
      {
        taskId: 'task-1',
        notification: false,
        text: 'task_updated: {"task_id":"task-1","status":"killed"}',
      },
      {
        taskId: null,
        notification: false,
        text: 'background_tasks_changed: [{"task_id":"task-1","tool_use_id":"tool-1","description":"Background sleep"}]',
      },
      {
        taskId: null,
        notification: false,
        text: 'background_tasks_changed: []',
      },
      null,
      null,
    ])
  })
})
