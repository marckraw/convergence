import { create } from 'zustand'
import { sessionRelayApi } from './session-relay.api'
import type {
  ClearRelayHopsResult,
  CreateSessionRelayInput,
  RelayHop,
  SessionRelay,
  UpdateSessionRelayInput,
} from './session-relay.types'

/**
 * One crew's trail as this window holds it: the newest page, plus whatever
 * older pages were asked for. `hasMore` is carried rather than guessed so the
 * "Load older" affordance can disappear exactly when there is nothing behind
 * it, instead of once more for luck.
 */
export interface CrewHopTrail {
  /** Newest first, the order a trail is read in. */
  hops: RelayHop[]
  hasMore: boolean
  /**
   * Which full load produced this trail.
   *
   * An older page and a clear are two answers about the same ledger, and it
   * can answer them in either order. A page fetched before a wipe describes
   * rows that no longer exist, so it must be recognised as stale on arrival
   * rather than appended -- otherwise clearing a trail while "Load older" is
   * in flight puts the deleted history straight back on screen. Bumped by
   * every full reload; a live hop and an older page both leave it alone,
   * because neither replaces what is being read.
   */
  generation: number
}

interface SessionRelayState {
  relays: SessionRelay[]
  /** Hop trails, per crew, for the crews that asked for one. */
  hopsByCrewId: Record<string, CrewHopTrail>
  isLoaded: boolean
  error: string | null
  unsubscribeBroadcast: (() => void) | null
  unsubscribeHops: (() => void) | null
  unsubscribeHopsCleared: (() => void) | null
}

interface SessionRelayActions {
  load: () => Promise<void>
  loadHops: (crewId: string) => Promise<void>
  loadOlderHops: (crewId: string) => Promise<void>
  clearHops: (crewId: string) => Promise<ClearRelayHopsResult | null>
  createRelay: (input: CreateSessionRelayInput) => Promise<SessionRelay | null>
  updateRelay: (
    id: string,
    patch: UpdateSessionRelayInput,
  ) => Promise<SessionRelay | null>
  deleteRelay: (id: string) => Promise<void>
  setArmed: (id: string, armed: boolean) => Promise<SessionRelay | null>
  clearError: () => void
}

export type SessionRelayStore = SessionRelayState & SessionRelayActions

const EMPTY_RELAYS: SessionRelay[] = []
const EMPTY_HOPS: RelayHop[] = []
const EMPTY_TRAIL: CrewHopTrail = {
  hops: EMPTY_HOPS,
  hasMore: false,
  generation: 0,
}

/** The trail is capped so a long-running loop cannot grow the window forever. */
const MAX_TRACKED_HOPS_PER_CREW = 100

/** How far back one "Load older" reaches. */
const TRAIL_PAGE_SIZE = 50

/**
 * One page of a trail, and the honest answer to whether anything is behind it.
 *
 * Asks for one row more than the page and throws it away. Inferring "there is
 * more" from a full page shows the button one last time onto nothing, which is
 * exactly the kind of small lie a ledger should not tell.
 */
async function fetchTrailPage(
  crewId: string,
  beforeHopId: string | null,
): Promise<{ hops: RelayHop[]; hasMore: boolean }> {
  const fetched = await sessionRelayApi.listHops(
    crewId,
    TRAIL_PAGE_SIZE + 1,
    beforeHopId,
  )
  return {
    hops: fetched.slice(0, TRAIL_PAGE_SIZE),
    hasMore: fetched.length > TRAIL_PAGE_SIZE,
  }
}

/**
 * A fresh firing on top of a trail this window is already showing.
 *
 * The window is capped so a busy crew cannot grow it forever, but never below
 * what the reader deliberately paged in -- taking back history someone asked
 * for would be the app editing their view mid-read. When the cap does push the
 * oldest row off the end, `hasMore` turns true again: there is demonstrably
 * something older than what is on screen now.
 */
function prependHop(trail: CrewHopTrail, hop: RelayHop): CrewHopTrail {
  const grown = [hop, ...trail.hops]
  const capped = grown.slice(
    0,
    Math.max(MAX_TRACKED_HOPS_PER_CREW, trail.hops.length),
  )
  return {
    hops: capped,
    hasMore: trail.hasMore || capped.length < grown.length,
    // Unchanged: a new firing extends what is being read, it does not replace
    // it, so an older page already in flight is still about the same trail.
    generation: trail.generation,
  }
}

export function selectRelaysForCrew(
  state: Pick<SessionRelayState, 'relays'>,
  crewId: string | null | undefined,
): SessionRelay[] {
  if (!crewId) return EMPTY_RELAYS
  return state.relays.filter((relay) => relay.crewId === crewId)
}

/**
 * The wires touching one session, in both directions — what a card needs to
 * show its relay glyph without knowing anything about crews.
 */
export function selectRelaysForSession(
  state: Pick<SessionRelayState, 'relays'>,
  sessionId: string | null | undefined,
): SessionRelay[] {
  if (!sessionId) return EMPTY_RELAYS
  return state.relays.filter(
    (relay) =>
      relay.sourceSessionId === sessionId ||
      relay.targetSessionId === sessionId,
  )
}

export function selectHopsForCrew(
  state: Pick<SessionRelayState, 'hopsByCrewId'>,
  crewId: string | null | undefined,
): RelayHop[] {
  return selectHopTrailForCrew(state, crewId).hops
}

/** The trail with its paging state, for the one surface that pages it. */
export function selectHopTrailForCrew(
  state: Pick<SessionRelayState, 'hopsByCrewId'>,
  crewId: string | null | undefined,
): CrewHopTrail {
  if (!crewId) return EMPTY_TRAIL
  return state.hopsByCrewId[crewId] ?? EMPTY_TRAIL
}

function sortRelays(relays: SessionRelay[]): SessionRelay[] {
  return [...relays].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function upsertRelay(
  relays: SessionRelay[],
  next: SessionRelay,
): SessionRelay[] {
  const replaced = relays.some((relay) => relay.id === next.id)
    ? relays.map((relay) => (relay.id === next.id ? next : relay))
    : [...relays, next]
  return sortRelays(replaced)
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export const useSessionRelayStore = create<SessionRelayStore>((set, get) => ({
  relays: EMPTY_RELAYS,
  hopsByCrewId: {},
  isLoaded: false,
  error: null,
  unsubscribeBroadcast: null,
  unsubscribeHops: null,
  unsubscribeHopsCleared: null,

  load: async () => {
    try {
      const relays = await sessionRelayApi.list()

      const {
        unsubscribeBroadcast: existing,
        unsubscribeHops: existingHops,
        unsubscribeHopsCleared: existingCleared,
      } = get()
      if (existing) existing()
      if (existingHops) existingHops()
      if (existingCleared) existingCleared()

      const unsubscribeBroadcast = sessionRelayApi.onUpdated((updated) => {
        set({ relays: sortRelays(updated) })
      })

      // Hops arrive one at a time as the engine fires, so the trail a crew is
      // already showing grows live rather than waiting for a refetch.
      const unsubscribeHops = sessionRelayApi.onHopAppended((hop) => {
        const trail = get().hopsByCrewId[hop.crewId]
        if (!trail) return
        set({
          hopsByCrewId: {
            ...get().hopsByCrewId,
            [hop.crewId]: prependHop(trail, hop),
          },
        })
      })

      // A trail cleared in one window is cleared everywhere. The broadcast
      // names the crew and nothing else, so each window reloads the top of
      // that trail for itself -- which is also how it finds out what rows a
      // still-running flow kept.
      const unsubscribeHopsCleared = sessionRelayApi.onHopsCleared((crewId) => {
        if (!get().hopsByCrewId[crewId]) return
        void get().loadHops(crewId)
      })

      set({
        relays: sortRelays(relays),
        isLoaded: true,
        error: null,
        unsubscribeBroadcast,
        unsubscribeHops,
        unsubscribeHopsCleared,
      })
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to load relays') })
    }
  },

  loadHops: async (crewId) => {
    try {
      const page = await fetchTrailPage(crewId, null)
      const previous = get().hopsByCrewId[crewId]
      set({
        hopsByCrewId: {
          ...get().hopsByCrewId,
          [crewId]: {
            ...page,
            // Read after the await, not before: two reloads that overlap must
            // each land on a generation nobody in flight is still holding.
            generation: (previous?.generation ?? 0) + 1,
          },
        },
      })
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to load the hop trail') })
    }
  },

  loadOlderHops: async (crewId) => {
    const trail = get().hopsByCrewId[crewId]
    const oldest = trail?.hops[trail.hops.length - 1]
    if (!trail?.hasMore || !oldest) return
    const generation = trail.generation

    try {
      const older = await fetchTrailPage(crewId, oldest.id)
      // Re-read rather than closing over `trail`: a wire may have fired while
      // the page was in flight, and the new row belongs at the top.
      const current = get().hopsByCrewId[crewId]
      if (!current) return

      // Two ways this answer can have gone stale, and both are checked because
      // neither catches the other: a reload has replaced the trail (the
      // generation moved), or the row this page was anchored on is no longer
      // the one it continues from -- a second press, or a reload that happened
      // to end on a different row. Either way the honest move is to drop the
      // page; the trail on screen is already what the ledger says.
      if (current.generation !== generation) return
      if (current.hops[current.hops.length - 1]?.id !== oldest.id) return

      set({
        hopsByCrewId: {
          ...get().hopsByCrewId,
          [crewId]: {
            hops: [...current.hops, ...older.hops],
            hasMore: older.hasMore,
            generation,
          },
        },
      })
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to load older hops') })
    }
  },

  /**
   * Empties one crew's trail and reloads what is left, because what is left is
   * the point: the engine spares any flow run still in flight, and the caller
   * is told how many rows that was so it can say so out loud.
   */
  clearHops: async (crewId) => {
    try {
      const result = await sessionRelayApi.clearHops(crewId)
      await get().loadHops(crewId)
      return result
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to clear the hop trail') })
      return null
    }
  },

  createRelay: async (input) => {
    try {
      const relay = await sessionRelayApi.create(input)
      set({ relays: upsertRelay(get().relays, relay), error: null })
      return relay
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to create relay') })
      return null
    }
  },

  updateRelay: async (id, patch) => {
    try {
      const relay = await sessionRelayApi.update(id, patch)
      set({ relays: upsertRelay(get().relays, relay), error: null })
      return relay
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to update relay') })
      return null
    }
  },

  deleteRelay: async (id) => {
    try {
      await sessionRelayApi.delete(id)
      set({
        relays: get().relays.filter((relay) => relay.id !== id),
        error: null,
      })
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to delete relay') })
    }
  },

  setArmed: async (id, armed) => {
    try {
      const relay = armed
        ? await sessionRelayApi.arm(id)
        : await sessionRelayApi.disarm(id)
      set({ relays: upsertRelay(get().relays, relay), error: null })
      return relay
    } catch (err) {
      set({
        error: errorMessage(
          err,
          armed ? 'Failed to arm relay' : 'Failed to disarm relay',
        ),
      })
      return null
    }
  },

  clearError: () => set({ error: null }),
}))
