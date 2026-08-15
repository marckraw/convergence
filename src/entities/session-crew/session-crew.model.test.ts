import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  selectCrewsForSession,
  useSessionCrewStore,
} from './session-crew.model'
import type { SessionCrew } from './session-crew.types'

function crew(overrides: Partial<SessionCrew> & { id: string }): SessionCrew {
  return {
    name: overrides.id,
    emoji: null,
    accentColor: null,
    position: 0,
    createdAt: '2026-08-15T10:00:00Z',
    updatedAt: '2026-08-15T10:00:00Z',
    sessionIds: [],
    ...overrides,
  }
}

type BroadcastCallback = (crews: SessionCrew[]) => void

function installMockApi(
  overrides: {
    list?: ReturnType<typeof vi.fn>
    create?: ReturnType<typeof vi.fn>
    update?: ReturnType<typeof vi.fn>
    remove?: ReturnType<typeof vi.fn>
    addMember?: ReturnType<typeof vi.fn>
    removeMember?: ReturnType<typeof vi.fn>
  } = {},
) {
  const listeners: BroadcastCallback[] = []
  const mock = {
    crew: {
      list: overrides.list ?? vi.fn().mockResolvedValue([]),
      create: overrides.create ?? vi.fn(),
      update: overrides.update ?? vi.fn(),
      delete: overrides.remove ?? vi.fn().mockResolvedValue(undefined),
      addMember: overrides.addMember ?? vi.fn(),
      removeMember: overrides.removeMember ?? vi.fn(),
      onUpdated: vi.fn((cb: BroadcastCallback) => {
        listeners.push(cb)
        return () => {
          const idx = listeners.indexOf(cb)
          if (idx >= 0) listeners.splice(idx, 1)
        }
      }),
    },
  }
  Object.defineProperty(globalThis, 'window', {
    value: { electronAPI: mock },
    writable: true,
    configurable: true,
  })
  return { mock, listeners }
}

describe('useSessionCrewStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionCrewStore.getState().unsubscribeBroadcast?.()
    useSessionCrewStore.setState({
      crews: [],
      isLoaded: false,
      error: null,
      unsubscribeBroadcast: null,
    })
  })

  it('loads crews in position order', async () => {
    installMockApi({
      list: vi
        .fn()
        .mockResolvedValue([
          crew({ id: 'b', position: 2 }),
          crew({ id: 'a', position: 1 }),
        ]),
    })

    await useSessionCrewStore.getState().load()

    expect(useSessionCrewStore.getState().crews.map((c) => c.id)).toEqual([
      'a',
      'b',
    ])
    expect(useSessionCrewStore.getState().isLoaded).toBe(true)
  })

  it('replaces the roster when another window broadcasts a change', async () => {
    const { listeners } = installMockApi()
    await useSessionCrewStore.getState().load()

    listeners.forEach((notify) =>
      notify([crew({ id: 'fresh', sessionIds: ['s1'] })]),
    )

    expect(useSessionCrewStore.getState().crews).toEqual([
      crew({ id: 'fresh', sessionIds: ['s1'] }),
    ])
  })

  it('records an error instead of throwing when loading fails', async () => {
    installMockApi({ list: vi.fn().mockRejectedValue(new Error('db is gone')) })

    await useSessionCrewStore.getState().load()

    expect(useSessionCrewStore.getState().error).toBe('db is gone')
    expect(useSessionCrewStore.getState().isLoaded).toBe(false)
  })

  it('upserts the crew returned by a membership change', async () => {
    const updated = crew({ id: 'a', sessionIds: ['s1'] })
    installMockApi({
      list: vi.fn().mockResolvedValue([crew({ id: 'a' })]),
      addMember: vi.fn().mockResolvedValue(updated),
    })
    await useSessionCrewStore.getState().load()

    const result = await useSessionCrewStore.getState().addMember('a', 's1')

    expect(result).toEqual(updated)
    expect(useSessionCrewStore.getState().crews).toEqual([updated])
  })

  it('drops a deleted crew from the roster', async () => {
    installMockApi({
      list: vi
        .fn()
        .mockResolvedValue([crew({ id: 'a' }), crew({ id: 'b', position: 1 })]),
    })
    await useSessionCrewStore.getState().load()

    await useSessionCrewStore.getState().deleteCrew('a')

    expect(useSessionCrewStore.getState().crews.map((c) => c.id)).toEqual(['b'])
  })

  it('reports a failed mutation without losing the roster', async () => {
    installMockApi({
      list: vi.fn().mockResolvedValue([crew({ id: 'a' })]),
      update: vi.fn().mockRejectedValue(new Error('Crew name cannot be empty')),
    })
    await useSessionCrewStore.getState().load()

    const result = await useSessionCrewStore.getState().updateCrew('a', {
      name: ' ',
    })

    expect(result).toBeNull()
    expect(useSessionCrewStore.getState().error).toBe(
      'Crew name cannot be empty',
    )
    expect(useSessionCrewStore.getState().crews.map((c) => c.id)).toEqual(['a'])
  })
})

describe('selectCrewsForSession', () => {
  it('returns every crew holding the session', () => {
    const state = {
      crews: [
        crew({ id: 'a', sessionIds: ['s1', 's2'] }),
        crew({ id: 'b', sessionIds: ['s2'] }),
        crew({ id: 'c', sessionIds: ['s1'] }),
      ],
    }

    expect(selectCrewsForSession(state, 's1').map((c) => c.id)).toEqual([
      'a',
      'c',
    ])
  })

  it('returns an empty list without a session', () => {
    expect(selectCrewsForSession({ crews: [] }, null)).toEqual([])
  })
})
