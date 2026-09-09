import { expect, it } from 'vitest'
import { readClaudeTaskFacts } from './claude-evidence.pure'

it('reads task birth, killed patches and consumed snapshots without inventing unknown families — mutation discard task facts turns red', () => {
  const events = [
    {
      type: 'system',
      subtype: 'task_started',
      task_id: 'task',
      tool_use_id: 'tool',
      task_type: 'local_bash',
      description: 'sleep',
    },
    {
      type: 'system',
      subtype: 'task_updated',
      task_id: 'task',
      patch: { status: 'killed', end_time: 0 },
    },
    { type: 'system', subtype: 'background_tasks_changed', tasks: [] },
    { type: 'system', subtype: 'future_signal' },
    null,
  ]
  expect(events.map((event) => readClaudeTaskFacts(event, 'now'))).toEqual([
    [
      {
        kind: 'task.changed',
        taskId: 'task',
        at: 'now',
        patch: {
          toolUseId: 'tool',
          taskType: 'local_bash',
          description: 'sleep',
          startedAt: 'now',
          status: 'running',
        },
      },
    ],
    [
      {
        kind: 'task.changed',
        taskId: 'task',
        at: 'now',
        patch: { status: 'stopped', endedAt: '1970-01-01T00:00:00.000Z' },
      },
    ],
    [],
    null,
    null,
  ])
})

it('R11 preserves terminal summaries verbatim — drop endedSummary at the reader turns red', () => {
  const summary = '  Fixture failure: upstream request rejected\nexact detail  '
  expect([
    readClaudeTaskFacts(
      {
        type: 'system',
        subtype: 'task_notification',
        task_id: 'task',
        status: 'failed',
        summary,
      },
      'now',
    )?.[0].patch,
    readClaudeTaskFacts(
      {
        type: 'system',
        subtype: 'task_updated',
        task_id: 'task',
        patch: { status: 'failed', summary },
      },
      'now',
    )?.[0].patch,
  ]).toEqual([
    { status: 'failed', endedAt: 'now', endedSummary: summary },
    { status: 'failed', endedAt: 'now', endedSummary: summary },
  ])
})
