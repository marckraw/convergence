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

describe('claude mcp list status by words (MAR-3205)', () => {
  it.each([
    {
      name: 'heavy check Connected (measured Claude Code 2.1.x)',
      line: 'linear: https://mcp.linear.app/sse (HTTP) - ✔ Connected',
      expected: {
        name: 'linear',
        description: 'https://mcp.linear.app/sse',
        statusLabel: '✔ Connected',
        transportType: 'http' as const,
      },
      status: 'ready' as const,
    },
    {
      name: 'legacy check Connected',
      line: 'github: https://api.github.com/mcp (HTTP) - ✓ Connected',
      expected: {
        name: 'github',
        description: 'https://api.github.com/mcp',
        statusLabel: '✓ Connected',
        transportType: 'http' as const,
      },
      status: 'ready' as const,
    },
    {
      name: 'heavy ballot Failed',
      line: 'broken: https://example.test/mcp (HTTP) - ✘ Failed to connect',
      expected: {
        name: 'broken',
        description: 'https://example.test/mcp',
        statusLabel: '✘ Failed to connect',
        transportType: 'http' as const,
      },
      status: 'failed' as const,
    },
    {
      name: 'legacy ballot Failed',
      line: 'broken: https://example.test/mcp (HTTP) - ✗ Failed to connect',
      expected: {
        name: 'broken',
        description: 'https://example.test/mcp',
        statusLabel: '✗ Failed to connect',
        transportType: 'http' as const,
      },
      status: 'failed' as const,
    },
    {
      name: 'Needs authentication bang',
      line: 'atlassian: https://mcp.atlassian.com/v1/mcp (HTTP) - ! Needs authentication',
      expected: {
        name: 'atlassian',
        description: 'https://mcp.atlassian.com/v1/mcp',
        statusLabel: '! Needs authentication',
        transportType: 'http' as const,
      },
      status: 'needs-auth' as const,
    },
    {
      name: 'Connected with no glyph',
      line: 'plain: https://example.test/mcp (HTTP) - Connected',
      expected: {
        name: 'plain',
        description: 'https://example.test/mcp',
        statusLabel: 'Connected',
        transportType: 'http' as const,
      },
      status: 'ready' as const,
    },
  ])('R1: $name', ({ line, expected, status }) => {
    expect(parseClaudeListEntries(line)).toEqual([expected])
    expect(mapClaudeStatus(expected.statusLabel)).toBe(status)
  })

  it.each([
    {
      name: 'colons in the server name',
      line: 'plugin:figma:figma: https://mcp.figma.com/mcp (HTTP) - ✔ Connected',
      expected: {
        name: 'plugin:figma:figma',
        description: 'https://mcp.figma.com/mcp',
        statusLabel: '✔ Connected',
        transportType: 'http' as const,
      },
    },
    {
      name: 'description that is not a URL',
      line: 'railway: railway mcp - ✔ Connected',
      expected: {
        name: 'railway',
        description: 'railway mcp',
        statusLabel: '✔ Connected',
        transportType: 'stdio' as const,
      },
    },
    {
      name: 'stdio command whose args contain a dash',
      line: 'docs: npx -y @acme/project-docs-mcp - ✓ Connected',
      expected: {
        name: 'docs',
        description: 'npx -y @acme/project-docs-mcp',
        statusLabel: '✓ Connected',
        transportType: 'stdio' as const,
      },
    },
  ])('R2: $name', ({ line, expected }) => {
    expect(parseClaudeListEntries(line)).toEqual([expected])
  })

  it('R3: an invented status word is kept as unknown, never dropped', () => {
    const line = 'mystery: https://example.test/mcp (HTTP) - ✳ Quuxed'
    expect(parseClaudeListEntries(line)).toEqual([
      {
        name: 'mystery',
        description: 'https://example.test/mcp',
        statusLabel: '✳ Quuxed',
        transportType: 'http',
      },
    ])
    expect(mapClaudeStatus('✳ Quuxed')).toBe('unknown')
  })
})
