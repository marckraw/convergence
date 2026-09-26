import { describe, expect, it } from 'vitest'
import {
  CHATGPT_APPS_FOCUS_INTERVAL_MS,
  mayRefreshChatGptAppsOnFocus,
  settleChatGptAppsRead,
} from './chatgpt-apps-refresh.pure'

const listed = {
  providerAccountId: 'a',
  requiresChatGpt: false,
  error: null,
  apps: [{ id: 'figma', name: 'Figma', state: 'available' as const }],
}
const failed = {
  providerAccountId: 'a',
  requiresChatGpt: false,
  error: 'Could not read ChatGPT apps: refused',
  apps: [],
}

describe('MAR-3485 focus re-reads at most once per interval', () => {
  const at = (lastReadStartedAt: number | null, now: number) =>
    mayRefreshChatGptAppsOnFocus({
      lastReadStartedAt,
      now,
      returningFromChatGpt: false,
    })
  it('the first focus may read', () => {
    expect(at(null, 0)).toBe(true)
  })
  it('not before the interval has passed since the last read started', () => {
    expect(at(1_000, 1_000 + CHATGPT_APPS_FOCUS_INTERVAL_MS - 1)).toBe(false)
  })
  it('once the interval has passed', () => {
    expect(at(1_000, 1_000 + CHATGPT_APPS_FOCUS_INTERVAL_MS)).toBe(true)
  })
  it('the return from ChatGPT (Manage or Browse) is never throttled', () => {
    expect(
      mayRefreshChatGptAppsOnFocus({
        lastReadStartedAt: 1_000,
        now: 1_001,
        returningFromChatGpt: true,
      }),
    ).toBe(true)
  })
})

describe('MAR-3485 a failed refresh keeps the list it had', () => {
  it('keeps the rows and says the failure is about the refresh', () => {
    expect(settleChatGptAppsRead(listed, failed)).toEqual({
      ...listed,
      error:
        'Could not read ChatGPT apps: refused. The list below is from the last read that worked.',
    })
  })
  it('a success replaces the list and clears the error', () => {
    const kept = settleChatGptAppsRead(listed, failed)
    expect(settleChatGptAppsRead(kept, listed)).toBe(listed)
  })
  it('a failure with nothing listed before is shown as it is', () => {
    expect(settleChatGptAppsRead(null, failed)).toBe(failed)
    expect(settleChatGptAppsRead({ ...listed, apps: [] }, failed)).toBe(failed)
  })
  it("another account's failure never inherits these rows", () => {
    const other = { ...failed, providerAccountId: 'b' }
    expect(settleChatGptAppsRead(listed, other)).toBe(other)
  })
  it('a reason that already ends a sentence gets no second period', () => {
    const done = { ...failed, error: 'Could not read ChatGPT apps: refused.' }
    expect(settleChatGptAppsRead(listed, done).error).toBe(
      'Could not read ChatGPT apps: refused. The list below is from the last read that worked.',
    )
  })
  it('a repeated failure does not stack its sentence', () => {
    const once = settleChatGptAppsRead(listed, failed)
    expect(settleChatGptAppsRead(once, failed).error).toBe(once.error)
  })
})
