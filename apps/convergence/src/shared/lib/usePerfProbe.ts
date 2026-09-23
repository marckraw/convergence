import { useEffect, useRef } from 'react'
import type { ProfilerOnRenderCallback } from 'react'
import { perfApi } from './perf.api'
import { percentile, type PerfRoot } from './perf-marks.pure'

let state: ReturnType<typeof createState> | undefined
function createState() {
  return {
    startedAt: performance.now(),
    burstStart: Infinity,
    burstEnd: -Infinity,
    paints: [] as number[],
    inputDelays: [] as { start: number; ms: number }[],
    longTasks: [] as { start: number; ms: number }[],
    identities: [] as number[],
    commits: { composer: [], sidebar: [], 'wave-panel': [] } as Record<
      PerfRoot,
      { at: number; ms: number }[]
    >,
  }
}
function activeState() {
  return (state ??= createState())
}

export const recordPerfCommit: ProfilerOnRenderCallback = (
  id,
  _phase,
  actualDuration,
) => {
  activeState().commits[id as PerfRoot].push({
    at: performance.now(),
    ms: actualDuration,
  })
}

export function rendererPerfReport() {
  const current = activeState()
  const minutes = (performance.now() - current.startedAt) / 60000
  const inBurst = (time: number) =>
    time >= current.burstStart && time <= current.burstEnd
  const tasks = current.longTasks.filter((entry) => inBurst(entry.start))
  return {
    measured: current.paints.length > 0,
    elapsedSeconds: minutes * 60,
    keystrokeToPaint: {
      samples: current.paints.length,
      p50: percentile(current.paints, 0.5),
      p95: percentile(current.paints, 0.95),
    },
    longTasks: {
      count: tasks.length,
      totalMs: tasks.reduce((sum, entry) => sum + entry.ms, 0),
    },
    inputDelaySamples: current.inputDelays.filter((entry) =>
      inBurst(entry.start),
    ).length,
    inputDelayP95: percentile(
      current.inputDelays
        .filter((entry) => inBurst(entry.start))
        .map((entry) => entry.ms),
      0.95,
    ),
    commits: Object.fromEntries(
      Object.entries(current.commits).map(([id, values]) => [
        id,
        {
          count: values.length,
          perMinute: values.length / minutes,
          totalMs: values.reduce((sum, entry) => sum + entry.ms, 0),
          burstCount: values.filter((entry) => inBurst(entry.at)).length,
          commitsPerSessionsIdentity:
            current.identities.filter(inBurst).length > 0
              ? values.filter((entry) => inBurst(entry.at)).length /
                current.identities.filter(inBurst).length
              : 0,
        },
      ]),
    ),
    sessionsIdentityChanges: current.identities.filter(inBurst).length,
  }
}

/** The immutable preload flag is fixed for the lifetime of this renderer. */
export function usePerfSessionsIdentity(sessions: unknown): void {
  if (!perfApi.isEnabled()) return
  // eslint-disable-next-line react-hooks/rules-of-hooks -- The preload flag cannot change during a mount; off allocates no ref.
  const previous = useRef(sessions)
  if (previous.current !== sessions) {
    activeState().identities.push(performance.now())
    previous.current = sessions
  }
}

/** Observes browser events and paints, never schedules a sampling timer. */
export function usePerfProbe(): void {
  if (!perfApi.isEnabled()) return
  // eslint-disable-next-line react-hooks/rules-of-hooks -- The immutable preload flag keeps the hook order stable and off mounts nothing.
  useEffect(() => {
    state = createState()
    const current = state
    const longtask = new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        current.longTasks.push({ start: entry.startTime, ms: entry.duration })
    })
    const event = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const timing = entry as PerformanceEventTiming
        current.inputDelays.push({
          start: entry.startTime,
          ms: timing.processingStart - entry.startTime,
        })
      }
    })
    longtask.observe({ type: 'longtask', buffered: true })
    const eventOptions = {
      type: 'event',
      buffered: true,
      durationThreshold: 16,
    }
    event.observe(eventOptions)
    let sequence = 0
    let pending:
      | { name: string; start: number; target: HTMLTextAreaElement }
      | undefined
    const frames = new Set<number>()
    const frame = (callback: () => void) => {
      const id = requestAnimationFrame(() => {
        frames.delete(id)
        callback()
      })
      frames.add(id)
    }
    const keydown = (e: KeyboardEvent) => {
      if (!(e.target instanceof HTMLTextAreaElement)) return
      const start = performance.now()
      current.burstStart = Math.min(current.burstStart, start)
      const name = `convergence-perf-key-${++sequence}`
      performance.mark(name)
      pending = { name, start, target: e.target }
    }
    const input = (e: Event) => {
      const key = pending
      if (!key || e.target !== key.target) return
      pending = undefined
      const value = key.target.value
      // The first frame observes the committed controlled value; the second
      // bounds the next paint. This is a paint estimate, not a GPU timestamp.
      frame(() => {
        if (key.target.value !== value) {
          performance.clearMarks(key.name)
          return
        }
        frame(() => {
          const end = performance.now()
          current.burstEnd = end
          current.paints.push(end - key.start)
          performance.measure(`${key.name}-paint`, key.name)
          performance.clearMarks(key.name)
          performance.clearMeasures(`${key.name}-paint`)
        })
      })
    }
    document.addEventListener('keydown', keydown, true)
    document.addEventListener('input', input, true)
    return () => {
      longtask.disconnect()
      event.disconnect()
      document.removeEventListener('keydown', keydown, true)
      document.removeEventListener('input', input, true)
      for (const id of frames) cancelAnimationFrame(id)
      if (pending) performance.clearMarks(pending.name)
    }
  }, [])
}
