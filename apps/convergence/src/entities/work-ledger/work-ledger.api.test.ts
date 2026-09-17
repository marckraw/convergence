import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { workLedgerApi } from './work-ledger.api'
import { useWorkLedgerStore } from './work-ledger.model'
import type { WorkLedgerSnapshot } from './work-ledger.types'

describe('MAR-3097 R7: the panel never writes', () => {
  it('the ledger API has exactly `list` and `onUpdated`', () => {
    expectTypeOf<keyof typeof workLedgerApi>().toEqualTypeOf<
      'list' | 'onUpdated'
    >()
    // Mutation: add `setStatus` -> red here (and at the type above).
    expect(Object.keys(workLedgerApi).sort()).toEqual(['list', 'onUpdated'])
  })
})

describe('the ledger store', () => {
  afterEach(() => {
    useWorkLedgerStore.setState({
      snapshots: {},
      broadcastCount: {},
      error: null,
      unsubscribeBroadcast: null,
    })
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  it('reads each crew, subscribes once, and takes a broadcast', async () => {
    let push: (snapshot: WorkLedgerSnapshot) => void = () => {}
    const onUpdated = vi.fn((callback: (s: WorkLedgerSnapshot) => void) => {
      push = callback
      return () => {}
    })
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      workLedger: {
        list: vi.fn(async (crewId: string) => ({
          crewId,
          entries: [],
          trackerHealth: null,
        })),
        onUpdated,
      },
    }

    await useWorkLedgerStore.getState().load(['a', 'b'])
    await useWorkLedgerStore.getState().load(['a'])
    expect(onUpdated).toHaveBeenCalledTimes(1)
    expect(Object.keys(useWorkLedgerStore.getState().snapshots).sort()).toEqual(
      ['a', 'b'],
    )

    push({
      crewId: 'a',
      entries: [],
      trackerHealth: {
        state: 'unreachable',
        since: '2026-09-17T12:00:00.000Z',
        lastOkAt: null,
        backoffUntil: null,
      },
    })
    expect(
      useWorkLedgerStore.getState().snapshots.a?.trackerHealth?.state,
    ).toBe('unreachable')
  })

  it('lap 2, C: a list answer never replaces a broadcast that landed after it was asked for', async () => {
    let push: (snapshot: WorkLedgerSnapshot) => void = () => {}
    let answer: (snapshot: WorkLedgerSnapshot) => void = () => {}
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      workLedger: {
        list: vi.fn(
          () =>
            new Promise<WorkLedgerSnapshot>((resolve) => {
              answer = resolve
            }),
        ),
        onUpdated: vi.fn((callback: (s: WorkLedgerSnapshot) => void) => {
          push = callback
          return () => {}
        }),
      },
    }
    const snapshot = (since: string): WorkLedgerSnapshot => ({
      crewId: 'a',
      entries: [],
      trackerHealth: {
        state: 'ok',
        since,
        lastOkAt: since,
        backoffUntil: null,
      },
    })

    const loading = useWorkLedgerStore.getState().load(['a'])
    push(snapshot('newer-broadcast'))
    answer(snapshot('older-list'))
    await loading

    // Mutation: write the list answer blindly -> 'older-list', red.
    expect(
      useWorkLedgerStore.getState().snapshots.a?.trackerHealth?.since,
    ).toBe('newer-broadcast')
  })

  it('lap 2, C: with no broadcast in between, the list answer is taken', async () => {
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      workLedger: {
        list: vi.fn(async (crewId: string) => ({
          crewId,
          entries: [],
          trackerHealth: null,
        })),
        onUpdated: vi.fn(() => () => {}),
      },
    }
    await useWorkLedgerStore.getState().load(['a'])
    expect(useWorkLedgerStore.getState().snapshots.a).toBeDefined()
  })
})
