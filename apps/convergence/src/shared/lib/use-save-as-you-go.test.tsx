import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSaveAsYouGo } from './use-save-as-you-go'

describe('useSaveAsYouGo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps one scheduler, reading the latest draft when it saves', async () => {
    const saved: string[] = []
    const { result, rerender } = renderHook(
      ({ draft }) =>
        useSaveAsYouGo(() => async () => {
          saved.push(draft)
        }),
      { initialProps: { draft: 'a' } },
    )
    const first = result.current
    result.current.scheduleSave(400)
    rerender({ draft: 'ab' })
    expect(result.current).toBe(first)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(saved).toEqual(['ab'])
  })

  it('saves typing that still waits when the view goes', async () => {
    const save = vi.fn(async () => {})
    const { result, unmount } = renderHook(() => useSaveAsYouGo(() => save))

    result.current.scheduleSave(400)
    // Mutation: drop the unmount flush -> nothing is saved, red.
    unmount()
    await act(async () => {
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledOnce()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(save).toHaveBeenCalledOnce()
  })
})
