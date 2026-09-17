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
})
