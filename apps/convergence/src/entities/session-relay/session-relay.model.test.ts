import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  selectHopTrailForCrew,
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
    conditionToken: null,
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
    baton: null,
    roundNumber: null,
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
    clearHops?: ReturnType<typeof vi.fn>
  } = {},
) {
  const relayListeners: RelayCallback[] = []
  const hopListeners: HopCallback[] = []
  const clearedListeners: Array<(crewId: string) => void> = []
  const mock = {
    relay: {
      list: overrides.list ?? vi.fn().mockResolvedValue([]),
      create: overrides.create ?? vi.fn(),
      update: overrides.update ?? vi.fn(),
      delete: overrides.remove ?? vi.fn().mockResolvedValue(undefined),
      arm: overrides.arm ?? vi.fn(),
      disarm: overrides.disarm ?? vi.fn(),
      listHops: overrides.listHops ?? vi.fn().mockResolvedValue([]),
      clearHops:
        overrides.clearHops ??
        vi.fn().mockResolvedValue({ removed: 0, kept: 0 }),
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
      onHopsCleared: vi.fn((cb: (crewId: string) => void) => {
        clearedListeners.push(cb)
        return () => {
          const idx = clearedListeners.indexOf(cb)
          if (idx >= 0) clearedListeners.splice(idx, 1)
        }
      }),
    },
  }
  Object.defineProperty(globalThis, 'window', {
    value: { electronAPI: mock },
    writable: true,
    configurable: true,
  })
  return { mock, relayListeners, hopListeners, clearedListeners }
}

describe('useSessionRelayStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionRelayStore.getState().unsubscribeBroadcast?.()
    useSessionRelayStore.getState().unsubscribeHops?.()
    useSessionRelayStore.getState().unsubscribeHopsCleared?.()
    useSessionRelayStore.setState({
      relays: [],
      hopsByCrewId: {},
      isLoaded: false,
      error: null,
      unsubscribeBroadcast: null,
      unsubscribeHops: null,
      unsubscribeHopsCleared: null,
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

  describe('paging back through a trail', () => {
    /** Newest first, the order the ledger hands them back in. */
    function page(from: number, count: number): RelayHop[] {
      return Array.from({ length: count }, (_, index) =>
        hop({ id: `h${from + index}` }),
      )
    }

    it('asks for one row more than a page, and keeps the page', async () => {
      const listHops = vi.fn().mockResolvedValue(page(1, 51))
      installMockApi({ listHops })
      await useSessionRelayStore.getState().load()

      await useSessionRelayStore.getState().loadHops('c1')

      expect(listHops).toHaveBeenCalledWith('c1', 51, null)
      const trail = selectHopTrailForCrew(useSessionRelayStore.getState(), 'c1')
      expect(trail.hops).toHaveLength(50)
      expect(trail.hasMore).toBe(true)
    })

    it('knows there is nothing behind a page that did not fill', async () => {
      installMockApi({ listHops: vi.fn().mockResolvedValue(page(1, 3)) })
      await useSessionRelayStore.getState().load()

      await useSessionRelayStore.getState().loadHops('c1')

      expect(
        selectHopTrailForCrew(useSessionRelayStore.getState(), 'c1').hasMore,
      ).toBe(false)
    })

    it('appends the older page after the rows already on screen', async () => {
      const listHops = vi
        .fn()
        .mockResolvedValueOnce(page(1, 51))
        .mockResolvedValueOnce(page(51, 2))
      installMockApi({ listHops })
      await useSessionRelayStore.getState().load()
      await useSessionRelayStore.getState().loadHops('c1')

      await useSessionRelayStore.getState().loadOlderHops('c1')

      // Anchored on the oldest row in hand, not on an offset a live hop could
      // shift underneath the read.
      expect(listHops).toHaveBeenLastCalledWith('c1', 51, 'h50')
      const trail = selectHopTrailForCrew(useSessionRelayStore.getState(), 'c1')
      expect(trail.hops).toHaveLength(52)
      expect(trail.hops[51].id).toBe('h52')
      expect(trail.hasMore).toBe(false)
    })

    it('does not ask for more when the trail says there is none', async () => {
      const listHops = vi.fn().mockResolvedValue(page(1, 2))
      installMockApi({ listHops })
      await useSessionRelayStore.getState().load()
      await useSessionRelayStore.getState().loadHops('c1')
      listHops.mockClear()

      await useSessionRelayStore.getState().loadOlderHops('c1')

      expect(listHops).not.toHaveBeenCalled()
    })

    it('keeps a hop that landed while an older page was in flight', async () => {
      const listHops = vi
        .fn()
        .mockResolvedValueOnce(page(1, 51))
        .mockResolvedValueOnce(page(51, 1))
      const { hopListeners } = installMockApi({ listHops })
      await useSessionRelayStore.getState().load()
      await useSessionRelayStore.getState().loadHops('c1')

      const older = useSessionRelayStore.getState().loadOlderHops('c1')
      hopListeners[0](hop({ id: 'fresh' }))
      await older

      const ids = selectHopsForCrew(useSessionRelayStore.getState(), 'c1').map(
        (h) => h.id,
      )
      expect(ids[0]).toBe('fresh')
      expect(ids[ids.length - 1]).toBe('h51')
    })

    it('never truncates history someone deliberately paged in', async () => {
      const listHops = vi
        .fn()
        .mockResolvedValueOnce(page(1, 51))
        .mockResolvedValueOnce(page(51, 51))
        .mockResolvedValueOnce(page(101, 5))
      const { hopListeners } = installMockApi({ listHops })
      await useSessionRelayStore.getState().load()
      await useSessionRelayStore.getState().loadHops('c1')
      await useSessionRelayStore.getState().loadOlderHops('c1')
      await useSessionRelayStore.getState().loadOlderHops('c1')
      expect(
        selectHopsForCrew(useSessionRelayStore.getState(), 'c1'),
      ).toHaveLength(105)

      hopListeners[0](hop({ id: 'fresh' }))

      // The window holds what it held, with the newest row at the top and the
      // oldest pushed off the end -- so there is demonstrably more behind it.
      const trail = selectHopTrailForCrew(useSessionRelayStore.getState(), 'c1')
      expect(trail.hops).toHaveLength(105)
      expect(trail.hops[0].id).toBe('fresh')
      expect(trail.hasMore).toBe(true)
    })
  })

  describe('a page that lost its race', () => {
    function page(from: number, count: number): RelayHop[] {
      return Array.from({ length: count }, (_, index) =>
        hop({ id: `h${from + index}` }),
      )
    }

    /**
     * The older page and the clear are two answers about the same trail, and
     * the ledger can answer them in either order. A page fetched before the
     * wipe describes rows that no longer exist, so applying it would put
     * deleted history back on screen -- and leave a "Load older" cursor
     * pointing at a row the database has never heard of.
     */
    it('drops an older page a clear overtook, rather than resurrecting rows', async () => {
      let releaseOlder: (hops: RelayHop[]) => void = () => undefined
      const listHops = vi
        .fn()
        .mockResolvedValueOnce(page(1, 51))
        .mockImplementationOnce(
          () =>
            new Promise<RelayHop[]>((resolve) => {
              releaseOlder = resolve
            }),
        )
        .mockResolvedValueOnce([])
      installMockApi({
        listHops,
        clearHops: vi.fn().mockResolvedValue({ removed: 50, kept: 0 }),
      })
      await useSessionRelayStore.getState().load()
      await useSessionRelayStore.getState().loadHops('c1')

      const older = useSessionRelayStore.getState().loadOlderHops('c1')
      await useSessionRelayStore.getState().clearHops('c1')
      expect(selectHopsForCrew(useSessionRelayStore.getState(), 'c1')).toEqual(
        [],
      )

      releaseOlder(page(51, 2))
      await older

      expect(selectHopsForCrew(useSessionRelayStore.getState(), 'c1')).toEqual(
        [],
      )
      expect(
        selectHopTrailForCrew(useSessionRelayStore.getState(), 'c1').hasMore,
      ).toBe(false)
    })

    /**
     * The same guard read from the other side: a full reload that happens to
     * end on a different row invalidates the anchor the page was fetched from.
     */
    it('drops an older page whose anchor is no longer the oldest row', async () => {
      let releaseOlder: (hops: RelayHop[]) => void = () => undefined
      const listHops = vi
        .fn()
        .mockResolvedValueOnce(page(1, 51))
        .mockImplementationOnce(
          () =>
            new Promise<RelayHop[]>((resolve) => {
              releaseOlder = resolve
            }),
        )
        .mockResolvedValueOnce(page(1, 3))
      installMockApi({ listHops })
      await useSessionRelayStore.getState().load()
      await useSessionRelayStore.getState().loadHops('c1')

      const older = useSessionRelayStore.getState().loadOlderHops('c1')
      await useSessionRelayStore.getState().loadHops('c1')

      releaseOlder(page(51, 2))
      await older

      expect(
        selectHopsForCrew(useSessionRelayStore.getState(), 'c1').map(
          (h) => h.id,
        ),
      ).toEqual(['h1', 'h2', 'h3'])
    })

    /** Two quick presses must not append the same page twice. */
    it('applies only the first of two identical older requests', async () => {
      const listHops = vi
        .fn()
        .mockResolvedValueOnce(page(1, 51))
        .mockResolvedValue(page(51, 2))
      installMockApi({ listHops })
      await useSessionRelayStore.getState().load()
      await useSessionRelayStore.getState().loadHops('c1')

      await Promise.all([
        useSessionRelayStore.getState().loadOlderHops('c1'),
        useSessionRelayStore.getState().loadOlderHops('c1'),
      ])

      expect(
        selectHopsForCrew(useSessionRelayStore.getState(), 'c1'),
      ).toHaveLength(52)
    })
  })

  describe('clearing a trail', () => {
    it('empties it, reloads what is left, and says what stayed', async () => {
      const clearHops = vi.fn().mockResolvedValue({ removed: 4, kept: 2 })
      const listHops = vi
        .fn()
        .mockResolvedValueOnce([hop({ id: 'h1' }), hop({ id: 'h2' })])
        .mockResolvedValueOnce([hop({ id: 'h2' })])
      installMockApi({ listHops, clearHops })
      await useSessionRelayStore.getState().load()
      await useSessionRelayStore.getState().loadHops('c1')

      const result = await useSessionRelayStore.getState().clearHops('c1')

      expect(result).toEqual({ removed: 4, kept: 2 })
      expect(clearHops).toHaveBeenCalledWith('c1')
      expect(
        selectHopsForCrew(useSessionRelayStore.getState(), 'c1').map(
          (h) => h.id,
        ),
      ).toEqual(['h2'])
    })

    it('reloads a trail another window cleared', async () => {
      const listHops = vi
        .fn()
        .mockResolvedValueOnce([hop({ id: 'h1' })])
        .mockResolvedValueOnce([])
      const { clearedListeners } = installMockApi({ listHops })
      await useSessionRelayStore.getState().load()
      await useSessionRelayStore.getState().loadHops('c1')

      clearedListeners[0]('c1')
      await vi.waitFor(() =>
        expect(
          selectHopsForCrew(useSessionRelayStore.getState(), 'c1'),
        ).toEqual([]),
      )
    })

    it('ignores a clear for a crew this window is not watching', async () => {
      const listHops = vi.fn().mockResolvedValue([])
      const { clearedListeners } = installMockApi({ listHops })
      await useSessionRelayStore.getState().load()
      listHops.mockClear()

      clearedListeners[0]('a-crew-nobody-opened')

      expect(listHops).not.toHaveBeenCalled()
    })

    it('reports a refused clear instead of pretending it worked', async () => {
      installMockApi({
        listHops: vi.fn().mockResolvedValue([hop({ id: 'h1' })]),
        clearHops: vi.fn().mockRejectedValue(new Error('database is locked')),
      })
      await useSessionRelayStore.getState().load()
      await useSessionRelayStore.getState().loadHops('c1')

      expect(await useSessionRelayStore.getState().clearHops('c1')).toBeNull()
      expect(useSessionRelayStore.getState().error).toBe('database is locked')
      expect(
        selectHopsForCrew(useSessionRelayStore.getState(), 'c1'),
      ).toHaveLength(1)
    })
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
