import { expect, it } from 'vitest'
import type { SessionDelta } from '../session/conversation-item.types'
import { ProviderSessionEmitter } from './provider-session.emitter'

it('carries agent and task identities through the emitter — omit either identity from the base item turns red', () => {
  const deltas: SessionDelta[] = []
  const emitter = new ProviderSessionEmitter({
    providerId: 'claude-code',
    emitDelta: (delta) => deltas.push(delta),
  })
  const identity = { agentRunId: 'agent-1', taskId: 'task-1' }
  emitter.addToolCall({ toolName: 'Read', inputText: 'fixture', ...identity })
  emitter.addToolResult({ outputText: 'fixture', ...identity })
  expect(
    deltas.map((delta) =>
      delta.kind === 'conversation.item.add'
        ? [delta.item.agentRunId, delta.item.taskId]
        : null,
    ),
  ).toEqual([
    ['agent-1', 'task-1'],
    ['agent-1', 'task-1'],
  ])
})
