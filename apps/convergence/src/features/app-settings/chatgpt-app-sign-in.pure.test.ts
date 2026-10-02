import { describe, expect, it } from 'vitest'
import {
  CONFIGURED_SERVERS_SENTENCE,
  ONE_SIGN_IN_PER_APP_NOTE,
  CHATGPT_LINK_ACTION_LABEL,
  configuredServerAction,
  configuredServerNeedsSignIn,
  oneSignInPerAppNote,
  CHATGPT_SIGN_IN_MEMORY_MS,
  chatGptLinkCopiedMessage,
  clearedNeedsAuthNotesMessage,
  chatGptSignInsCheckedAtMs,
  chatGptManageLabel,
  configuredServerSignInLine,
  chatGptSignInLine,
  describeChatGptSignInsCheckedAt,
  shouldCheckChatGptSignIns,
} from './chatgpt-app-sign-in.pure'

const signIn = (
  status: 'signed-in' | 'needs-sign-in' | 'failed' | 'built-in' | 'unchecked',
  account: string | null = null,
  reason: string | null = null,
) => ({ appId: 'figma', status, account, reason })

describe('MAR-3470 when the panel checks sign-ins', () => {
  const should = (
    lastCheckedAt: number | null,
    now: number,
    requested = false,
    inFlight = false,
  ) => shouldCheckChatGptSignIns({ lastCheckedAt, now, requested, inFlight })
  it('the first time, and whenever asked (Refresh, the return from ChatGPT)', () => {
    expect(should(null, 0)).toBe(true)
    expect(should(1_000, 1_001, true)).toBe(true)
    expect(should(1_000, 1_001, true, true)).toBe(true)
  })
  it('otherwise not until the last check that ran is five minutes old', () => {
    expect(should(1_000, 1_000 + CHATGPT_SIGN_IN_MEMORY_MS - 1)).toBe(false)
    expect(should(1_000, 1_000 + CHATGPT_SIGN_IN_MEMORY_MS)).toBe(true)
  })
  it('never a second unasked check while one is running', () => {
    expect(should(null, 0, false, true)).toBe(false)
  })
  it('a check that did not run leaves no time to remember', () => {
    expect(chatGptSignInsCheckedAtMs(null)).toBeNull()
    expect(chatGptSignInsCheckedAtMs(undefined)).toBeNull()
    expect(chatGptSignInsCheckedAtMs('garbage')).toBeNull()
    expect(chatGptSignInsCheckedAtMs('2026-09-27T00:52:00.000Z')).toBe(
      Date.parse('2026-09-27T00:52:00.000Z'),
    )
  })
})

describe('MAR-3470 the sign-in line under an app', () => {
  const line = (
    entry: ReturnType<typeof signIn> | undefined,
    appState: 'available' | 'unavailable' | 'off' = 'available',
    checking = false,
  ) => chatGptSignInLine({ signIn: entry, checking, appState })
  it('names who you are signed in as, when the call said so', () => {
    expect(line(signIn('signed-in', 'Marcin (m@ef.com)'))).toEqual({
      text: 'Signed in as Marcin (m@ef.com)',
      tone: 'good',
    })
    expect(line(signIn('signed-in'))).toEqual({
      text: 'Signed in',
      tone: 'good',
    })
  })
  it('a link that needs signing in again says so, with whose link it is', () => {
    expect(line(signIn('needs-sign-in', 'me@ef.com'))).toEqual({
      text: 'Needs sign-in again on ChatGPT (linked to me@ef.com)',
      tone: 'warn',
    })
    expect(line(signIn('needs-sign-in'))?.text).toBe(
      'Needs sign-in again on ChatGPT',
    )
  })
  it("couldn't check, built in, and no check, each in its own words", () => {
    expect(line(signIn('failed', null, 'Rate limited.'))).toEqual({
      text: 'Couldn’t check sign-in: Rate limited.',
      tone: 'muted',
    })
    expect(line(signIn('built-in'))?.text).toBe(
      'Built into ChatGPT, no sign-in needed',
    )
    expect(line(signIn('unchecked'))?.text).toBe(
      'No sign-in check for this app',
    )
  })
  it('an app whose tools are unavailable or turned off gets no sign-in line', () => {
    expect(line(signIn('unchecked'), 'off')).toBeNull()
    expect(line(signIn('unchecked'), 'unavailable')).toBeNull()
    expect(line(undefined)).toBeNull()
  })
  it('while checking, only apps with tools say Checking', () => {
    expect(line(signIn('signed-in'), 'available', true)).toEqual({
      text: 'Checking sign-in…',
      tone: 'muted',
    })
    expect(line(undefined, 'off', true)).toBeNull()
  })
})

describe('MAR-3470 the ChatGPT button and the checked-at line', () => {
  it('a broken link turns Manage into Sign in again', () => {
    expect(chatGptManageLabel(signIn('needs-sign-in'))).toBe(
      'Sign in again on ChatGPT',
    )
    expect(chatGptManageLabel(signIn('signed-in'))).toBe('Manage on ChatGPT')
    expect(chatGptManageLabel(undefined)).toBe('Manage on ChatGPT')
  })
  it('says when the check ran, or nothing', () => {
    expect(describeChatGptSignInsCheckedAt('2026-09-27T00:52:00.000Z')).toMatch(
      /^Sign-ins checked at \d{1,2}:\d{2}/,
    )
    expect(describeChatGptSignInsCheckedAt(null)).toBeNull()
    expect(describeChatGptSignInsCheckedAt('not a date')).toBeNull()
  })
})

describe('MAR-3470 the live line of a server configured on this Mac', () => {
  const server = (
    status: 'signed-in' | 'needs-sign-in' | 'failed' | 'unchecked',
    account: string | null = null,
    reason: string | null = null,
  ) => ({ server: 'linear', status, account, reason })
  const line = (
    signIn: ReturnType<typeof server> | undefined,
    checking = false,
  ) => configuredServerSignInLine({ signIn, checking })
  it('who it is signed in as, or that it connected with its sign-in', () => {
    expect(line(server('signed-in', 'marckraw@icloud.com'))).toEqual({
      text: 'Signed in as marckraw@icloud.com',
      tone: 'good',
    })
    expect(line(server('signed-in'))?.text).toBe('Connected and signed in')
  })
  it('a stored sign-in that stopped working points at Authorize', () => {
    expect(line(server('needs-sign-in'))).toEqual({
      text: 'Needs sign-in again: press "Sign in again"',
      tone: 'warn',
    })
  })
  it("couldn't check says why; no answer or no claim leaves the saved label", () => {
    expect(line(server('failed', null, 'handshake timed out.'))?.text).toBe(
      'Couldn’t check sign-in: handshake timed out.',
    )
    expect(line(server('unchecked'))).toBeNull()
    expect(line(undefined)).toBeNull()
  })
  it('while checking, every configured row says so', () => {
    expect(line(undefined, true)).toEqual({
      text: 'Checking sign-in…',
      tone: 'muted',
    })
  })
})

describe('MAR-3486 where a ChatGPT link goes', () => {
  it('the two choices, in his words', () => {
    expect(CHATGPT_LINK_ACTION_LABEL).toEqual({
      open: 'Open in default browser',
      copy: 'Copy link',
    })
  })
  it('a copied link names the ChatGPT login it belongs to', () => {
    expect(chatGptLinkCopiedMessage('marcin@ef.design')).toBe(
      'Link copied. Paste it into the browser profile where ChatGPT is signed in as marcin@ef.design; coming back here checks again.',
    )
  })
  it('an account without a name still gets a sentence', () => {
    expect(chatGptLinkCopiedMessage('  ')).toContain(
      'signed in as this account;',
    )
  })
})

describe('MAR-3516 the panel promises only what holds', () => {
  it('no longer claims a sign-in outlives every other account', () => {
    expect(CONFIGURED_SERVERS_SENTENCE).not.toMatch(
      /authorizes a connector once/,
    )
    expect(CONFIGURED_SERVERS_SENTENCE).toMatch(
      /Some services, like Figma, keep one sign-in per app for each of their users: signing in with the same user on another account signs this one out\.$/,
    )
  })
  it('the Figma rule sits under a Figma row that needs signing in, whatever the app', () => {
    for (const name of [
      'Figma',
      'figma',
      'claude.ai Figma',
      'plugin:figma:figma',
    ]) {
      expect(oneSignInPerAppNote({ name, needsSignIn: true })).toBe(
        ONE_SIGN_IN_PER_APP_NOTE,
      )
      expect(oneSignInPerAppNote({ name, needsSignIn: false })).toBeNull()
    }
  })
  it('only Figma is measured, so nothing else claims it', () => {
    expect(
      oneSignInPerAppNote({ name: 'linear', needsSignIn: true }),
    ).toBeNull()
    expect(
      oneSignInPerAppNote({ name: 'figmatic', needsSignIn: true }),
    ).toBeNull()
  })
  it('a stored sign-in is signed in again, never authorized as if it had none', () => {
    expect(
      configuredServerAction({ needsAuthorization: true, liveStatus: null }),
    ).toEqual({ label: 'Authorize', emphasis: 'primary' })
    expect(
      configuredServerAction({
        needsAuthorization: false,
        liveStatus: 'signed-in',
      }),
    ).toEqual({ label: 'Sign in again', emphasis: 'secondary' })
    expect(
      configuredServerAction({
        needsAuthorization: false,
        liveStatus: 'needs-sign-in',
      }),
    ).toEqual({ label: 'Sign in again', emphasis: 'primary' })
    for (const liveStatus of ['failed', 'unchecked', null] as const) {
      expect(
        configuredServerAction({ needsAuthorization: false, liveStatus }),
      ).toEqual({ label: 'Sign in again', emphasis: 'secondary' })
    }
  })
  it('what the check observed outranks the saved flag, for the button and the note', () => {
    // The saved list still says unauthorized; the check just saw it work.
    expect(
      configuredServerAction({
        needsAuthorization: true,
        liveStatus: 'signed-in',
      }),
    ).toEqual({ label: 'Sign in again', emphasis: 'secondary' })
    expect(
      configuredServerNeedsSignIn({
        needsAuthorization: true,
        liveStatus: 'signed-in',
      }),
    ).toBe(false)
    expect(
      configuredServerNeedsSignIn({
        needsAuthorization: false,
        liveStatus: 'needs-sign-in',
      }),
    ).toBe(true)
    // Without an answer, the saved flag decides.
    for (const liveStatus of ['failed', 'unchecked', null] as const) {
      expect(
        configuredServerNeedsSignIn({ needsAuthorization: true, liveStatus }),
      ).toBe(true)
      expect(
        configuredServerNeedsSignIn({ needsAuthorization: false, liveStatus }),
      ).toBe(false)
    }
  })
  it('the rule is about the same user, not any other account', () => {
    expect(ONE_SIGN_IN_PER_APP_NOTE).toContain(
      'signing in with the same Figma user on another account signs this one out',
    )
  })
})

describe('MAR-3517 a cleared "needs sign-in" note is said once, plainly', () => {
  it('names the server and promises only that new conversations try it again', () => {
    expect(clearedNeedsAuthNotesMessage(['claude.ai Figma'])).toBe(
      'Cleared Claude\'s "needs sign-in" note for "claude.ai Figma": it\'s connected, so new conversations on this account will try it again. A conversation already running keeps the tools it started with; restart it to pick this up.',
    )
  })
  it('several servers read as one sentence', () => {
    expect(
      clearedNeedsAuthNotesMessage(['claude.ai Figma', 'plugin:figma:figma']),
    ).toMatch(
      /^Cleared Claude's "needs sign-in" notes for "claude\.ai Figma" and "plugin:figma:figma": they're connected, so new conversations on this account will try them again\./,
    )
  })
  it('never claims a skip it cannot know, or a use it cannot promise', () => {
    const said = clearedNeedsAuthNotesMessage(['claude.ai Figma'])!
    expect(said).not.toMatch(/had a note to skip|can use it/)
  })
  it('nothing cleared says nothing', () => {
    expect(clearedNeedsAuthNotesMessage([])).toBeNull()
    expect(clearedNeedsAuthNotesMessage(undefined)).toBeNull()
  })
})
