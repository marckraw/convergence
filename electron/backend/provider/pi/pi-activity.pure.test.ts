import { describe, it, expect } from 'vitest'
import { initialPiActivityState, reducePiActivity } from './pi-activity.pure'

describe('reducePiActivity', () => {
  it('maps text_delta to streaming', () => {
    const { activity, state } = reducePiActivity(initialPiActivityState(), {
      kind: 'text_delta',
    })
    expect(activity).toBe('streaming')
    expect(state.lastStreamingKind).toBe('streaming')
  })

  it('maps thinking_delta to thinking', () => {
    const { activity, state } = reducePiActivity(initialPiActivityState(), {
      kind: 'thinking_delta',
    })
    expect(activity).toBe('thinking')
    expect(state.lastStreamingKind).toBe('thinking')
  })

  it('dedupes repeat deltas as keep', () => {
    const after = reducePiActivity(initialPiActivityState(), {
      kind: 'text_delta',
    }).state
    const { activity } = reducePiActivity(after, { kind: 'text_delta' })
    expect(activity).toBe('keep')
  })

  it('maps tool_start to tool:name with normalization', () => {
    const { activity } = reducePiActivity(initialPiActivityState(), {
      kind: 'tool_start',
      name: 'EditFile',
    })
    expect(activity).toBe('tool:editfile')
  })

  it('returns to prior streaming state on tool_end', () => {
    let state = reducePiActivity(initialPiActivityState(), {
      kind: 'thinking_delta',
    }).state
    state = reducePiActivity(state, { kind: 'tool_start', name: 'Bash' }).state
    const { activity } = reducePiActivity(state, { kind: 'tool_end' })
    expect(activity).toBe('thinking')
  })

  it('goes to null on tool_end when no prior streaming', () => {
    const after = reducePiActivity(initialPiActivityState(), {
      kind: 'tool_start',
      name: 'ls',
    }).state
    const { activity } = reducePiActivity(after, { kind: 'tool_end' })
    expect(activity).toBeNull()
  })

  it('clears on turn_end', () => {
    const after = reducePiActivity(initialPiActivityState(), {
      kind: 'text_delta',
    }).state
    const { state, activity } = reducePiActivity(after, { kind: 'turn_end' })
    expect(activity).toBeNull()
    expect(state.lastStreamingKind).toBeNull()
  })

  it('clears on agent_end', () => {
    const after = reducePiActivity(initialPiActivityState(), {
      kind: 'thinking_delta',
    }).state
    const { state, activity } = reducePiActivity(after, { kind: 'agent_end' })
    expect(activity).toBeNull()
    expect(state.lastStreamingKind).toBeNull()
  })

  it('maps compaction_start to compacting without losing streaming kind', () => {
    const state = reducePiActivity(initialPiActivityState(), {
      kind: 'text_delta',
    }).state
    const { activity, state: next } = reducePiActivity(state, {
      kind: 'compaction_start',
    })
    expect(activity).toBe('compacting')
    expect(next.lastStreamingKind).toBe('streaming')
  })

  it('restores prior streaming kind on compaction_end', () => {
    let state = reducePiActivity(initialPiActivityState(), {
      kind: 'thinking_delta',
    }).state
    state = reducePiActivity(state, { kind: 'compaction_start' }).state
    const { activity } = reducePiActivity(state, { kind: 'compaction_end' })
    expect(activity).toBe('thinking')
  })

  it('goes to null on compaction_end when no prior streaming', () => {
    const after = reducePiActivity(initialPiActivityState(), {
      kind: 'compaction_start',
    }).state
    const { activity } = reducePiActivity(after, { kind: 'compaction_end' })
    expect(activity).toBeNull()
  })

  it('clears on close', () => {
    const after = reducePiActivity(initialPiActivityState(), {
      kind: 'tool_start',
      name: 'x',
    }).state
    const { activity } = reducePiActivity(after, { kind: 'close' })
    expect(activity).toBeNull()
  })
})
