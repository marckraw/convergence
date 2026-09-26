import { create } from 'zustand'
import type { ProviderAccountChatGptSignIns } from '@/entities/provider-account'

/**
 * Each OpenAI account's last ChatGPT sign-in check (MAR-3470).
 *
 * A store, not component state, because the Connectors panel unmounts with
 * its Settings section: the five-minute memory the panel promises has to
 * outlive it, or every reopen would call every app again. Only the latest
 * check per account may settle, so an older answer never replaces a newer one.
 */
interface ChatGptSignInsState {
  byAccount: Record<string, ProviderAccountChatGptSignIns>
  /** The check in flight per account (its number), or none. */
  inFlight: Record<string, number | null>
  begin: (accountId: string) => number
  settle: (
    accountId: string,
    check: number,
    result: ProviderAccountChatGptSignIns,
  ) => void
}

let checks = 0

export const useChatGptSignInsStore = create<ChatGptSignInsState>(
  (set, get) => ({
    byAccount: {},
    inFlight: {},
    begin: (accountId) => {
      const check = ++checks
      set((state) => ({ inFlight: { ...state.inFlight, [accountId]: check } }))
      return check
    },
    settle: (accountId, check, result) => {
      if (get().inFlight[accountId] !== check) return
      set((state) => ({
        byAccount: { ...state.byAccount, [accountId]: result },
        inFlight: { ...state.inFlight, [accountId]: null },
      }))
    },
  }),
)
