import { describe, expect, it } from 'vitest'
import {
  CHATGPT_APP_READ_LIMIT,
  CHATGPT_APPS_REASON_LIMIT,
  chatGptAppReadBatches,
  chatGptAppState,
  describeChatGptAppsFailure,
  selectChatGptApps,
} from './provider-account-chatgpt-apps.pure'

describe('MAR-3458 R2 availability, never sign-in health', () => {
  for (const enabled of [false, true])
    for (const callable of [false, true])
      it(`enabled=${enabled} callable=${callable}`, () => {
        expect(
          chatGptAppState({
            id: 'figma',
            runtimeName: 'Figma',
            enabled,
            callable,
          }),
        ).toBe(!enabled ? 'off' : callable ? 'available' : 'unavailable')
      })
})

describe('MAR-3485 rows come from the installed snapshot', () => {
  it('names from app/read, then the runtime name, then the id; deduplicated and sorted', () => {
    expect(
      selectChatGptApps(
        [
          {
            id: 'figma',
            runtimeName: 'figma-rt',
            enabled: true,
            callable: true,
          },
          { id: 'sites', runtimeName: 'Sites', enabled: true, callable: false },
          { id: 'bare', runtimeName: null, enabled: false, callable: false },
          {
            id: 'figma',
            runtimeName: 'figma-rt',
            enabled: true,
            callable: true,
          },
        ],
        [
          {
            id: 'figma',
            name: 'Figma',
            installUrl: 'https://chatgpt.com/apps/figma',
          },
          { id: 'elsewhere', name: 'Not installed', installUrl: null },
        ],
      ),
    ).toEqual([
      { id: 'bare', name: 'bare', state: 'off' },
      { id: 'figma', name: 'Figma', state: 'available' },
      { id: 'sites', name: 'Sites', state: 'unavailable' },
    ])
  })
  it('an app app/read knows but Codex has not installed is not a row', () => {
    expect(
      selectChatGptApps(
        [],
        [{ id: 'x', name: 'Directory app', installUrl: null }],
      ),
    ).toEqual([])
  })
})

describe('MAR-3485 app/read batches', () => {
  it('none for no ids', () => {
    expect(chatGptAppReadBatches([])).toEqual([])
  })
  it(`at most ${CHATGPT_APP_READ_LIMIT} ids per request, first-seen order, no repeats`, () => {
    const ids = Array.from({ length: 250 }, (_, i) => `app-${i}`)
    const batches = chatGptAppReadBatches([...ids, 'app-0', 'app-7'])
    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 50])
    expect(batches.flat()).toEqual(ids)
  })
})

/** The shape Marcin's screen showed on 2026-09-26 (Codex 0.157.1), abridged. */
const CLOUDFLARE_403 =
  'failed to list apps: Request failed with status 403 Forbidden: <html> <head> <meta name="viewport" content="width=device-width, initial-scale=1" /> <style global>body{font-family:Arial}</style> <meta http-equiv="refresh" content="360"></head> <body> <div class="container"> <svg width="41"><path d="M37.5324 16.8707C37.9808 15.5241"/></svg> <script>(function(){window._cf_chl_opt = {cRay: \'a4156029daee0200\'};history.replaceState(null, null,"/backend-api/connectors/directory/list?external_logos=true&__cf_chl_rt_tk=C.kpL4iD0m");}());</script></div> </body> </html>'

describe('MAR-3485 a failure reads as one sentence', () => {
  it("Cloudflare's challenge page becomes one sentence that says the apps may still work", () => {
    const reason = describeChatGptAppsFailure(CLOUDFLARE_403)
    expect(reason).toBe(
      "ChatGPT's bot check refused the request (403). The apps themselves may still work in conversations. Try Refresh in a minute.",
    )
    expect(reason).not.toMatch(/[<>]|cf_chl|__cf|a4156029/)
  })
  it('another web page keeps only the words before it', () => {
    expect(
      describeChatGptAppsFailure(
        'Request failed with status 502 Bad Gateway: <html><body><h1>502</h1></body></html>',
      ),
    ).toBe(
      'Request failed with status 502 Bad Gateway (ChatGPT answered with a web page).',
    )
  })
  it('a page with no words before it says so, without inventing a reason', () => {
    expect(describeChatGptAppsFailure('<!DOCTYPE html><html></html>')).toBe(
      'ChatGPT answered with a web page and no reason. Try Refresh.',
    )
  })
  it('an empty reason blames nobody', () => {
    expect(describeChatGptAppsFailure('')).toBe(
      'Codex gave no reason. Try Refresh.',
    )
    expect(describeChatGptAppsFailure(' \n ')).toBe(
      'Codex gave no reason. Try Refresh.',
    )
  })
  it('a plain reason is kept as it is', () => {
    const busy =
      'This Codex account is running a turn. Try again when it finishes.'
    expect(describeChatGptAppsFailure(busy)).toBe(busy)
  })
  it('every line is kept, so a "Caused by" survives; whitespace collapsed', () => {
    expect(
      describeChatGptAppsFailure(
        'failed to refresh apps\n\nCaused by:\n    401 Unauthorized: sign in again',
      ),
    ).toBe('failed to refresh apps Caused by: 401 Unauthorized: sign in again')
  })
  it("prose with '<' is not markup", () => {
    for (const prose of ['a < b is false', 'limit < body size exceeded'])
      expect(describeChatGptAppsFailure(prose)).toBe(prose)
  })
  it('any well-formed tag starts a page, not only html/head/body', () => {
    expect(
      describeChatGptAppsFailure(
        'status 403: <title>Access denied</title><h1>Denied</h1>',
      ),
    ).toBe('status 403 (ChatGPT answered with a web page).')
  })
  it('"just a moment" is a bot check only inside a page', () => {
    expect(
      describeChatGptAppsFailure('Codex is restarting, just a moment'),
    ).toBe('Codex is restarting, just a moment')
    expect(
      describeChatGptAppsFailure(
        'Request failed with status 503: <html><title>Just a moment...</title></html>',
      ),
    ).toBe(
      "ChatGPT's bot check refused the request (503). The apps themselves may still work in conversations. Try Refresh in a minute.",
    )
  })
  it(`at most ${CHATGPT_APPS_REASON_LIMIT} characters`, () => {
    const reason = describeChatGptAppsFailure('x'.repeat(500))
    expect(reason).toHaveLength(CHATGPT_APPS_REASON_LIMIT)
    expect(reason.endsWith('…')).toBe(true)
  })
})
