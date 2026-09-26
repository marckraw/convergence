import type { ProviderAccountChatGptApps } from '@/entities/provider-account'

/**
 * The shortest gap between two reads the window's focus may start (MAR-3485).
 *
 * Focus re-reads so that an app reconnected on ChatGPT shows up on return,
 * but a burst of focus changes (screenshots, app switching) must not become a
 * burst of forced reads against ChatGPT. Refresh is never throttled, and
 * neither is the first return after the panel sent you to ChatGPT (Manage or
 * Browse): that return is the one the re-read exists for.
 */
export const CHATGPT_APPS_FOCUS_INTERVAL_MS = 15_000

export function mayRefreshChatGptAppsOnFocus(input: {
  lastReadStartedAt: number | null
  now: number
  returningFromChatGpt: boolean
}): boolean {
  return (
    input.returningFromChatGpt ||
    input.lastReadStartedAt === null ||
    input.now - input.lastReadStartedAt >= CHATGPT_APPS_FOCUS_INTERVAL_MS
  )
}

function asSentence(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`
}

/**
 * What the panel shows after a read (MAR-3485).
 *
 * A failed refresh does not erase a list that was read: the rows stay, and
 * the failure says it is about the refresh. A failure with nothing read
 * before, a success, or another account's answer replaces what was shown.
 */
export function settleChatGptAppsRead(
  shown: ProviderAccountChatGptApps | null,
  read: ProviderAccountChatGptApps,
): ProviderAccountChatGptApps {
  const keepRows =
    read.error !== null &&
    shown !== null &&
    shown.providerAccountId === read.providerAccountId &&
    shown.apps.length > 0
  if (!keepRows) return read
  return {
    ...shown,
    error: `${asSentence(read.error ?? '')} The list below is from the last read that worked.`,
  }
}
