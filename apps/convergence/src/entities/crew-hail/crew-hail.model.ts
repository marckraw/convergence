import { create } from 'zustand'
import { crewHailApi } from './crew-hail.api'
import type { CrewHail } from './crew-hail.types'

interface CrewHailState {
  /** Only the calls still asking. An answered hail is history, not an alarm. */
  hails: CrewHail[]
  isLoaded: boolean
  error: string | null
  unsubscribe: (() => void) | null
}

interface CrewHailActions {
  load: () => Promise<void>
  acknowledge: (id: string) => Promise<void>
  acknowledgeCrew: (crewId: string) => Promise<void>
}

export type CrewHailStore = CrewHailState & CrewHailActions

const EMPTY_HAILS: CrewHail[] = []

/**
 * The open calls for one crew, newest first.
 *
 * Subscribe to the whole list and narrow with this in a `useMemo`: selecting
 * inside a zustand subscription hands it a fresh array every render and spins.
 */
export function selectHailsForCrew(
  state: Pick<CrewHailState, 'hails'>,
  crewId: string | null | undefined,
): CrewHail[] {
  if (!crewId) return EMPTY_HAILS
  return state.hails.filter((hail) => hail.crewId === crewId)
}

/** Whether any crew at all is asking — the room's own amber. */
export function selectHasOpenHails(
  state: Pick<CrewHailState, 'hails'>,
): boolean {
  return state.hails.length > 0
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/**
 * Which `load()` invocation currently owns the store.
 *
 * Loads overlap -- rapid Mission Control remounts, StrictMode's double
 * effects -- and an awaited snapshot from a superseded load can resolve
 * AFTER the newer load already committed and heard broadcasts. An obsolete
 * invocation is ignored entirely, success and failure alike: its stale empty
 * snapshot must not overwrite a live hail, and its rejection is not the
 * current load's error. Monotonic on purpose; it never resets.
 */
let loadGeneration = 0

export const useCrewHailStore = create<CrewHailStore>((set, get) => ({
  hails: EMPTY_HAILS,
  isLoaded: false,
  error: null,
  unsubscribe: null,

  /**
   * Subscription first, snapshot second.
   *
   * Main can answer the list, then raise and broadcast a hail, before an
   * awaited continuation installs a listener — so a store that subscribed
   * after its snapshot would drop exactly the call it exists to show, and
   * commit the stale list on top of it. Nothing guarantees a second
   * broadcast, so Mission Control would stay dark until a reload.
   *
   * A broadcast that lands inside that window therefore WINS: it is newer
   * than the snapshot by construction, whatever order the promises settle in.
   */
  load: async () => {
    const generation = ++loadGeneration
    const existing = get().unsubscribe
    if (existing) existing()

    let broadcastLanded = false
    try {
      // The engine sends the whole open list, not the one that changed: a
      // parked loop nobody heard about is the silence this feature removes,
      // and a second window must never keep showing an answered alarm.
      const unsubscribe = crewHailApi.onUpdated((updated) => {
        broadcastLanded = true
        set({ hails: updated, isLoaded: true, error: null })
      })
      set({ unsubscribe })

      const hails = await crewHailApi.listOpen()
      // A newer load started while this snapshot was in flight: this one is
      // obsolete, its subscription already replaced, and a snapshot it took
      // may predate hails the current subscription has heard.
      if (generation !== loadGeneration) return
      set(
        broadcastLanded
          ? { isLoaded: true, error: null }
          : { hails, isLoaded: true, error: null },
      )
    } catch (err) {
      // Both halves are inside it: subscribing is the FIRST thing this does,
      // and a load that cannot subscribe has to report itself exactly like
      // one that cannot list. Outside the guard it would reject into a
      // caller that only ever said `void load()`.
      if (generation !== loadGeneration) return
      set({ error: errorMessage(err, 'Failed to load hails') })
    }
  },

  acknowledge: async (id) => {
    try {
      await crewHailApi.acknowledge(id)
      // Dropped here as well as by the broadcast: the gesture must feel
      // answered immediately, and the broadcast is the authority that follows.
      set({ hails: get().hails.filter((hail) => hail.id !== id) })
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to answer the hail') })
    }
  },

  acknowledgeCrew: async (crewId) => {
    try {
      await crewHailApi.acknowledgeCrew(crewId)
      set({ hails: get().hails.filter((hail) => hail.crewId !== crewId) })
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to answer the hails') })
    }
  },
}))
