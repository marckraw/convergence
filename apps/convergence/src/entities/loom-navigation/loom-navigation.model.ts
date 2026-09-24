import { create } from 'zustand'
import type { LoomNavigationRequest } from './loom-navigation.types'

interface LoomNavigationStore {
  pending: LoomNavigationRequest | null
  /** Published by Loom, so action choices use Follow's current-crew tie break. */
  shownCrewId: string | null
  request: (request: LoomNavigationRequest) => void
  consume: () => LoomNavigationRequest | null
}

export const useLoomNavigationStore = create<LoomNavigationStore>(
  (set, get) => ({
    pending: null,
    shownCrewId: null,
    request: (request) => set({ pending: request }),
    consume: () => {
      const request = get().pending
      if (request) set({ pending: null })
      return request
    },
  }),
)

export function requestLoomNavigation(request: LoomNavigationRequest): void {
  useLoomNavigationStore.getState().request(request)
}
