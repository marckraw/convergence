import { describe, expect, it } from 'vitest'
import { claudeFigmaReach, codexFigmaReach } from './seat-figma-reach.pure'

const apps = {
  providerAccountId: 'a',
  apps: [
    { id: 'asdk_app_figma', name: 'Figma', state: 'available' as const },
    { id: 'github', name: 'GitHub', state: 'available' as const },
  ],
  requiresChatGpt: false,
  error: null,
}
const signIns = (
  overrides: Partial<Parameters<typeof codexFigmaReach>[0]['signIns']> = {},
) => ({
  providerAccountId: 'a',
  checkedAt: null,
  error: null,
  signIns: [],
  servers: [],
  ...overrides,
})

describe('MAR-3526 an OpenAI account reaches Figma only when a call said so', () => {
  it('its ChatGPT Figma app signed in, or Figma on this Mac signed in', () => {
    expect(
      codexFigmaReach({
        apps,
        signIns: signIns({
          signIns: [
            {
              appId: 'asdk_app_figma',
              status: 'signed-in',
              account: 'm',
              reason: null,
            },
          ],
        }),
      }),
    ).toBe('reaches')
    expect(
      codexFigmaReach({
        apps,
        signIns: signIns({
          signIns: [
            {
              appId: 'asdk_app_figma',
              status: 'needs-sign-in',
              account: null,
              reason: null,
            },
          ],
          servers: [
            {
              server: 'figma',
              status: 'signed-in',
              account: 'm',
              reason: null,
            },
          ],
        }),
      }),
    ).toBe('reaches')
  })
  it('a Figma sign-in that needs renewing, or a full read with no Figma, cannot reach', () => {
    expect(
      codexFigmaReach({
        apps,
        signIns: signIns({
          signIns: [
            {
              appId: 'asdk_app_figma',
              status: 'needs-sign-in',
              account: null,
              reason: null,
            },
            {
              appId: 'github',
              status: 'signed-in',
              account: 'm',
              reason: null,
            },
          ],
        }),
      }),
    ).toBe('cannot-reach')
    expect(codexFigmaReach({ apps, signIns: signIns() })).toBe('cannot-reach')
  })
  it("a check that couldn't tell is unknown, never a false 'sign it in'", () => {
    for (const status of ['failed', 'unchecked'] as const)
      expect(
        codexFigmaReach({
          apps,
          signIns: signIns({
            signIns: [
              { appId: 'asdk_app_figma', status, account: null, reason: null },
            ],
          }),
        }),
      ).toBe('unknown')
    expect(
      codexFigmaReach({
        apps,
        signIns: signIns({ error: 'Could not check sign-ins' }),
      }),
    ).toBe('unknown')
    expect(
      codexFigmaReach({
        apps: { ...apps, error: 'Could not read ChatGPT apps' },
        signIns: signIns(),
      }),
    ).toBe('unknown')
    expect(
      codexFigmaReach({
        apps: { ...apps, apps: [], requiresChatGpt: true },
        signIns: signIns(),
      }),
    ).toBe('unknown')
  })
})

describe("MAR-3526 a Claude account reaches Figma when Claude's own list says connected", () => {
  const list = (
    connectors: Array<[string, string]>,
    error: string | null = null,
  ) => ({
    providerAccountId: 'c',
    connectors: connectors.map(([name, status]) => ({
      name,
      status: status as 'ready',
      statusLabel: status,
      description: '',
      needsAuthorization: status === 'needs-auth',
    })),
    error,
  })
  it('any Figma server ready', () => {
    expect(
      claudeFigmaReach(
        list([
          ['plugin:figma:figma', 'needs-auth'],
          ['claude.ai Figma', 'ready'],
        ]),
      ),
    ).toBe('reaches')
  })
  it('only signed-out Figma, or none, or another service', () => {
    expect(claudeFigmaReach(list([['claude.ai Figma', 'needs-auth']]))).toBe(
      'cannot-reach',
    )
    expect(claudeFigmaReach(list([['linear', 'ready']]))).toBe('cannot-reach')
  })
  it('a Figma server that failed is unknown, not a sign-in problem', () => {
    expect(claudeFigmaReach(list([['plugin:figma:figma', 'failed']]))).toBe(
      'unknown',
    )
  })
  it('a list that failed cannot tell', () => {
    expect(
      claudeFigmaReach(list([], 'Claude Code is not available on PATH.')),
    ).toBe('unknown')
  })
})
