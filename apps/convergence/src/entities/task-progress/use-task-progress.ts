import { useEffect, useState } from 'react'
import { useTaskProgressStore } from './task-progress.model'
import type { TaskProgressView } from './task-progress.types'

const TICK_INTERVAL_MS = 1000

export function useTaskProgress(
  requestId: string | null,
): TaskProgressView | null {
  const snapshot = useTaskProgressStore((s) =>
    requestId ? (s.snapshots[requestId] ?? null) : null,
  )

  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!snapshot) return
    if (snapshot.settled) {
      setNow(Date.now())
      return
    }
    const interval = setInterval(() => {
      setNow(Date.now())
    }, TICK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [snapshot])

  if (!snapshot) return null

  const reference = snapshot.settled ? snapshot.settled.at : now
  return {
    elapsedMs: Math.max(0, reference - snapshot.startedAt),
    msSinceLastEvent: Math.max(0, reference - snapshot.lastEventAt),
    settled: snapshot.settled,
  }
}
