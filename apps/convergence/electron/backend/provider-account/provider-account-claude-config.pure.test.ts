import { describe, expect, it } from 'vitest'
import {
  collectMcpEnvPassthroughNames,
  reconcileAccountClaudeConfig,
} from './provider-account-claude-config.pure'

const CWD = '/Users/tester/Projects/convergence'

describe('reconcileAccountClaudeConfig', () => {
  it('copies the shared server list into the account config', () => {
    const result = reconcileAccountClaudeConfig({
      accountConfig: { oauthAccount: { emailAddress: 'b@example.com' } },
      sharedConfig: {
        mcpServers: { linear: { command: 'npx', args: ['-y', 'linear-mcp'] } },
      },
      workingDirectory: CWD,
    })

    expect(result.changed).toBe(true)
    expect(result.config.mcpServers).toEqual({
      linear: { command: 'npx', args: ['-y', 'linear-mcp'] },
    })
    expect(result.config.oauthAccount).toEqual({
      emailAddress: 'b@example.com',
    })
  })

  it('copies trust for the working directory when the user granted it', () => {
    const result = reconcileAccountClaudeConfig({
      accountConfig: {},
      sharedConfig: {
        projects: { [CWD]: { hasTrustDialogAccepted: true, history: ['x'] } },
      },
      workingDirectory: CWD,
    })

    expect(result.changed).toBe(true)
    expect(result.config.projects).toEqual({
      [CWD]: { hasTrustDialogAccepted: true },
    })
  })

  it('never invents trust the user has not granted anywhere', () => {
    const result = reconcileAccountClaudeConfig({
      accountConfig: {},
      sharedConfig: { projects: { '/some/other/repo': {} } },
      workingDirectory: CWD,
    })

    expect(result.config.projects).toBeUndefined()
  })

  it('propagates a revoked trust flag rather than only granting', () => {
    const result = reconcileAccountClaudeConfig({
      accountConfig: { projects: { [CWD]: { hasTrustDialogAccepted: true } } },
      sharedConfig: { projects: { [CWD]: { hasTrustDialogAccepted: false } } },
      workingDirectory: CWD,
    })

    expect(result.changed).toBe(true)
    expect(result.config.projects).toEqual({
      [CWD]: { hasTrustDialogAccepted: false },
    })
  })

  it('preserves per-account state the swap depends on', () => {
    // mcpOAuth is the per-slot connector authentication that survives a swap —
    // the concrete upside over the logout dance this design replaces.
    const result = reconcileAccountClaudeConfig({
      accountConfig: {
        mcpOAuth: { linear: { accessToken: 'account-scoped' } },
        orgModelDefaultCache: { org: 'b' },
        projects: { [CWD]: { history: ['earlier turn'] } },
      },
      sharedConfig: {
        mcpServers: { linear: { command: 'npx' } },
        projects: { [CWD]: { hasTrustDialogAccepted: true } },
      },
      workingDirectory: CWD,
    })

    expect(result.config.mcpOAuth).toEqual({
      linear: { accessToken: 'account-scoped' },
    })
    expect(result.config.orgModelDefaultCache).toEqual({ org: 'b' })
    expect(result.config.projects).toEqual({
      [CWD]: { history: ['earlier turn'], hasTrustDialogAccepted: true },
    })
  })

  it('reports no change when the account already agrees', () => {
    const shared = {
      mcpServers: { linear: { command: 'npx' } },
      projects: { [CWD]: { hasTrustDialogAccepted: true } },
    }

    const result = reconcileAccountClaudeConfig({
      accountConfig: {
        mcpServers: { linear: { command: 'npx' } },
        projects: { [CWD]: { hasTrustDialogAccepted: true } },
      },
      sharedConfig: shared,
      workingDirectory: CWD,
    })

    expect(result.changed).toBe(false)
  })

  it('treats a missing account file as a change worth writing', () => {
    const result = reconcileAccountClaudeConfig({
      accountConfig: null,
      sharedConfig: null,
      workingDirectory: CWD,
    })

    expect(result.changed).toBe(true)
    expect(result.config).toEqual({})
  })

  it('leaves the account server list alone when the shared file is unreadable', () => {
    const result = reconcileAccountClaudeConfig({
      accountConfig: { mcpServers: { linear: { command: 'npx' } } },
      sharedConfig: null,
      workingDirectory: CWD,
    })

    expect(result.changed).toBe(false)
    expect(result.config.mcpServers).toEqual({ linear: { command: 'npx' } })
  })

  it('drops a server the user removed from the shared profile', () => {
    const result = reconcileAccountClaudeConfig({
      accountConfig: {
        mcpServers: { linear: { command: 'npx' }, stale: { command: 'old' } },
      },
      sharedConfig: { mcpServers: { linear: { command: 'npx' } } },
      workingDirectory: CWD,
    })

    expect(result.changed).toBe(true)
    expect(result.config.mcpServers).toEqual({ linear: { command: 'npx' } })
  })
})

describe('collectMcpEnvPassthroughNames', () => {
  it('collects variable references and declared env keys', () => {
    const names = collectMcpEnvPassthroughNames({
      github: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_TOKEN: '${GITHUB_PERSONAL_TOKEN}' },
      },
      local: {
        command: '${TOOLS_HOME}/bin/server',
        env: { INHERIT_ME: '' },
      },
    })

    expect(new Set(names)).toEqual(
      new Set([
        'GITHUB_TOKEN',
        'GITHUB_PERSONAL_TOKEN',
        'TOOLS_HOME',
        'INHERIT_ME',
      ]),
    )
  })

  it('finds references in nested headers and default-value syntax', () => {
    const names = collectMcpEnvPassthroughNames({
      remote: {
        url: 'https://mcp.example.com',
        headers: { Authorization: 'Bearer ${MCP_API_TOKEN:-fallback}' },
      },
    })

    expect(names).toEqual(['MCP_API_TOKEN'])
  })

  it('returns nothing for an absent or malformed server list', () => {
    expect(collectMcpEnvPassthroughNames(undefined)).toEqual([])
    expect(collectMcpEnvPassthroughNames(null)).toEqual([])
    expect(collectMcpEnvPassthroughNames('nonsense')).toEqual([])
    expect(collectMcpEnvPassthroughNames({ broken: 'not-an-object' })).toEqual(
      [],
    )
  })
})
