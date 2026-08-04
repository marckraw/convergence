import { describe, expect, it } from 'vitest'
import {
  buildClaudeMcpListCommand,
  buildClaudeMcpLoginCommand,
  describeMcpAuthorizationNote,
  matchClaudeMcpAuthFailure,
} from './provider-account-mcp.pure'

const ACCOUNT = {
  configDir: '/home/.convergence/provider-accounts/claude/acct-a',
  credentialDir: '/home/.convergence/provider-credentials/claude/acct-a',
}
const BASE_ENV = { PATH: '/usr/local/bin', HOME: '/home/tester' }

describe('buildClaudeMcpLoginCommand', () => {
  it('authorizes through the account own credential slot', () => {
    // The lying case this exists to prevent: tokens landing in the default
    // slot while the app reports the chosen account is now connected.
    const command = buildClaudeMcpLoginCommand({
      binaryPath: '/usr/local/bin/claude',
      account: ACCOUNT,
      serverName: 'linear',
      baseEnv: BASE_ENV,
    })

    expect(command.command).toBe('/usr/local/bin/claude')
    expect(command.args).toEqual(['mcp', 'login', 'linear'])
    expect(command.env.CLAUDE_CONFIG_DIR).toBe(ACCOUNT.configDir)
    expect(command.env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(
      ACCOUNT.credentialDir,
    )
  })

  it('carries no inherited credential into the authorization', () => {
    const command = buildClaudeMcpLoginCommand({
      binaryPath: '/usr/local/bin/claude',
      account: ACCOUNT,
      serverName: 'linear',
      baseEnv: { ...BASE_ENV, ANTHROPIC_API_KEY: 'sk-live' },
    })

    expect(command.env.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it('authorizes the ambient default without touching its environment', () => {
    // Selecting no account stays a first-class choice, exactly as at spawn.
    const command = buildClaudeMcpLoginCommand({
      binaryPath: '/usr/local/bin/claude',
      account: null,
      serverName: 'linear',
      baseEnv: BASE_ENV,
    })

    expect(command.env).toEqual(BASE_ENV)
  })

  it('falls back to the no-browser flow when a browser cannot be opened', () => {
    const command = buildClaudeMcpLoginCommand({
      binaryPath: '/usr/local/bin/claude',
      account: ACCOUNT,
      serverName: 'linear',
      baseEnv: BASE_ENV,
      canOpenBrowser: false,
    })

    expect(command.args).toEqual(['mcp', 'login', 'linear', '--no-browser'])
  })

  it('refuses to authorize a server it cannot name', () => {
    expect(() =>
      buildClaudeMcpLoginCommand({
        binaryPath: '/usr/local/bin/claude',
        account: ACCOUNT,
        serverName: '   ',
        baseEnv: BASE_ENV,
      }),
    ).toThrow(/requires the server name/)
  })
})

describe('buildClaudeMcpListCommand', () => {
  it('asks the account about itself, not the ambient credential', () => {
    // `claude mcp list` reports whichever slot the environment points at, so
    // the ambient answer says nothing about what this account authorized.
    const command = buildClaudeMcpListCommand({
      binaryPath: '/usr/local/bin/claude',
      account: ACCOUNT,
      baseEnv: BASE_ENV,
      workingDirectory: '/repo',
    })

    expect(command.args).toEqual(['mcp', 'list'])
    expect(command.env.CLAUDE_CONFIG_DIR).toBe(ACCOUNT.configDir)
    expect(command.cwd).toBe('/repo')
  })
})

describe('matchClaudeMcpAuthFailure', () => {
  it('recognises the wording Convergence already parses elsewhere', () => {
    expect(
      matchClaudeMcpAuthFailure(
        'linear: https://mcp.linear.app - ! Needs authentication',
      ),
    ).toEqual({ serverName: 'linear' })
  })

  it('recognises an authentication failure the stream reports', () => {
    expect(
      matchClaudeMcpAuthFailure(
        'MCP server "linear" requires authentication. Run /mcp to authenticate.',
      ),
    ).toEqual({ serverName: 'linear' })
    expect(
      matchClaudeMcpAuthFailure(
        'Error: MCP server linear is not authenticated',
      ),
    ).toEqual({ serverName: 'linear' })
  })

  it('recognises an expired token as the same actionable problem', () => {
    expect(
      matchClaudeMcpAuthFailure(
        'MCP server github: OAuth token expired, please re-authenticate',
      ),
    ).toEqual({ serverName: 'github' })
  })

  it('names the server from a tool id when that is all there is', () => {
    expect(
      matchClaudeMcpAuthFailure(
        'Tool mcp__linear__list_issues failed: unauthorized',
      ),
    ).toEqual({ serverName: 'linear' })
  })

  it('says nothing when it cannot name the server', () => {
    // A note that cannot say which connector to authorize is worse than none.
    expect(matchClaudeMcpAuthFailure('unauthorized')).toBeNull()
    expect(matchClaudeMcpAuthFailure('Authentication required.')).toBeNull()
  })

  it('does not fire on text that is not about authentication', () => {
    expect(
      matchClaudeMcpAuthFailure('MCP server linear returned 3 issues'),
    ).toBeNull()
    expect(matchClaudeMcpAuthFailure('')).toBeNull()
    expect(matchClaudeMcpAuthFailure(null)).toBeNull()
    expect(matchClaudeMcpAuthFailure({ needs: 'authentication' })).toBeNull()
  })
})

describe('describeMcpAuthorizationNote', () => {
  it('names the server and the account, because either alone is ambiguous', () => {
    // With several accounts on one machine the connector may be perfectly
    // authorized under the one used yesterday.
    const note = describeMcpAuthorizationNote({
      serverName: 'linear',
      accountLabel: 'work@example.com',
      canOpenBrowser: true,
    })

    expect(note).toContain('linear')
    expect(note).toContain('work@example.com')
  })

  it('names the ambient default rather than leaving the account blank', () => {
    expect(
      describeMcpAuthorizationNote({
        serverName: 'linear',
        accountLabel: null,
        canOpenBrowser: true,
      }),
    ).toContain('the default account')
  })

  it('says so when the session cannot open a browser', () => {
    // The run-6 lesson: never offer an action that will appear to do nothing.
    const note = describeMcpAuthorizationNote({
      serverName: 'linear',
      accountLabel: 'work@example.com',
      canOpenBrowser: false,
    })

    expect(note).toMatch(/cannot open a browser/)
    expect(note).toMatch(/Settings/)
  })
})
