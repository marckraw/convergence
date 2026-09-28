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
  it('signed out, unchecked, or another app signed in is not reaching Figma', () => {
    for (const status of ['needs-sign-in', 'failed', 'unchecked'] as const)
      expect(
        codexFigmaReach({
          apps,
          signIns: signIns({
            signIns: [
              { appId: 'asdk_app_figma', status, account: null, reason: null },
              {
                appId: 'github',
                status: 'signed-in',
                account: 'm',
                reason: null,
              },
            ],
            servers: [
              {
                server: 'figma',
                status: 'unchecked',
                account: null,
                reason: null,
              },
            ],
          }),
        }),
      ).toBe('cannot-reach')
    expect(codexFigmaReach({ apps, signIns: signIns() })).toBe('cannot-reach')
  })
  it('a check that failed without any answer cannot tell', () => {
    expect(
      codexFigmaReach({
        apps,
        signIns: signIns({ error: 'Could not check sign-ins' }),
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
  it('a list that failed cannot tell', () => {
    expect(
      claudeFigmaReach(list([], 'Claude Code is not available on PATH.')),
    ).toBe('unknown')
  })
})
