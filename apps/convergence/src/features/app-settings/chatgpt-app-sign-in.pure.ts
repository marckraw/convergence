import type {
  ChatGptAppSignIn,
  ProviderAccountChatGptApps,
} from '@/entities/provider-account'

/**
 * How long an account's sign-in check is trusted before opening the panel
 * checks again (MAR-3470). Each check calls the account's apps once, so
 * re-reads that happen often (window focus) reuse it; Refresh and the return
 * from ChatGPT always check. Only a check that ran counts: a failed one is
 * tried again at the next opening.
 */
export const CHATGPT_SIGN_IN_MEMORY_MS = 5 * 60_000

export function shouldCheckChatGptSignIns(input: {
  /** When the last check that ran finished (ms), from its `checkedAt`. */
  lastCheckedAt: number | null
  now: number
  requested: boolean
  inFlight: boolean
}): boolean {
  if (input.requested) return true
  if (input.inFlight) return false
  return (
    input.lastCheckedAt === null ||
    input.now - input.lastCheckedAt >= CHATGPT_SIGN_IN_MEMORY_MS
  )
}

/** A check's finish time in ms, or null when nothing was checked. */
export function chatGptSignInsCheckedAtMs(
  checkedAt: string | null | undefined,
): number | null {
  if (!checkedAt) return null
  const at = Date.parse(checkedAt)
  return Number.isNaN(at) ? null : at
}

export type ChatGptSignInTone = 'muted' | 'good' | 'warn'

type AppState = ProviderAccountChatGptApps['apps'][number]['state']

/**
 * The sign-in line under one app, or none (MAR-3470).
 *
 * Only an observed answer claims a sign-in: "Signed in" and "Needs sign-in
 * again" come from a call the check just made; "linked to" is ChatGPT's
 * record of whose link it is, which is not proof the link works.
 */
export function chatGptSignInLine(input: {
  signIn: ChatGptAppSignIn | undefined
  checking: boolean
  appState: AppState
}): { text: string; tone: ChatGptSignInTone } | null {
  const { signIn, checking, appState } = input
  if (checking && appState === 'available')
    return { text: 'Checking sign-in…', tone: 'muted' }
  if (!signIn) return null
  switch (signIn.status) {
    case 'signed-in':
      return {
        text: signIn.account ? `Signed in as ${signIn.account}` : 'Signed in',
        tone: 'good',
      }
    case 'needs-sign-in':
      return {
        text: signIn.account
          ? `Needs sign-in again on ChatGPT (linked to ${signIn.account})`
          : 'Needs sign-in again on ChatGPT',
        tone: 'warn',
      }
    case 'failed':
      return {
        text: `Couldn't check sign-in: ${signIn.reason ?? 'no reason given.'}`,
        tone: 'muted',
      }
    case 'built-in':
      return { text: 'Built into ChatGPT, no sign-in needed', tone: 'muted' }
    case 'unchecked':
      return appState === 'available'
        ? { text: 'No sign-in check for this app', tone: 'muted' }
        : null
  }
}

/** The row's ChatGPT button says what it is for when the link is broken. */
export function chatGptManageLabel(signIn: ChatGptAppSignIn | undefined) {
  return signIn?.status === 'needs-sign-in'
    ? 'Sign in again on ChatGPT'
    : 'Manage on ChatGPT'
}

/** "Sign-ins checked at 01:52", in the viewer's clock. */
export function describeChatGptSignInsCheckedAt(
  checkedAt: string | null,
): string | null {
  if (!checkedAt) return null
  const at = new Date(checkedAt)
  if (Number.isNaN(at.getTime())) return null
  return `Sign-ins checked at ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}
