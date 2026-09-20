import { create } from 'zustand'
import { useSessionStore } from '@/entities/session'
import { contextDrillApi } from './context-drill.api'
import type {
  DrillBeat,
  DrillChange,
  DrillDescription,
  DrillOutcomeRecord,
} from './context-drill.types'

interface ContextDrillState {
  /** The last `describe` answer per conversation. */
  descriptions: Record<string, DrillDescription>
  /** What a running routine is doing NOW; absent means nothing is running. */
  beats: Record<string, DrillBeat>
  /** The last ending per conversation, stamped so a host can tell it apart. */
  outcomes: Record<string, DrillOutcomeRecord>
  /** Conversations whose cancel the backend accepted and has not ended yet. */
  cancelRequested: Record<string, boolean>
  unsubscribe: (() => void) | null
}

interface ContextDrillActions {
  refresh: (sessionId: string) => Promise<void>
  run: (sessionId: string) => Promise<void>
  cancel: (sessionId: string) => Promise<string | null>
  handleChange: (change: DrillChange) => void
  clearCancelRequested: (sessionId: string) => void
  subscribe: () => () => void
}

export type ContextDrillStore = ContextDrillState & ContextDrillActions

/**
 * The stamp on every recorded ending. Monotonic and never reset, across all
 * conversations, so no two records this process produces can collide.
 */
let outcomeSeq = 0

function omit<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map
  const next = { ...map }
  delete next[key]
  return next
}

/**
 * The context figure this conversation is carrying right now, or null when
 * nobody has measured it (Cursor reports none, and a fresh session has none).
 */
function readUsedPercentage(sessionId: string): number | null {
  const session = useSessionStore
    .getState()
    .globalSessions.find((entry) => entry.id === sessionId)
  const contextWindow = session?.contextWindow
  if (!contextWindow || contextWindow.availability === 'unavailable')
    return null
  return contextWindow.usedPercentage
}

/**
 * The renderer's mirror of the drill (MAR-3256 R2).
 *
 * The `run` promise lives HERE, not in the component that started it. The
 * seal beat spends a whole provider turn -- minutes -- and the popover that
 * holds the button closes the moment the pointer leaves it. A promise awaited
 * inside that component would be awaited by a component that no longer
 * exists, and the outcome of the run would land in a `setState` React drops
 * on the floor. Owned by the store, the ending is recorded wherever Marcin
 * happens to be looking by then.
 */
export const useContextDrillStore = create<ContextDrillStore>((set, get) => ({
  descriptions: {},
  beats: {},
  outcomes: {},
  cancelRequested: {},
  unsubscribe: null,

  refresh: async (sessionId) => {
    try {
      const description = await contextDrillApi.describe(sessionId)
      // A `changed` event is only heard by a renderer that was already
      // listening. A window opened -- or reopened -- while a routine is
      // running has no other way to learn the beat, and without it the
      // control offers "Run the drill" instead of the Cancel that is the
      // routine's only way out (MAR-3256 R6).
      //
      // Seeding only, never clearing: a `describe` that raced the start of a
      // beat answers `null` about a beat that has since begun, and the
      // `changed` event with `beat: null` stays the one thing that ends one.
      const beat = description.beat
      set((state) => ({
        descriptions: { ...state.descriptions, [sessionId]: description },
        beats:
          beat === null ? state.beats : { ...state.beats, [sessionId]: beat },
      }))
    } catch {
      // A describe that cannot be answered is not news anybody can act on,
      // and the last answer is a better guess than none: leaving the previous
      // description in place keeps a control on screen rather than making it
      // blink out of existence every time main is busy.
    }
  },

  run: async (sessionId) => {
    // Read BEFORE the await, because the compaction this call is about to run
    // is what destroys the figure.
    const before = readUsedPercentage(sessionId)
    const outcome = await contextDrillApi.run(sessionId)
    set((state) => ({
      outcomes: {
        ...state.outcomes,
        [sessionId]: { seq: ++outcomeSeq, outcome, before },
      },
    }))
  },

  cancel: async (sessionId) => {
    const result = await contextDrillApi.cancel(sessionId)
    // Only a cancel the backend ACCEPTED is remembered. A refused one -- the
    // compaction beat cannot be interrupted -- changes nothing, and marking
    // it anyway would make the next failure of that run read as "you
    // cancelled it" when nobody did.
    if (!result.ok) return result.reason
    set((state) => ({
      cancelRequested: { ...state.cancelRequested, [sessionId]: true },
    }))
    return null
  },

  handleChange: (change) => {
    if (change.beat !== null) {
      set((state) => ({
        beats: { ...state.beats, [change.sessionId]: change.beat as DrillBeat },
      }))
      return
    }
    // The routine ended. Dropping the beat is only half of it: whether the
    // drill can be offered again depends on a readiness the backend owns and
    // this side cannot derive, so the ending is also the moment to re-ask.
    set((state) => ({ beats: omit(state.beats, change.sessionId) }))
    void get().refresh(change.sessionId)
  },

  clearCancelRequested: (sessionId) => {
    set((state) => ({
      cancelRequested: omit(state.cancelRequested, sessionId),
    }))
  },

  /**
   * One listener for the whole app, installed by the host of R4.
   *
   * Idempotent on purpose: StrictMode mounts the host twice, and two
   * listeners would record every beat twice and re-`describe` twice for one
   * ending.
   */
  subscribe: () => {
    const existing = get().unsubscribe
    if (existing) existing()
    const unsubscribe = contextDrillApi.onChanged((change) => {
      get().handleChange(change)
    })
    set({ unsubscribe })
    return () => {
      // Only if it is still ours: a later `subscribe` already replaced it,
      // and tearing that one down would leave the app deaf.
      if (get().unsubscribe !== unsubscribe) return
      unsubscribe()
      set({ unsubscribe: null })
    }
  },
}))
