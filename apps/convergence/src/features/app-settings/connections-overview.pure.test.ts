import { describe, expect, it } from 'vitest'
import {
  VIA_CHATGPT_APP,
  VIA_CLAUDE_AI,
  VIA_CLAUDE_CODE_PLUGIN,
  VIA_CLAUDE_ON_THIS_MAC,
  VIA_CODEX_ON_THIS_MAC,
  claudeConnectionPaths,
  codexConnectionPaths,
  connectionCell,
  connectionPathLine,
  connectionServiceOf,
  describeConnectionsCheckedAt,
} from './connections-overview.pure'

const connector = (name: string, status: string) => ({
  name,
  status,
  statusLabel: status,
  description: '',
  needsAuthorization: status === 'needs-auth',
})

describe('MAR-3518 which service a name belongs to', () => {
  it('finds Figma, Linear and GitHub by word, whatever the app calls them', () => {
    expect(connectionServiceOf('Figma')).toBe('figma')
    expect(connectionServiceOf('plugin:figma:figma')).toBe('figma')
    expect(connectionServiceOf('claude.ai Linear')).toBe('linear')
    expect(connectionServiceOf('GitHub')).toBe('github')
    expect(connectionServiceOf('Hotline')).toBeNull()
    expect(connectionServiceOf('figmatic')).toBeNull()
  })
})

describe("MAR-3518 an OpenAI account's paths say what each check observed", () => {
  const apps = [
    { id: 'figma', name: 'Figma', state: 'available' as const },
    { id: 'github', name: 'GitHub', state: 'available' as const },
    { id: 'linear', name: 'Linear', state: 'unavailable' as const },
    {
      id: 'connector_openai_hotline',
      name: 'Hotline',
      state: 'available' as const,
    },
    { id: 'gh2', name: 'GitHub Enterprise', state: 'off' as const },
  ]
  const signIns = {
    providerAccountId: 'a',
    checkedAt: null,
    error: null,
    signIns: [
      {
        appId: 'figma',
        status: 'needs-sign-in' as const,
        account: 'm@ef.com',
        reason: null,
      },
      {
        appId: 'github',
        status: 'signed-in' as const,
        account: 'Marcin (m@icloud.com)',
        reason: null,
      },
    ],
    servers: [
      {
        server: 'figma',
        status: 'signed-in' as const,
        account: 'm@ef.com',
        reason: null,
      },
    ],
  }
  it('apps by their check, servers by theirs; turned-off apps and other services are no path', () => {
    expect(
      codexConnectionPaths({
        apps,
        signIns,
        connectors: [
          connector('figma', 'ready'),
          connector('linear', 'needs-auth'),
          connector('sentry', 'ready'),
        ],
      }),
    ).toEqual([
      {
        service: 'figma',
        via: VIA_CHATGPT_APP,
        state: 'needs-sign-in',
        account: 'm@ef.com',
      },
      {
        service: 'github',
        via: VIA_CHATGPT_APP,
        state: 'works',
        account: 'Marcin (m@icloud.com)',
      },
      {
        service: 'linear',
        via: VIA_CHATGPT_APP,
        state: 'failed',
        account: null,
      },
      {
        service: 'figma',
        via: VIA_CODEX_ON_THIS_MAC,
        state: 'works',
        account: 'm@ef.com',
      },
      {
        service: 'linear',
        via: VIA_CODEX_ON_THIS_MAC,
        state: 'needs-sign-in',
        account: null,
      },
    ])
  })
  it('without a check, an app is only connected and a server says what Codex saved', () => {
    expect(
      codexConnectionPaths({
        apps: [apps[0]],
        signIns: null,
        connectors: [
          connector('linear', 'ready'),
          connector('figma', 'disabled'),
        ],
      }),
    ).toEqual([
      {
        service: 'figma',
        via: VIA_CHATGPT_APP,
        state: 'connected',
        account: null,
      },
      {
        service: 'linear',
        via: VIA_CODEX_ON_THIS_MAC,
        state: 'connected',
        account: null,
      },
    ])
  })
})

describe("MAR-3518 a Claude account's paths never claim more than Claude does", () => {
  it('names the app from the server name, and connected is the best it says', () => {
    expect(
      claudeConnectionPaths([
        connector('claude.ai Figma', 'ready'),
        connector('plugin:figma:figma', 'needs-auth'),
        connector('linear', 'failed'),
        connector('github', 'unknown'),
      ]),
    ).toEqual([
      {
        service: 'figma',
        via: VIA_CLAUDE_AI,
        state: 'connected',
        account: null,
      },
      {
        service: 'figma',
        via: VIA_CLAUDE_CODE_PLUGIN,
        state: 'needs-sign-in',
        account: null,
      },
      {
        service: 'linear',
        via: VIA_CLAUDE_ON_THIS_MAC,
        state: 'failed',
        account: null,
      },
    ])
  })
})

describe('MAR-3518 one cell per service', () => {
  const paths = claudeConnectionPaths([
    connector('plugin:figma:figma', 'needs-auth'),
    connector('claude.ai Figma', 'ready'),
  ])
  it('lists the best path first and takes its state', () => {
    const cell = connectionCell(paths, 'figma')
    expect(cell.state).toBe('connected')
    expect(cell.paths.map((path) => path.via)).toEqual([
      VIA_CLAUDE_AI,
      VIA_CLAUDE_CODE_PLUGIN,
    ])
  })
  it('a service with no path is none', () => {
    expect(connectionCell(paths, 'github')).toEqual({
      state: 'none',
      paths: [],
    })
  })
  it("reads each path in the panel's words", () => {
    expect(
      connectionPathLine({
        service: 'figma',
        via: VIA_CHATGPT_APP,
        state: 'works',
        account: 'm@ef.com',
      }),
    ).toEqual({ text: 'Signed in as m@ef.com · ChatGPT app', tone: 'good' })
    expect(
      connectionPathLine({
        service: 'figma',
        via: VIA_CHATGPT_APP,
        state: 'works',
        account: null,
      }).text,
    ).toBe('Works · ChatGPT app')
    expect(connectionPathLine(paths[1]).text).toBe('Connected · claude.ai')
    expect(connectionPathLine(paths[0])).toEqual({
      text: 'Needs sign-in again · Claude Code plugin',
      tone: 'warn',
    })
    expect(
      connectionPathLine({
        service: 'linear',
        via: VIA_CHATGPT_APP,
        state: 'failed',
        account: null,
      }).text,
    ).toBe("Couldn't use it · ChatGPT app")
  })
  it('says when it checked, or nothing', () => {
    expect(describeConnectionsCheckedAt('2026-09-28T08:42:00.000Z')).toMatch(
      /^Checked at /,
    )
    expect(describeConnectionsCheckedAt(null)).toBeNull()
    expect(describeConnectionsCheckedAt('nope')).toBeNull()
  })
})
