import { describe, expect, it } from 'vitest'
import {
  buildClaudeFallbackSummary,
  extractServerNames,
  inferClaudeScope,
  mapClaudeStatus,
  mapClaudeTransport,
  normalizeClaudeListDescription,
  parseClaudeListEntries,
  parseClaudeServerDetails,
} from './claude-mcp.pure'

describe('claude-mcp pure helpers', () => {
  it('extracts server names from config-like records', () => {
    expect(
      extractServerNames({
        atlassian: {},
        'project-docs': {},
      }),
    ).toEqual(['atlassian', 'project-docs'])
    expect(extractServerNames(null)).toEqual([])
    expect(extractServerNames('not-json')).toEqual([])
  })

  it('normalizes list descriptions into descriptions and transport types', () => {
    expect(
      normalizeClaudeListDescription('https://mcp.atlassian.com/v1/mcp (HTTP)'),
    ).toEqual({
      description: 'https://mcp.atlassian.com/v1/mcp',
      transportType: 'http',
    })
    expect(
      normalizeClaudeListDescription('https://example.test/api/sse?key=value'),
    ).toEqual({
      description: 'https://example.test/api/sse?key=value',
      transportType: 'sse',
    })
    expect(
      normalizeClaudeListDescription('npx @acme/project-docs-mcp'),
    ).toEqual({
      description: 'npx @acme/project-docs-mcp',
      transportType: 'stdio',
    })
  })

  it('parses claude mcp list rows and ignores non-server lines', () => {
    expect(
      parseClaudeListEntries(`Checking MCP server health…

atlassian: https://mcp.atlassian.com/v1/mcp (HTTP) - ! Needs authentication
project-docs: npx @acme/project-docs-mcp - ✓ Connected
not a server row
`),
    ).toEqual([
      {
        name: 'atlassian',
        description: 'https://mcp.atlassian.com/v1/mcp',
        statusLabel: '! Needs authentication',
        transportType: 'http',
      },
      {
        name: 'project-docs',
        description: 'npx @acme/project-docs-mcp',
        statusLabel: '✓ Connected',
        transportType: 'stdio',
      },
    ])
  })

  it('maps claude scope, status, and transport labels', () => {
    const scopes = {
      globalServerNames: new Set(['global-docs']),
      projectServerNames: new Set(['project-docs']),
    }

    expect(inferClaudeScope('project-docs', scopes)).toEqual({
      scope: 'project',
      scopeLabel: 'Project config',
    })
    expect(inferClaudeScope('global-docs', scopes)).toEqual({
      scope: 'global',
      scopeLabel: 'User config',
    })
    expect(inferClaudeScope('claude.ai Notion', scopes)).toEqual({
      scope: 'global',
      scopeLabel: 'Built-in global',
    })

    expect(mapClaudeStatus('! Needs authentication')).toBe('needs-auth')
    expect(mapClaudeStatus('✗ Failed to connect')).toBe('failed')
    expect(mapClaudeStatus('Disabled')).toBe('disabled')
    expect(mapClaudeStatus('✓ Connected')).toBe('ready')
    expect(mapClaudeStatus('Pending')).toBe('unknown')

    expect(mapClaudeTransport('stdio')).toBe('stdio')
    expect(mapClaudeTransport('HTTP')).toBe('http')
    expect(mapClaudeTransport('sse')).toBe('sse')
    expect(mapClaudeTransport('streamable_http')).toBe('streamable_http')
    expect(mapClaudeTransport('websocket')).toBe('unknown')
  })

  it('builds fallback summaries from list entries and inferred scope', () => {
    expect(
      buildClaudeFallbackSummary(
        {
          name: 'project-docs',
          description: 'npx @acme/project-docs-mcp',
          statusLabel: '✓ Connected',
          transportType: 'stdio',
        },
        {
          globalServerNames: new Set(),
          projectServerNames: new Set(['project-docs']),
        },
      ),
    ).toEqual({
      name: 'project-docs',
      providerId: 'claude-code',
      providerName: 'Claude Code',
      scope: 'project',
      scopeLabel: 'Project config',
      status: 'ready',
      statusLabel: '✓ Connected',
      transportType: 'stdio',
      description: 'npx @acme/project-docs-mcp',
      enabled: null,
    })
  })

  it('parses claude mcp get details into server summaries', () => {
    expect(
      parseClaudeServerDetails(`project-docs:
  Scope: Project config (available in this project)
  Status: ✓ Connected
  Type: stdio
  Command: npx
  Args: @acme/project-docs-mcp
`),
    ).toEqual({
      name: 'project-docs',
      providerId: 'claude-code',
      providerName: 'Claude Code',
      scope: 'project',
      scopeLabel: 'Project config (available in this project)',
      status: 'ready',
      statusLabel: '✓ Connected',
      transportType: 'stdio',
      description: 'npx @acme/project-docs-mcp',
      enabled: null,
    })

    expect(
      parseClaudeServerDetails(`atlassian:
  Scope: User config (available in all your projects)
  Status: ! Needs authentication
  Type: http
  URL: https://mcp.atlassian.com/v1/mcp
`),
    ).toEqual(
      expect.objectContaining({
        name: 'atlassian',
        scope: 'global',
        status: 'needs-auth',
        transportType: 'http',
        description: 'https://mcp.atlassian.com/v1/mcp',
      }),
    )
  })

  it('returns null for malformed claude mcp get output', () => {
    expect(parseClaudeServerDetails('No MCP server found')).toBeNull()
  })
})
