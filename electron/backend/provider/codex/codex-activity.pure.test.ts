import { describe, it, expect } from 'vitest'
import {
  initialCodexActivityState,
  reduceCodexActivity,
} from './codex-activity.pure'

describe('reduceCodexActivity', () => {
  it('maps agent message delta to streaming', () => {
    const { state, activity } = reduceCodexActivity(
      initialCodexActivityState(),
      {
        kind: 'notification',
        method: 'item/agentMessage/delta',
        params: { delta: 'Hello' },
      },
    )
    expect(activity).toBe('streaming')
    expect(state.lastActivity).toBe('streaming')
  })

  it('dedupes repeated streaming deltas as keep', () => {
    const after = reduceCodexActivity(initialCodexActivityState(), {
      kind: 'notification',
      method: 'item/agentMessage/delta',
      params: {},
    }).state
    const { activity } = reduceCodexActivity(after, {
      kind: 'notification',
      method: 'item/agentMessage/delta',
      params: {},
    })
    expect(activity).toBe('keep')
  })

  it('emits waiting-approval on approval request and stores rpc id', () => {
    const { state, activity } = reduceCodexActivity(
      initialCodexActivityState(),
      {
        kind: 'request',
        method: 'item/commandExecution/requestApproval',
        requestId: 42,
        params: { command: 'rm -rf /' },
      },
    )
    expect(activity).toBe('waiting-approval')
    expect(state.pendingApprovals.get(42)).toBe('rm -rf /')
  })

  it('emits tool:name for completed command item', () => {
    const { activity } = reduceCodexActivity(initialCodexActivityState(), {
      kind: 'notification',
      method: 'item/completed',
      params: { item: { type: 'commandExecution', command: 'ls -la' } },
    })
    expect(activity).toBe('tool:ls')
  })

  it('emits tool:name for completed mcp tool', () => {
    const { activity } = reduceCodexActivity(initialCodexActivityState(), {
      kind: 'notification',
      method: 'item/completed',
      params: { item: { type: 'mcpToolCall', name: 'FooBar' } },
    })
    expect(activity).toBe('tool:foobar')
  })

  it('ignores completed agentMessage items', () => {
    const prev = {
      ...initialCodexActivityState(),
      lastActivity: 'streaming' as const,
    }
    const { activity } = reduceCodexActivity(prev, {
      kind: 'notification',
      method: 'item/completed',
      params: { item: { type: 'agentMessage', text: 'hi' } },
    })
    expect(activity).toBe('keep')
  })

  it('emits thinking when a reasoning item starts', () => {
    const { state, activity } = reduceCodexActivity(
      initialCodexActivityState(),
      {
        kind: 'notification',
        method: 'item/started',
        params: { item: { type: 'reasoning' } },
      },
    )
    expect(activity).toBe('thinking')
    expect(state.lastActivity).toBe('thinking')
  })

  it('emits thinking when an agentReasoning item starts (alt naming)', () => {
    const { activity } = reduceCodexActivity(initialCodexActivityState(), {
      kind: 'notification',
      method: 'item/started',
      params: { item: { type: 'agentReasoning' } },
    })
    expect(activity).toBe('thinking')
  })

  it('emits compacting when context compaction starts', () => {
    const { state, activity } = reduceCodexActivity(
      initialCodexActivityState(),
      {
        kind: 'notification',
        method: 'item/started',
        params: { item: { type: 'contextCompaction' } },
      },
    )
    expect(activity).toBe('compacting')
    expect(state.lastActivity).toBe('compacting')
  })

  it('clears compacting when context compaction completes', () => {
    const prev = reduceCodexActivity(initialCodexActivityState(), {
      kind: 'notification',
      method: 'item/started',
      params: { item: { type: 'contextCompaction' } },
    }).state
    const { state, activity } = reduceCodexActivity(prev, {
      kind: 'notification',
      method: 'item/completed',
      params: { item: { type: 'contextCompaction' } },
    })
    expect(activity).toBeNull()
    expect(state.lastActivity).toBeNull()
  })

  it('accepts deprecated compacted item variants', () => {
    const { state, activity } = reduceCodexActivity(
      initialCodexActivityState(),
      {
        kind: 'notification',
        method: 'item/started',
        params: { item: { type: 'compacted' } },
      },
    )
    expect(activity).toBe('compacting')
    expect(state.lastActivity).toBe('compacting')
  })

  it('clears state on turn/completed', () => {
    const prev = reduceCodexActivity(initialCodexActivityState(), {
      kind: 'request',
      method: 'item/commandExecution/requestApproval',
      requestId: 1,
      params: {},
    }).state
    const { state, activity } = reduceCodexActivity(prev, {
      kind: 'notification',
      method: 'turn/completed',
      params: {},
    })
    expect(activity).toBeNull()
    expect(state.pendingApprovals.size).toBe(0)
    expect(state.lastActivity).toBeNull()
  })

  it('clears state on turn/interrupt', () => {
    const prev = reduceCodexActivity(initialCodexActivityState(), {
      kind: 'notification',
      method: 'item/agentMessage/delta',
      params: {},
    }).state
    const { state, activity } = reduceCodexActivity(prev, {
      kind: 'notification',
      method: 'turn/interrupt',
      params: {},
    })
    expect(activity).toBeNull()
    expect(state.lastActivity).toBeNull()
  })

  it('clears on close', () => {
    const prev = reduceCodexActivity(initialCodexActivityState(), {
      kind: 'notification',
      method: 'item/agentMessage/delta',
      params: {},
    }).state
    const { state, activity } = reduceCodexActivity(prev, { kind: 'close' })
    expect(activity).toBeNull()
    expect(state.lastActivity).toBeNull()
  })

  it('returns keep when already null on close', () => {
    const { activity } = reduceCodexActivity(initialCodexActivityState(), {
      kind: 'close',
    })
    expect(activity).toBe('keep')
  })
})
