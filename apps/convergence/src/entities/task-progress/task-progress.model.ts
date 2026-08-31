import { create } from 'zustand'
import { applyEvent } from './task-progress.pure'
import type {
  TaskProgressEvent,
  TaskProgressSnapshot,
} from './task-progress.types'

export const TASK_PROGRESS_EVICTION_GRACE_MS = 10_000

interface TaskProgressState {
  snapshots: Record<string, TaskProgressSnapshot>
}

interface TaskProgressActions {
  ingest: (event: TaskProgressEvent) => void
  evict: (requestId: string) => void
  reset: () => void
  getSnapshot: (requestId: string) => TaskProgressSnapshot | null
}

export type TaskProgressStore = TaskProgressState & TaskProgressActions

type EvictScheduler = (requestId: string, delayMs: number) => void

const defaultEvictScheduler: EvictScheduler = (requestId, delayMs) => {
  setTimeout(() => {
    useTaskProgressStore.getState().evict(requestId)
  }, delayMs)
}

let scheduleEvict: EvictScheduler = defaultEvictScheduler

// Visible for tests: override the eviction timer with a synchronous stub
// so we don't need real timers in store reducer tests.
export function __setEvictScheduler(next: EvictScheduler | null): void {
  scheduleEvict = next ?? defaultEvictScheduler
}

export const useTaskProgressStore = create<TaskProgressStore>((set, get) => ({
  snapshots: {},

  ingest: (event) => {
    set((state) => {
      const prev = state.snapshots[event.requestId] ?? null
      const next = applyEvent(prev, event)
      return {
        snapshots: { ...state.snapshots, [event.requestId]: next },
      }
    })

    if (event.kind === 'settled') {
      scheduleEvict(event.requestId, TASK_PROGRESS_EVICTION_GRACE_MS)
    }
  },

  evict: (requestId) => {
    set((state) => {
      if (!(requestId in state.snapshots)) return state
      const next = { ...state.snapshots }
      delete next[requestId]
      return { snapshots: next }
    })
  },

  reset: () => {
    set({ snapshots: {} })
  },

  getSnapshot: (requestId) => get().snapshots[requestId] ?? null,
}))
