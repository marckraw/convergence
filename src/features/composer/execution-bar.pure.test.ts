import { describe, expect, it } from 'vitest'
import type { ExecutionHostEndpoint } from '@/entities/execution-host'
import {
  describeRemoteExecutionBlock,
  executionHostForNewSession,
  LOCAL_EXECUTION_HOST_LABEL,
  REMOVED_EXECUTION_HOST_LABEL,
  resolveExecutionBarView,
  type ExecutionBarInput,
  type ExecutionBarView,
} from './execution-bar.pure'

function endpoint(
  id: string,
  label = 'Remote daemon',
  position = 0,
): ExecutionHostEndpoint {
  return {
    id,
    label,
    baseUrl: `https://${id}.example.com`,
    position,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }
}

function view(overrides: Partial<ExecutionBarInput> = {}): ExecutionBarView {
  return resolveExecutionBarView({
    endpoints: [endpoint('kuba', 'kuba-vps')],
    liveSessionHostId: null,
    providerId: 'claude-code',
    providerLabel: 'Claude Code',
    contextKind: 'project',
    selectedHostId: 'local',
    ...overrides,
  })
}

describe('describeRemoteExecutionBlock', () => {
  it('lets every provider with a daemon counterpart leave this machine', () => {
    for (const providerId of ['claude-code', 'codex', 'cursor']) {
      expect(
        describeRemoteExecutionBlock({ providerId, providerLabel: 'X' }),
      ).toBeNull()
    }
  })

  it('names the provider that has no daemon counterpart', () => {
    expect(
      describeRemoteExecutionBlock({ providerId: 'pi', providerLabel: 'Pi' }),
    ).toBe(
      'Pi has no counterpart on the agents daemon, so it can only run here.',
    )
  })
})

describe('the strip while a session is being born', () => {
  it('is hidden with no Endpoint, so the composer looks exactly as before', () => {
    expect(view({ endpoints: [] })).toEqual({
      mode: 'hidden',
      hostId: 'local',
    })
  })

  it('is hidden for global sessions, which have no repository to materialize', () => {
    expect(view({ contextKind: 'global' })).toEqual({
      mode: 'hidden',
      hostId: 'local',
    })
  })

  it('offers this machine first and by default, then each Endpoint in order', () => {
    const resolved = view({
      endpoints: [endpoint('kuba', 'kuba-vps'), endpoint('bp', '', 1)],
    })
    expect(resolved).toMatchObject({ mode: 'choosing', hostId: 'local' })
    expect(resolved.mode === 'choosing' && resolved.choices).toEqual([
      { id: 'local', label: LOCAL_EXECUTION_HOST_LABEL, blockedReason: null },
      { id: 'kuba', label: 'kuba-vps', blockedReason: null },
      { id: 'bp', label: 'Unnamed endpoint', blockedReason: null },
    ])
  })

  it('sends the session to the machine he picked, not to the first one', () => {
    // The whole point of killing the boolean: `toggledExecutionHostId` used to
    // answer "the first Endpoint" no matter which row he was looking at.
    const resolved = view({
      endpoints: [endpoint('kuba', 'kuba-vps'), endpoint('bp', 'backpack', 1)],
      selectedHostId: 'bp',
    })
    expect(resolved.hostId).toBe('bp')
    expect(executionHostForNewSession(resolved)).toBe('bp')
  })

  it('reads a blank pick as this machine, and sends no host for it', () => {
    const resolved = view({ selectedHostId: '  ' })
    expect(resolved.hostId).toBe('local')
    // Local stays absent on the wire; every pre-Endpoint session has no
    // executionHost at all, and one meaning must not gain a second encoding.
    expect(executionHostForNewSession(resolved)).toBeUndefined()
  })
})

describe('a pick that has stopped being reachable', () => {
  it('falls back to this machine when the Endpoint was removed in Settings', () => {
    const resolved = view({
      endpoints: [endpoint('kuba')],
      selectedHostId: 'bp',
    })
    expect(resolved.hostId).toBe('local')
    expect(executionHostForNewSession(resolved)).toBeUndefined()
  })

  it('lists a daemon-incapable provider blocked, with the reason, not gone', () => {
    const resolved = view({ providerId: 'pi', providerLabel: 'Pi' })
    expect(resolved.mode === 'choosing' && resolved.choices).toEqual([
      { id: 'local', label: LOCAL_EXECUTION_HOST_LABEL, blockedReason: null },
      {
        id: 'kuba',
        label: 'kuba-vps',
        blockedReason:
          'Pi has no counterpart on the agents daemon, so it can only run here.',
      },
    ])
  })

  it('sends a blocked pick here, so the strip and the send never disagree', () => {
    const resolved = view({
      providerId: 'pi',
      providerLabel: 'Pi',
      selectedHostId: 'kuba',
    })
    expect(resolved.hostId).toBe('local')
    expect(executionHostForNewSession(resolved)).toBeUndefined()
  })

  it('restores his pick when the provider can reach the daemon again', () => {
    // Clamped at the read, never written back: demoting the stored pick would
    // cost him the machine permanently for one glance at another provider.
    const input = { selectedHostId: 'kuba' } as const
    expect(
      view({ ...input, providerId: 'pi', providerLabel: 'Pi' }).hostId,
    ).toBe('local')
    expect(view({ ...input }).hostId).toBe('kuba')
  })
})

describe('the strip once the session is live', () => {
  it('states the Endpoint by name, with no choice to make', () => {
    expect(view({ liveSessionHostId: 'kuba' })).toEqual({
      mode: 'settled',
      hostId: 'kuba',
      label: 'kuba-vps',
      warning: null,
    })
  })

  it('states this machine once there are Endpoints it could be confused with', () => {
    expect(view({ liveSessionHostId: 'local' })).toEqual({
      mode: 'settled',
      hostId: 'local',
      label: LOCAL_EXECUTION_HOST_LABEL,
      warning: null,
    })
  })

  it('stays hidden for a local session on a machine with no Endpoints', () => {
    expect(view({ liveSessionHostId: 'local', endpoints: [] })).toEqual({
      mode: 'hidden',
      hostId: 'local',
    })
  })

  it('reads an absent host as this machine, the way pre-remote sessions meant it', () => {
    expect(view({ liveSessionHostId: '' })).toMatchObject({
      mode: 'settled',
      hostId: 'local',
      label: LOCAL_EXECUTION_HOST_LABEL,
    })
  })

  it('says a live session names an Endpoint that is gone, rather than nothing', () => {
    // Slice 1 made that session refuse to run. The strip must not present it
    // as running here, and must not stay silent about why it will not run.
    expect(
      view({ liveSessionHostId: 'bp', endpoints: [endpoint('kuba')] }),
    ).toEqual({
      mode: 'settled',
      hostId: 'bp',
      label: REMOVED_EXECUTION_HOST_LABEL,
      warning:
        'This session names an endpoint that is no longer configured, so ' +
        'it will refuse to run.',
    })
  })

  it('still says it when every Endpoint is gone, because removal moves nothing', () => {
    // The "hide with no Endpoints" rule is about an empty chooser. It must not
    // silence a fact about a session that is already running somewhere else.
    expect(view({ liveSessionHostId: 'bp', endpoints: [] })).toMatchObject({
      mode: 'settled',
      hostId: 'bp',
      label: REMOVED_EXECUTION_HOST_LABEL,
    })
  })
})

describe('every variant carries the machine', () => {
  it('answers hostId in hidden, choosing and settled alike', () => {
    // The strip, the created session and the refused provider account all read
    // this one field. A variant that did not carry it would have to be
    // answered from somewhere else, and somewhere else is where it drifts.
    const modes = new Set(
      [
        view({ endpoints: [] }),
        view({ selectedHostId: 'kuba' }),
        view({ liveSessionHostId: 'kuba' }),
      ].map((resolved) => {
        expect(typeof resolved.hostId).toBe('string')
        expect(resolved.hostId.length).toBeGreaterThan(0)
        return resolved.mode
      }),
    )
    expect(modes).toEqual(new Set(['hidden', 'choosing', 'settled']))
  })
})
