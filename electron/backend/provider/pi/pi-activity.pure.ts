import type { ActivitySignal } from '../provider.types'

export type ActivityDelta = ActivitySignal | 'keep'

type StreamingKind = 'streaming' | 'thinking'

export interface PiActivityState {
  lastStreamingKind: StreamingKind | null
  lastActivity: ActivitySignal
}

export type PiActivityInput =
  | { kind: 'agent_start' }
  | { kind: 'text_delta' }
  | { kind: 'thinking_delta' }
  | { kind: 'tool_start'; name: string }
  | { kind: 'tool_end' }
  | { kind: 'turn_end' }
  | { kind: 'agent_end' }
  | { kind: 'close' }

export function initialPiActivityState(): PiActivityState {
  return { lastStreamingKind: null, lastActivity: null }
}

function normalize(raw: string): string {
  return raw.trim().toLowerCase() || 'tool'
}

function emit(
  prev: PiActivityState,
  next: {
    lastStreamingKind?: StreamingKind | null
    lastActivity: ActivitySignal
  },
): { state: PiActivityState; activity: ActivityDelta } {
  const state: PiActivityState = {
    lastStreamingKind:
      'lastStreamingKind' in next
        ? (next.lastStreamingKind ?? null)
        : prev.lastStreamingKind,
    lastActivity: next.lastActivity,
  }
  if (state.lastActivity === prev.lastActivity) {
    return { state, activity: 'keep' }
  }
  return { state, activity: state.lastActivity }
}

export function reducePiActivity(
  prev: PiActivityState,
  input: PiActivityInput,
): { state: PiActivityState; activity: ActivityDelta } {
  switch (input.kind) {
    case 'agent_start':
    case 'turn_end':
    case 'agent_end':
    case 'close':
      return emit(prev, { lastStreamingKind: null, lastActivity: null })

    case 'text_delta':
      return emit(prev, {
        lastStreamingKind: 'streaming',
        lastActivity: 'streaming',
      })

    case 'thinking_delta':
      return emit(prev, {
        lastStreamingKind: 'thinking',
        lastActivity: 'thinking',
      })

    case 'tool_start':
      return emit(prev, { lastActivity: `tool:${normalize(input.name)}` })

    case 'tool_end':
      return emit(prev, { lastActivity: prev.lastStreamingKind })
  }
}
