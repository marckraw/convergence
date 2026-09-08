import { expect, it } from 'vitest'
import {
  boundedHarnessPayload,
  foldAgentRuns,
  foldTasks,
} from './harness-evidence.pure'
import type { AgentRunFact, SessionAgentRun } from './harness-evidence.types'

it('folds all five agent states and adopts identity — omit a lifecycle transition or replace known metadata with null turns red', () => {
  const started: AgentRunFact = {
    kind: 'agent.started',
    run: {
      id: 'tool-1',
      spawnedByItemId: 'call-1',
      agentType: 'Explore',
      description: 'Find fixture',
      model: null,
      depth: 1,
      startedAt: 'start',
      transcriptPath: null,
    },
  }
  const initial = foldAgentRuns([], started, 'session')
  const identified = foldAgentRuns(
    initial,
    {
      kind: 'agent.identified',
      spawnedByItemId: 'call-1',
      id: 'agent-1',
      agentType: null,
      description: null,
      depth: 2,
      transcriptPath: '/fixture/agent-1.jsonl',
    },
    'session',
  )
  const states = ['completed', 'failed', 'stopped'].map(
    (status) =>
      foldAgentRuns(
        identified,
        {
          kind: 'agent.ended',
          spawnedByItemId: 'call-1',
          status: status as 'completed' | 'failed' | 'stopped',
          at: 'end',
          model: 'haiku',
        },
        'session',
      )[0]?.status,
  )
  const ended = foldAgentRuns(
    identified,
    { kind: 'process.ended', at: 'exit' },
    'session',
  )
  expect({ initial: initial[0]?.status, states, ended: ended[0] }).toEqual({
    initial: 'running',
    states: ['completed', 'failed', 'stopped'],
    ended: {
      ...started.run,
      id: 'agent-1',
      sessionId: 'session',
      isBackgrounded: null,
      lastToolName: null,
      usageJson: null,
      updatedAt: null,
      status: 'unknown',
      endedAt: 'exit',
      depth: 2,
      transcriptPath: '/fixture/agent-1.jsonl',
    },
  })
})

it('keeps terminal agents terminal when the process ends — overwrite completed with unknown turns red', () => {
  const run: SessionAgentRun = {
    isBackgrounded: null,
    lastToolName: null,
    usageJson: null,
    updatedAt: null,
    id: 'agent',
    sessionId: 'session',
    spawnedByItemId: 'call',
    agentType: null,
    description: null,
    model: null,
    status: 'completed',
    depth: 1,
    startedAt: 'start',
    endedAt: 'end',
    transcriptPath: null,
  }
  expect(
    foldAgentRuns([run], { kind: 'process.ended', at: 'exit' }, 'session'),
  ).toEqual([run])
})

it('folds task start through killed without losing known facts — discard the patch or clear task identity turns red', () => {
  const started = foldTasks(
    [],
    {
      kind: 'task.changed',
      taskId: 'task',
      at: 'start',
      patch: {
        toolUseId: 'tool',
        taskType: 'local_bash',
        description: 'sleep',
        status: 'running',
        startedAt: 'start',
      },
    },
    'session',
  )
  const stopped = foldTasks(
    started,
    {
      kind: 'task.changed',
      taskId: 'task',
      at: 'end',
      patch: {
        status: 'stopped',
        endedAt: 'end',
        outputFile: '/fixture/output',
      },
    },
    'session',
  )
  expect(stopped).toEqual([
    {
      taskId: 'task',
      sessionId: 'session',
      toolUseId: 'tool',
      taskType: 'local_bash',
      description: 'sleep',
      status: 'stopped',
      startedAt: 'start',
      endedAt: 'end',
      outputFile: '/fixture/output',
    },
  ])
})

it('keeps unknown payloads within eight KiB as valid JSON — retain the unbounded payload or lose a small event turns red', () => {
  const large = boundedHarnessPayload({ text: '🧬'.repeat(10000) })
  expect({
    small: JSON.parse(boundedHarnessPayload({ future: true })),
    bytes: Buffer.byteLength(large) <= 8192,
    truncated: JSON.parse(large).truncated,
  }).toEqual({ small: { future: true }, bytes: true, truncated: true })
})
