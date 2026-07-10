import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  providerDebugApi,
  useProviderDebugStore,
  type ProviderDebugEntry,
} from '@/entities/provider-debug'
import { SessionDebugDrawerContainer } from './session-debug-drawer.container'

describe('SessionDebugDrawerContainer', () => {
  beforeEach(() => {
    useProviderDebugStore.getState().reset()
    vi.restoreAllMocks()
  })

  it('retains live debug events only while the drawer is open', async () => {
    let listener: ((entry: ProviderDebugEntry) => void) | null = null
    const unsubscribe = vi.fn()
    vi.spyOn(providerDebugApi, 'subscribe').mockImplementation(
      (_sessionId, callback) => {
        listener = callback
        return unsubscribe
      },
    )
    vi.spyOn(providerDebugApi, 'list').mockResolvedValue([])

    const view = render(
      <SessionDebugDrawerContainer
        sessionId="session-1"
        open
        onOpenChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(providerDebugApi.list).toHaveBeenCalledWith('session-1')
    })
    expect(providerDebugApi.subscribe).toHaveBeenCalledWith(
      'session-1',
      expect.any(Function),
    )

    const entry: ProviderDebugEntry = {
      sessionId: 'session-1',
      providerId: 'codex',
      at: 1,
      direction: 'in',
      channel: 'event',
    }
    act(() => listener?.(entry))
    expect(useProviderDebugStore.getState().bySession['session-1']).toEqual([
      entry,
    ])

    view.rerender(
      <SessionDebugDrawerContainer
        sessionId="session-1"
        open={false}
        onOpenChange={vi.fn()}
      />,
    )

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(
      useProviderDebugStore.getState().bySession['session-1'],
    ).toBeUndefined()
  })
})
