import { describe, expect, it } from 'vitest'
import {
  extractMcpServerRecords,
  groupAntigravitySummaries,
  normalizeAntigravityTransportType,
  toAntigravitySummary,
} from './antigravity-mcp.pure'

describe('antigravity-mcp.pure', () => {
  it('extracts mcpServers from antigravity config files', () => {
    expect(
      extractMcpServerRecords({
        mcpServers: {
          pencil: {
            command: '/Applications/Pencil.app/mcp',
            args: ['--app', 'desktop'],
          },
        },
      }),
    ).toEqual({
      pencil: {
        command: '/Applications/Pencil.app/mcp',
        args: ['--app', 'desktop'],
      },
    })
  })

  it('normalizes modern and legacy remote transport fields', () => {
    expect(
      normalizeAntigravityTransportType({
        serverUrl: 'https://mcp.example.com/sse',
      }),
    ).toBe('sse')
    expect(
      normalizeAntigravityTransportType({
        url: 'https://mcp.example.com/mcp',
      }),
    ).toBe('streamable_http')
    expect(
      normalizeAntigravityTransportType({
        command: 'node',
        args: ['server.js'],
      }),
    ).toBe('stdio')
  })

  it('builds summaries with configured status labels', () => {
    const summary = toAntigravitySummary({
      name: 'pencil',
      record: {
        command: '/Applications/Pencil.app/mcp',
        args: ['--app', 'desktop'],
      },
      scope: 'global',
      scopeLabel: 'Global config',
    })

    expect(summary).toMatchObject({
      providerId: 'antigravity',
      scope: 'global',
      status: 'unknown',
      statusLabel: 'Configured',
      transportType: 'stdio',
      description: '/Applications/Pencil.app/mcp --app desktop',
      enabled: true,
    })
  })

  it('groups summaries by scope', () => {
    const grouped = groupAntigravitySummaries([
      {
        name: 'global-server',
        record: { serverUrl: 'https://mcp.example.com/mcp' },
        scope: 'global',
        scopeLabel: 'Global config',
      },
      {
        name: 'project-server',
        record: { command: 'node', args: ['server.js'] },
        scope: 'project',
        scopeLabel: 'Project config',
      },
    ])

    expect(grouped.globalServers).toHaveLength(1)
    expect(grouped.projectServers).toHaveLength(1)
    expect(grouped.globalServers[0]).toMatchObject({
      description: 'https://mcp.example.com/mcp',
    })
  })
})
