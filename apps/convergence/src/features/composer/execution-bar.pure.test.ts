import { describe, expect, it } from 'vitest'
import type { ExecutionHostEndpoint } from '@/entities/execution-host'
import { LOCAL_EXECUTION_HOST_ID } from '@/entities/execution-host'
import { parseExecutionHostId } from '../../../electron/backend/execution-host-endpoint/execution-host-endpoint.pure'
import {
  defaultPermissionPresetForHost,
  executionHostForNewSession,
  LOCAL_EXECUTION_HOST_LABEL,
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
    configurationEpoch: 0,
  }
}

function view(overrides: Partial<ExecutionBarInput> = {}): ExecutionBarView {
  return resolveExecutionBarView({
    endpoints: [endpoint('kuba', 'kuba-vps')],
    liveSessionHostId: null,
    contextKind: 'project',
    selectedHostId: 'local',
    ...overrides,
  })
}

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
      { id: 'local', label: LOCAL_EXECUTION_HOST_LABEL },
      { id: 'kuba', label: 'kuba-vps' },
      { id: 'bp', label: 'Unnamed endpoint' },
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

  it('offers every configured Endpoint, whatever provider is selected', () => {
    // MAR-2682, "nothing local may assert a remote fact". Until S3 a local
    // table decided which providers could
    // leave this machine, and it had never asked any daemon; the row is now
    // filled from the machine that is picked, so nothing local blocks a pick.
    const resolved = view()
    expect(resolved.mode === 'choosing' && resolved.choices).toEqual([
      { id: 'local', label: LOCAL_EXECUTION_HOST_LABEL },
      { id: 'kuba', label: 'kuba-vps' },
    ])
  })

  it('honours his pick of an Endpoint, and sends there', () => {
    const resolved = view({ selectedHostId: 'kuba' })
    expect(resolved.hostId).toBe('kuba')
    expect(executionHostForNewSession(resolved)).toBe('kuba')
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

  it('names the Endpoint a live session will refuse to run on, id and all', () => {
    // Slice 1 made that session refuse to run. The strip must not present it
    // as running here, must not stay silent about why it will not run, and
    // must say WHICH machine it named -- this is the state where naming the
    // machine matters most, and the strip exists to name the machine.
    expect(
      view({ liveSessionHostId: 'bp', endpoints: [endpoint('kuba')] }),
    ).toEqual({
      mode: 'settled',
      hostId: 'bp',
      label: 'Removed endpoint (bp)',
      warning:
        'This session names "bp", an endpoint that is no longer configured, ' +
        'so it will refuse to run.',
    })
  })

  it('tells two removed Endpoints apart, which one bare label cannot', () => {
    // Remove two machines and every one of their sessions says the same thing
    // unless the id is in it. Then he cannot tell which configuration to
    // restore, which is the whole cost of a nameless refusal.
    const [first, second] = ['kuba-vps-2', 'backpack-automations'].map(
      (hostId) => view({ liveSessionHostId: hostId, endpoints: [] }),
    )
    expect(first).not.toEqual(second)
    expect(first.mode === 'settled' && first.label).toBe(
      'Removed endpoint (kuba-vps-2)',
    )
    expect(second.mode === 'settled' && second.warning).toContain(
      'backpack-automations',
    )
  })

  it('still says it when every Endpoint is gone, because removal moves nothing', () => {
    // The "hide with no Endpoints" rule is about an empty chooser. It must not
    // silence a fact about a session that is already running somewhere else.
    expect(view({ liveSessionHostId: 'bp', endpoints: [] })).toMatchObject({
      mode: 'settled',
      hostId: 'bp',
      label: 'Removed endpoint (bp)',
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

describe('the strip and the backend read one record', () => {
  // The strip's live value is a session *record*, and the backend reads that
  // same record when it resolves where the session runs. If the two disagree,
  // the strip is lying about where the run goes -- the one thing this era
  // forbids -- so the rule is read from one place and the agreement is asserted
  // here rather than assumed (MAR-2682).
  //
  // Importing the backend's own reader is the point: a mirror of it in this
  // suite would agree with itself forever. Precedent for a `src` test reaching
  // into a DOM-free backend pure module: `relay-payload.render.test.tsx`.

  it('renders Local for exactly the records the backend resolves local', () => {
    // Mutation: give the strip its own reading again -- `live === '' ? 'local'
    // : live`, which is the narrower rule it is tempting to write -- and the
    // whitespace and padded-local rows go red while the backend still resolves
    // both of them local.
    for (const record of ['', '   ', '\t\n', ' local ', 'local']) {
      // The backend half: this session runs here.
      expect(parseExecutionHostId(record)).toBe(LOCAL_EXECUTION_HOST_ID)
      // The strip half: and the strip says so, in the same word.
      expect(view({ liveSessionHostId: record })).toEqual({
        mode: 'settled',
        hostId: LOCAL_EXECUTION_HOST_ID,
        label: LOCAL_EXECUTION_HOST_LABEL,
        warning: null,
      })
    }
  })

  it('agrees that a record naming a machine names a machine', () => {
    // The other direction, and the reason the strip does not simply trim: a
    // padded id names no configured Endpoint. The two sides need not produce the
    // same string here -- the backend trims a record, the strip repeats it back
    // so the warning can name what the session actually recorded -- but they
    // must never disagree about whether it is this machine.
    for (const record of ['kuba', ' kuba ', 'bp']) {
      expect(parseExecutionHostId(record)).not.toBe(LOCAL_EXECUTION_HOST_ID)
      const resolved = view({ liveSessionHostId: record })
      expect(resolved.hostId).toBe(record)
      expect(resolved.mode).toBe('settled')
    }
  })
})

describe('defaultPermissionPresetForHost', () => {
  it('opens a remote run at yolo, because he is not there to click allow', () => {
    expect(defaultPermissionPresetForHost('little-monster')).toBe('yolo')
    expect(defaultPermissionPresetForHost('legacy-remote')).toBe('yolo')
  })

  it('leaves this machine exactly as it opened before Endpoints existed', () => {
    expect(defaultPermissionPresetForHost(LOCAL_EXECUTION_HOST_ID)).toBe('ask')
  })

  it('reads a machine the way every other reader of a host id does', () => {
    // The strip resolves `hostId` through `isLocalExecutionHost` before this
    // ever sees it, so both halves answer the same question the same way. A
    // second reading here would be the second place the rule could drift.
    expect(defaultPermissionPresetForHost(' local ')).toBe('ask')
    expect(defaultPermissionPresetForHost('')).toBe('ask')
  })
})
