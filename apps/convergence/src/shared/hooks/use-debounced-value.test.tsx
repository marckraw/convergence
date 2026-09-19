import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDebouncedValue } from './use-debounced-value'

/** The debounce under Loom's search (MAR-3234 R10). */

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function mount(initial: string, immediate = (value: string) => value === '') {
  return renderHook(
    ({ value }: { value: string }) =>
      useDebouncedValue(value, 200, { immediate: immediate(value) }),
    { initialProps: { value: initial } },
  )
}

describe('useDebouncedValue', () => {
  it('follows on the trailing edge: nothing at 199 ms after the last change, the value at 200', () => {
    const hook = mount('')
    hook.rerender({ value: 'a' })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    hook.rerender({ value: 'ab' })
    act(() => {
      vi.advanceTimersByTime(199)
    })
    // Mutation: leading edge / no reset of the timer on a change -> 'a' or
    // 'ab' here, red.
    expect(hook.result.current[0]).toBe('')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(hook.result.current[0]).toBe('ab')
  })

  it('an immediate value is followed in the same render, with no timer', () => {
    const hook = mount('')
    hook.rerender({ value: 'abc' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(hook.result.current[0]).toBe('abc')
    hook.rerender({ value: '' })
    // Mutation: ignore `immediate` -> 'abc' until 200 ms later, red.
    expect(hook.result.current[0]).toBe('')
    // And the next keystroke after a clear waits again, from the cleared value.
    hook.rerender({ value: 'x' })
    expect(hook.result.current[0]).toBe('')
  })

  it('flush takes the current value at once', () => {
    const hook = mount('')
    hook.rerender({ value: '3233' })
    act(() => {
      hook.result.current[1]()
    })
    // Mutation: flush a stale value (the one from the last render the
    // callback saw) -> '' here, red.
    expect(hook.result.current[0]).toBe('3233')
  })
})
