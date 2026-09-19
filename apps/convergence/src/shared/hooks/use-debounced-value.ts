import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A value that follows another after it has been still for `delayMs`
 * (MAR-3234 R10), trailing edge -- plus the two ways around the wait.
 *
 * - `immediate`: while true, the value is followed in the SAME render, with
 *   no timer at all. Loom passes "the field is empty", so a clear is never a
 *   delay a person has to sit through.
 * - `flush()`: take the current value now (Loom's Enter).
 *
 * The source value itself is never delayed -- only what is derived from the
 * copy this returns -- so an input bound to the source never lags.
 */
export function useDebouncedValue<T>(
  value: T,
  delayMs: number,
  options: { immediate?: boolean } = {},
): [T, () => void] {
  const immediate = options.immediate === true
  const [settled, setSettled] = useState(value)
  const latest = useRef(value)
  latest.current = value

  useEffect(() => {
    if (immediate) {
      setSettled(value)
      return
    }
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs, immediate])

  const flush = useCallback(() => setSettled(latest.current), [])

  // Immediate reads the source this render, not after the effect has run:
  // one render showing the old value would be the delay this option exists
  // to refuse.
  return [immediate ? value : settled, flush]
}
