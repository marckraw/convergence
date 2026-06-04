import { describe, expect, it } from 'vitest'
import {
  buildCursorConfigScopes,
  buildCursorSummary,
  mapCursorStatus,
  mergeCursorSummaries,
  parseCursorListEntries,
  type CursorMcpConfigScopes,
} from './cursor-mcp.pure'

describe('cursor-mcp.pure', () => {
  it('builds cursor config scopes from parsed config objects', () => {
    expect(
      buildCursorConfigScopes(
        {
          mcpServers: {
            linear: { command: 'npx' },
          },
        },
        {
          mcpServers: {
            docs: { url: 'http://127.0.0.1:3845/mcp' },
          },
        },
      ),
    ).toMatchObject({
      globalServerNames: new Set(['linear']),
      projectServerNames: new Set(['docs']),
      globalRecords: { linear: { command: 'npx' } },
      projectRecords: { docs: { url: 'http://127.0.0.1:3845/mcp' } },
    })
  })

  it('parses agent mcp list lines', () => {
    expect(
      parseCursorListEntries(`custom-gc-mcp-server: not loaded (needs approval)
Figma Desktop: loaded
`),
    ).toEqual([
      {
        name: 'custom-gc-mcp-server',
        statusText: 'not loaded (needs approval)',
      },
      { name: 'Figma Desktop', statusText: 'loaded' },
    ])
  })

  it('maps cursor statuses from list output', () => {
    expect(mapCursorStatus('not loaded (needs approval)')).toEqual({
      status: 'needs-auth',
      statusLabel: 'not loaded (needs approval)',
    })
    expect(mapCursorStatus('loaded')).toEqual({
      status: 'ready',
      statusLabel: 'loaded',
    })
  })

  it('groups servers by config scope and enriches transport metadata', () => {
    const scopes: CursorMcpConfigScopes = {
      globalServerNames: new Set(['linear']),
      projectServerNames: new Set(['project-docs']),
      globalRecords: {
        linear: {
          command: 'npx',
          args: ['-y', 'mcp-remote', 'https://mcp.linear.app/mcp'],
        },
      },
      projectRecords: {
        'project-docs': {
          url: 'http://127.0.0.1:3845/mcp',
        },
      },
    }

    const summaries = mergeCursorSummaries(
      [
        {
          name: 'linear',
          statusText: 'not loaded (needs approval)',
        },
        {
          name: 'project-docs',
          statusText: 'loaded',
        },
      ],
      scopes,
    )

    expect(summaries).toEqual([
      expect.objectContaining({
        name: 'linear',
        scope: 'global',
        status: 'needs-auth',
        transportType: 'stdio',
        description: 'npx -y mcp-remote https://mcp.linear.app/mcp',
      }),
      expect.objectContaining({
        name: 'project-docs',
        scope: 'project',
        status: 'ready',
        transportType: 'http',
        description: 'http://127.0.0.1:3845/mcp',
      }),
    ])
  })

  it('includes config-only servers when they are missing from list output', () => {
    const scopes: CursorMcpConfigScopes = {
      globalServerNames: new Set(['orphan-global']),
      projectServerNames: new Set(['orphan-project']),
      globalRecords: {
        'orphan-global': { url: 'https://example.com/mcp' },
      },
      projectRecords: {
        'orphan-project': { command: 'node', args: ['server.js'] },
      },
    }

    const summaries = mergeCursorSummaries([], scopes)

    expect(summaries).toEqual([
      expect.objectContaining({
        name: 'orphan-project',
        scope: 'project',
        status: 'unknown',
        statusLabel: 'Configured',
      }),
      expect.objectContaining({
        name: 'orphan-global',
        scope: 'global',
        status: 'unknown',
        statusLabel: 'Configured',
      }),
    ])
  })

  it('builds a single summary from list and config data', () => {
    const summary = buildCursorSummary(
      { name: 'linear', statusText: 'loaded' },
      {
        globalServerNames: new Set(['linear']),
        projectServerNames: new Set(),
        globalRecords: {
          linear: { url: 'https://mcp.linear.app/mcp' },
        },
        projectRecords: {},
      },
    )

    expect(summary).toMatchObject({
      providerId: 'cursor',
      scope: 'global',
      status: 'ready',
      transportType: 'http',
      description: 'https://mcp.linear.app/mcp',
    })
  })
})
