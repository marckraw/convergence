import { create } from 'zustand'
import { sessionRelayApi } from './session-relay.api'
import type {
  CreateSessionRelayInput,
  RelayHop,
  SessionRelay,
  UpdateSessionRelayInput,
} from './session-relay.types'

interface SessionRelayState {
  relays: SessionRelay[]
  /** Newest-first hop trails, per crew, for the crews that asked for one. */
  hopsByCrewId: Record<string, RelayHop[]>
  isLoaded: boolean
  error: string | null
  unsubscribeBroadcast: (() => void) | null
  unsubscribeHops: (() => void) | null
}

interface SessionRelayActions {
  load: () => Promise<void>
  loadHops: (crewId: string, limit?: number) => Promise<void>
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

/** The trail is capped so a long-running loop cannot grow the window forever. */
const MAX_TRACKED_HOPS_PER_CREW = 100

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
  if (!crewId) return []
  return state.hopsByCrewId[crewId] ?? []
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

  load: async () => {
    try {
      const relays = await sessionRelayApi.list()

      const { unsubscribeBroadcast: existing, unsubscribeHops: existingHops } =
        get()
      if (existing) existing()
      if (existingHops) existingHops()

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
            [hop.crewId]: [hop, ...trail].slice(0, MAX_TRACKED_HOPS_PER_CREW),
          },
        })
      })

      set({
        relays: sortRelays(relays),
        isLoaded: true,
        error: null,
        unsubscribeBroadcast,
        unsubscribeHops,
      })
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to load relays') })
    }
  },

  loadHops: async (crewId, limit) => {
    try {
      const hops = await sessionRelayApi.listHops(crewId, limit)
      set({ hopsByCrewId: { ...get().hopsByCrewId, [crewId]: hops } })
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to load the hop trail') })
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
