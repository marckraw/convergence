import { useEffect, useState } from 'react'
import {
  advanceDelayedLoading,
  type DelayedLoading,
  idleLoading,
  isLoadingVisible,
  nextLoadingChange,
} from './delayed-loading.pure'

/**
 * Whether to show a loading state for work that is `pending`: only after 300 ms, and once shown,
 * for at least 400 ms, so quick answers never flash a spinner and slow ones never flicker. The
 * decisions live in delayed-loading.pure.ts; this hook only keeps the clock.
 */
export function useDelayedLoading(pending: boolean): boolean {
  const [state, setState] = useState<DelayedLoading>(idleLoading)

  useEffect(() => {
    setState((current) =>
      advanceDelayedLoading(current, pending, performance.now()),
    )
  }, [pending])

  useEffect(() => {
    const wakeAt = nextLoadingChange(state)
    if (wakeAt === null) return
    const timer = window.setTimeout(
      () =>
        // A timer may fire a fraction early; it was set for wakeAt, so the moment has come.
        setState((current) =>
          advanceDelayedLoading(
            current,
            pending,
            Math.max(performance.now(), wakeAt),
          ),
        ),
      Math.max(0, wakeAt - performance.now()),
    )
    return () => window.clearTimeout(timer)
  }, [state, pending])

  return isLoadingVisible(state)
}
