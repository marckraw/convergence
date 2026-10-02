import { formatTimestamp } from '@convergence/ui'
import type {
  ChatGptAppSignIn,
  ConfiguredServerSignIn,
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

/** What a ChatGPT button can do with its link (MAR-3486). */
export type ChatGptLinkAction = 'open' | 'copy'

export const CHATGPT_LINK_ACTION_LABEL: Record<ChatGptLinkAction, string> = {
  open: 'Open in default browser',
  copy: 'Copy link',
}

/**
 * Said once a link is copied. The default browser may be signed in to ChatGPT
 * as another account, so the line names the login the link belongs to.
 */
export function chatGptLinkCopiedMessage(identity: string): string {
  const login = identity.trim() || 'this account'
  return `Link copied. Paste it into the browser profile where ChatGPT is signed in as ${login}; coming back here checks again.`
}

/** "Sign-ins checked at 01:52", in the viewer's clock. */
export function describeChatGptSignInsCheckedAt(
  checkedAt: string | null,
): string | null {
  if (!checkedAt) return null
  const at = new Date(checkedAt)
  if (Number.isNaN(at.getTime())) return null
  return `Sign-ins checked at ${formatTimestamp(at, 'clock')}`
}

/**
 * The live line of a server configured on this Mac, which replaces its saved
 * "Authorized" label once a check has answered (MAR-3470): the label only
 * says a sign-in was stored, the line says whether it works now.
 */
export function configuredServerSignInLine(input: {
  signIn: ConfiguredServerSignIn | undefined
  checking: boolean
}): { text: string; tone: ChatGptSignInTone } | null {
  const { signIn, checking } = input
  if (checking) return { text: 'Checking sign-in…', tone: 'muted' }
  if (!signIn) return null
  switch (signIn.status) {
    case 'signed-in':
      return {
        text: signIn.account
          ? `Signed in as ${signIn.account}`
          : 'Connected and signed in',
        tone: 'good',
      }
    case 'needs-sign-in':
      return {
        text: 'Needs sign-in again: press "Sign in again"',
        tone: 'warn',
      }
    case 'failed':
      return {
        text: `Couldn't check sign-in: ${signIn.reason ?? 'no reason given.'}`,
        tone: 'muted',
      }
    case 'unchecked':
      return null
  }
}

/**
 * What every account's "Configured on this Mac" list may promise (MAR-3516).
 * Tokens are per account and survive swaps, but a service can keep only one
 * sign-in per app for each of its users: Figma does (developers.figma.com,
 * "OAuth apps"; three hand-overs measured on MAR-3486).
 */
export const CONFIGURED_SERVERS_SENTENCE =
  'Each account signs in to these servers on its own and keeps the sign-in across later swaps. Some services, like Figma, keep one sign-in per app for each of their users: signing in with the same user on another account signs this one out.'

export const ONE_SIGN_IN_PER_APP_NOTE =
  'Figma keeps one sign-in per app for each Figma user: signing in with the same Figma user on another account signs this one out, and signing in here signs that one out.'

/**
 * The line under a row that needs signing in, when the service is one that
 * keeps a single sign-in per app. Only Figma is measured, so only Figma says it.
 */
export function oneSignInPerAppNote(input: {
  name: string
  needsSignIn: boolean
}): string | null {
  return input.needsSignIn && /\bfigma\b/i.test(input.name)
    ? ONE_SIGN_IN_PER_APP_NOTE
    : null
}

/**
 * The button beside a configured server. A server with a stored sign-in is
 * signed in *again*, never "authorized" as if it had none; the button only
 * asks for attention when nothing works (MAR-3516).
 */
export function configuredServerAction(input: {
  needsAuthorization: boolean
  liveStatus: ConfiguredServerSignIn['status'] | null
}): { label: string; emphasis: 'primary' | 'secondary' } {
  // What the check observed outranks the saved flag, as on the line above it.
  if (input.liveStatus === 'signed-in')
    return { label: 'Sign in again', emphasis: 'secondary' }
  if (input.needsAuthorization)
    return { label: 'Authorize', emphasis: 'primary' }
  return {
    label: 'Sign in again',
    emphasis: input.liveStatus === 'needs-sign-in' ? 'primary' : 'secondary',
  }
}

/**
 * Whether a configured server needs signing in: the live check's answer when
 * there is one, else the saved flag (MAR-3516, the blind reader's finding).
 */
export function configuredServerNeedsSignIn(input: {
  needsAuthorization: boolean
  liveStatus: ConfiguredServerSignIn['status'] | null
}): boolean {
  if (input.liveStatus === 'signed-in') return false
  if (input.liveStatus === 'needs-sign-in') return true
  return input.needsAuthorization
}

/**
 * Said after a Claude read removed "needs sign-in" notes of servers it saw
 * connected (MAR-3517). It promises only what removal does: new
 * conversations try the server again. A running conversation keeps the tools
 * it started with, and may even write its old note back.
 */
export function clearedNeedsAuthNotesMessage(
  names: readonly string[] | undefined,
): string | null {
  if (!names || names.length === 0) return null
  const list = new Intl.ListFormat('en', {
    style: 'long',
    type: 'conjunction',
  }).format(names.map((name) => `"${name}"`))
  return names.length === 1
    ? `Cleared Claude's "needs sign-in" note for ${list}: it's connected, so new conversations on this account will try it again. A conversation already running keeps the tools it started with; restart it to pick this up.`
    : `Cleared Claude's "needs sign-in" notes for ${list}: they're connected, so new conversations on this account will try them again. A conversation already running keeps the tools it started with; restart it to pick these up.`
}
