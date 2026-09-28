import { describe, expect, it } from 'vitest'
import type { ConnectionsOverviewRow } from '@/entities/provider-account'
import { loomHorseAccessLine } from './loom-horse-access.pure'

const row = (
  overrides: Partial<ConnectionsOverviewRow> = {},
): ConnectionsOverviewRow => ({
  accountId: 'acct-icloud',
  provider: 'OpenAI',
  identity: 'marckraw@icloud.com',
  state: 'checked',
  paths: [
    {
      service: 'figma',
      via: 'ChatGPT app',
      state: 'needs-sign-in',
      account: null,
    },
    {
      service: 'figma',
      via: 'Codex on this Mac',
      state: 'works',
      account: 'm@ef.com',
    },
    {
      service: 'linear',
      via: 'ChatGPT app',
      state: 'works',
      account: 'm@icloud.com',
    },
  ],
  error: null,
  ...overrides,
})

const line = (
  accountId: string | null | undefined,
  rows: ConnectionsOverviewRow[] = [row()],
  remote = false,
) => loomHorseAccessLine({ remote, accountId, rows })

describe("MAR-3519 a horse's card says what its account can reach", () => {
  it('says when the answer was checked, so an old one never reads as live', () => {
    expect(
      loomHorseAccessLine({
        remote: false,
        accountId: 'acct-icloud',
        rows: [row()],
        checkedAt: '2026-09-28T09:00:00.000Z',
      })?.text,
    ).toMatch(
      /^Figma works · Linear works · marckraw@icloud\.com · checked \d{1,2}:\d{2}/,
    )
    expect(
      loomHorseAccessLine({
        remote: false,
        accountId: 'acct-icloud',
        rows: [row()],
        checkedAt: 'not a date',
      })?.text,
    ).toBe('Figma works · Linear works · marckraw@icloud.com')
  })
  it("the account's best path per service, and whose account it is", () => {
    expect(line('acct-icloud')).toEqual({
      text: 'Figma works · Linear works · marckraw@icloud.com',
      tone: 'good',
    })
  })
  it('a missing or broken service is a warning, by name', () => {
    expect(
      line('acct-icloud', [
        row({
          paths: [
            {
              service: 'figma',
              via: 'ChatGPT app',
              state: 'needs-sign-in',
              account: null,
            },
          ],
        }),
      ]),
    ).toEqual({
      text: 'Figma needs sign-in · no Linear · marckraw@icloud.com',
      tone: 'warn',
    })
  })
  it('a service with no path at all is a warning on its own', () => {
    expect(
      line('acct-icloud', [
        row({
          paths: [
            {
              service: 'figma',
              via: 'ChatGPT app',
              state: 'works',
              account: null,
            },
          ],
        }),
      ]),
    ).toEqual({
      text: 'Figma works · no Linear · marckraw@icloud.com',
      tone: 'warn',
    })
  })
  it('the first check, still running, says checking rather than not checked', () => {
    expect(
      line('acct-icloud', [row({ state: 'checking', paths: [] })])?.text,
    ).toBe('Figma, Linear: checking…')
  })
  it('a path nothing answered for is neither good nor a warning', () => {
    expect(
      line('acct-icloud', [
        row({
          paths: [
            {
              service: 'figma',
              via: 'ChatGPT app',
              state: 'unchecked',
              account: null,
            },
            {
              service: 'linear',
              via: 'claude.ai',
              state: 'connected',
              account: null,
            },
          ],
        }),
      ]),
    ).toEqual({
      text: 'Figma not checked · Linear connected · marckraw@icloud.com',
      tone: 'muted',
    })
  })
  it('never claims anything before a check, or for an account the check did not reach', () => {
    expect(line('acct-icloud', [])?.text).toBe(
      'Figma, Linear: not checked yet (Settings → Provider accounts)',
    )
    expect(line('acct-other')?.text).toBe(
      'Figma, Linear: not checked yet (Settings → Provider accounts)',
    )
    expect(line(null)?.text).toBe('Figma, Linear: default account, not checked')
    expect(line(undefined)).toBeNull()
    expect(line('acct-icloud', [row()], true)?.text).toBe(
      'Figma, Linear: on another machine, not checked here',
    )
  })
  it('says so while checking, when the account is off, or when its check failed', () => {
    expect(line('acct-icloud', [row({ state: 'checking' })])?.text).toBe(
      'Figma, Linear: checking…',
    )
    expect(line('acct-icloud', [row({ state: 'not-connected' })])).toEqual({
      text: "Figma, Linear: marckraw@icloud.com isn't connected",
      tone: 'warn',
    })
    expect(line('acct-icloud', [row({ state: 'failed' })])?.text).toBe(
      "Figma, Linear: couldn't check marckraw@icloud.com",
    )
  })
})
