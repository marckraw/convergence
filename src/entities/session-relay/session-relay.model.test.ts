import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  selectHopsForCrew,
  selectRelaysForCrew,
  selectRelaysForSession,
  useSessionRelayStore,
} from './session-relay.model'
import type { RelayHop, SessionRelay } from './session-relay.types'

function relay(
  overrides: Partial<SessionRelay> & { id: string },
): SessionRelay {
  return {
    crewId: 'c1',
    sourceSessionId: 's1',
    trigger: 'settled',
    action: 'hail',
    targetSessionId: 's2',
    spawnSpec: null,
    instruction: null,
    opener: null,
    armed: true,
    createdAt: '2026-08-15T10:00:00Z',
    updatedAt: '2026-08-15T10:00:00Z',
    ...overrides,
  }
}

function hop(overrides: Partial<RelayHop> & { id: string }): RelayHop {
  return {
    relayId: 'r1',
    crewId: 'c1',
    flowRunId: 'run-1',
    firedAt: '2026-08-15T10:00:00Z',
    sourceSessionId: 's1',
    targetSessionId: 's2',
    spawnedSessionId: null,
    triggerStatus: 'completed',
    payloadPreview: 'Done.',
    outcome: 'delivered',
    error: null,
    ...overrides,
  }
}

type RelayCallback = (relays: SessionRelay[]) => void
type HopCallback = (hop: RelayHop) => void

function installMockApi(
  overrides: {
    list?: ReturnType<typeof vi.fn>
    create?: ReturnType<typeof vi.fn>
    update?: ReturnType<typeof vi.fn>
    remove?: ReturnType<typeof vi.fn>
    arm?: ReturnType<typeof vi.fn>
    disarm?: ReturnType<typeof vi.fn>
    listHops?: ReturnType<typeof vi.fn>
  } = {},
) {
  const relayListeners: RelayCallback[] = []
  const hopListeners: HopCallback[] = []
  const mock = {
    relay: {
      list: overrides.list ?? vi.fn().mockResolvedValue([]),
      create: overrides.create ?? vi.fn(),
      update: overrides.update ?? vi.fn(),
      delete: overrides.remove ?? vi.fn().mockResolvedValue(undefined),
      arm: overrides.arm ?? vi.fn(),
      disarm: overrides.disarm ?? vi.fn(),
      listHops: overrides.listHops ?? vi.fn().mockResolvedValue([]),
      onUpdated: vi.fn((cb: RelayCallback) => {
        relayListeners.push(cb)
        return () => {
          const idx = relayListeners.indexOf(cb)
          if (idx >= 0) relayListeners.splice(idx, 1)
        }
      }),
      onHopAppended: vi.fn((cb: HopCallback) => {
        hopListeners.push(cb)
        return () => {
          const idx = hopListeners.indexOf(cb)
          if (idx >= 0) hopListeners.splice(idx, 1)
        }
      }),
    },
  }
  Object.defineProperty(globalThis, 'window', {
    value: { electronAPI: mock },
    writable: true,
    configurable: true,
  })
  return { mock, relayListeners, hopListeners }
}

describe('useSessionRelayStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionRelayStore.getState().unsubscribeBroadcast?.()
    useSessionRelayStore.getState().unsubscribeHops?.()
    useSessionRelayStore.setState({
      relays: [],
      hopsByCrewId: {},
      isLoaded: false,
      error: null,
      unsubscribeBroadcast: null,
      unsubscribeHops: null,
    })
  })

  it('loads wires oldest first', async () => {
    installMockApi({
      list: vi
        .fn()
        .mockResolvedValue([
          relay({ id: 'b', createdAt: '2026-08-15T12:00:00Z' }),
          relay({ id: 'a', createdAt: '2026-08-15T09:00:00Z' }),
        ]),
    })

    await useSessionRelayStore.getState().load()

    expect(useSessionRelayStore.getState().relays.map((r) => r.id)).toEqual([
      'a',
      'b',
    ])
    expect(useSessionRelayStore.getState().isLoaded).toBe(true)
  })

  it('replaces the wire list when another window changes one', async () => {
    const { relayListeners } = installMockApi()
    await useSessionRelayStore.getState().load()

    relayListeners[0]([relay({ id: 'a', armed: false })])

    expect(useSessionRelayStore.getState().relays).toEqual([
      relay({ id: 'a', armed: false }),
    ])
  })

  it('grows an open trail live as the engine fires', async () => {
    const { hopListeners } = installMockApi({
      listHops: vi.fn().mockResolvedValue([hop({ id: 'h1' })]),
    })
    await useSessionRelayStore.getState().load()
    await useSessionRelayStore.getState().loadHops('c1')

    hopListeners[0](hop({ id: 'h2' }))

    expect(
      selectHopsForCrew(useSessionRelayStore.getState(), 'c1').map((h) => h.id),
    ).toEqual(['h2', 'h1'])
  })

  it('ignores hops for a crew whose trail nobody opened', async () => {
    const { hopListeners } = installMockApi()
    await useSessionRelayStore.getState().load()

    hopListeners[0](hop({ id: 'h1', crewId: 'unopened' }))

    expect(useSessionRelayStore.getState().hopsByCrewId).toEqual({})
  })

  it('arms and disarms through the store', async () => {
    const disarm = vi.fn().mockResolvedValue(relay({ id: 'a', armed: false }))
    const arm = vi.fn().mockResolvedValue(relay({ id: 'a', armed: true }))
    installMockApi({
      list: vi.fn().mockResolvedValue([relay({ id: 'a' })]),
      arm,
      disarm,
    })
    await useSessionRelayStore.getState().load()

    await useSessionRelayStore.getState().setArmed('a', false)
    expect(useSessionRelayStore.getState().relays[0].armed).toBe(false)

    await useSessionRelayStore.getState().setArmed('a', true)
    expect(useSessionRelayStore.getState().relays[0].armed).toBe(true)
    expect(disarm).toHaveBeenCalledWith('a')
    expect(arm).toHaveBeenCalledWith('a')
  })

  it('keeps the rejected wire out of the list and surfaces why', async () => {
    installMockApi({
      create: vi
        .fn()
        .mockRejectedValue(
          new Error('A relay cannot hail the session it listens to'),
        ),
    })
    await useSessionRelayStore.getState().load()

    const created = await useSessionRelayStore.getState().createRelay({
      crewId: 'c1',
      sourceSessionId: 's1',
      action: 'hail',
      targetSessionId: 's1',
    })

    expect(created).toBeNull()
    expect(useSessionRelayStore.getState().relays).toEqual([])
    expect(useSessionRelayStore.getState().error).toBe(
      'A relay cannot hail the session it listens to',
    )
  })

  it('drops a deleted wire without waiting for a broadcast', async () => {
    installMockApi({ list: vi.fn().mockResolvedValue([relay({ id: 'a' })]) })
    await useSessionRelayStore.getState().load()

    await useSessionRelayStore.getState().deleteRelay('a')

    expect(useSessionRelayStore.getState().relays).toEqual([])
  })
})

describe('relay selectors', () => {
  const relays = [
    relay({
      id: 'a',
      crewId: 'c1',
      sourceSessionId: 's1',
      targetSessionId: 's2',
    }),
    relay({
      id: 'b',
      crewId: 'c2',
      sourceSessionId: 's2',
      targetSessionId: 's3',
    }),
  ]

  it('picks the wires living in one crew', () => {
    expect(selectRelaysForCrew({ relays }, 'c1').map((r) => r.id)).toEqual([
      'a',
    ])
    expect(selectRelaysForCrew({ relays }, null)).toEqual([])
  })

  it('picks the wires touching a session at either end', () => {
    expect(selectRelaysForSession({ relays }, 's2').map((r) => r.id)).toEqual([
      'a',
      'b',
    ])
    expect(selectRelaysForSession({ relays }, 's3').map((r) => r.id)).toEqual([
      'b',
    ])
    expect(selectRelaysForSession({ relays }, undefined)).toEqual([])
  })

  it('returns an empty trail for a crew nobody opened', () => {
    expect(selectHopsForCrew({ hopsByCrewId: {} }, 'c1')).toEqual([])
    expect(selectHopsForCrew({ hopsByCrewId: {} }, null)).toEqual([])
  })
})
