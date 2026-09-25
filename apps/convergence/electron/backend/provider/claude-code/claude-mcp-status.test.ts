import { describe, expect, it, vi } from 'vitest'
import {
  mcpOrigin,
  readClaudeMcpStatus,
  readPluginMcpServers,
} from './claude-harness.pure'
import { boundedHarnessPayload } from '../../session/harness-evidence.pure'
import { ClaudeMcpStatusService } from './claude-mcp-status.service'
import type { ClaudeTransport } from './claude-transport.service'

/** Two servers the way the SDK's `mcpServerStatus()` reports them. */
const figmaConnector = {
  name: 'claude.ai Figma',
  status: 'needs-auth',
  scope: 'claudeai',
  config: {
    type: 'claudeai-proxy',
    url: 'https://mcp.figma.com/mcp',
    id: 'mcpsrv_1',
  },
}
const linear = {
  name: 'plugin:linear:linear',
  status: 'connected',
  scope: 'dynamic',
  config: { type: 'http', url: 'https://mcp.linear.app/sse' },
}

describe('MAR-3206 R1 — scope and origin per server', () => {
  it('records a claude.ai connector and a plugin server with their scope and origin — record the full URL and this turns red', () => {
    expect(
      readClaudeMcpStatus([figmaConnector, linear], [], 'at').servers,
    ).toEqual([
      {
        name: 'claude.ai Figma',
        status: 'needs-auth',
        scope: 'claudeai',
        origin: 'https://mcp.figma.com',
      },
      {
        name: 'plugin:linear:linear',
        status: 'connected',
        scope: 'dynamic',
        origin: 'https://mcp.linear.app',
      },
    ])
  })

  it('records only the origin of a URL with a path, a query and credentials', () => {
    const fact = readClaudeMcpStatus(
      [
        {
          name: 'private',
          status: 'connected',
          scope: 'user',
          config: {
            type: 'http',
            url: 'https://user:secret@mcp.example.com:8443/v1/sse?token=abc#frag',
          },
        },
      ],
      [],
      'at',
    )
    expect(fact.servers[0].origin).toBe('https://mcp.example.com:8443')
    expect(JSON.stringify(fact)).not.toMatch(/secret|token=abc|\/v1\/sse/)
  })

  it('has no address for a server without a URL, and no scope when none is reported', () => {
    expect(
      readClaudeMcpStatus(
        [{ name: 'local', status: 'connected', config: { command: 'x' } }],
        [],
        'at',
      ).servers,
    ).toEqual([
      { name: 'local', status: 'connected', scope: null, origin: null },
    ])
    expect(mcpOrigin('file:///tmp/x')).toBeNull()
    expect(mcpOrigin('not a url')).toBeNull()
  })

  it('lists alerts first and counts an alert beyond the bound; a worst-case fact fits the envelope untruncated', () => {
    const quiet = Array.from({ length: 30 }, (_, index) => ({
      name: `${'q'.repeat(80)}${index}`,
      status: 'connected',
      scope: 's'.repeat(40),
      config: { type: 'http', url: `https://${'h'.repeat(200)}${index}.com/` },
    }))
    const fact = readClaudeMcpStatus(
      [...quiet, { ...figmaConnector }],
      Array.from({ length: 12 }, (_, index) => ({
        plugin: 'p'.repeat(100),
        server: `${'s'.repeat(100)}${index}`,
        origin: `https://${'o'.repeat(200)}.com`,
      })),
      '2026-09-25T00:00:00.000Z',
    )
    expect(fact.servers[0].name).toBe('claude.ai Figma')
    expect({ omitted: fact.omitted, alerts: fact.omittedAlerts }).toEqual({
      omitted: 11,
      alerts: 0,
    })
    expect(JSON.parse(boundedHarnessPayload(fact)).truncated).toBeUndefined()
  })

  it('reads a plugin manifest for names and origins only, from .mcp.json and plugin.json', () => {
    expect(
      readPluginMcpServers('figma', [
        JSON.stringify({
          mcpServers: {
            figma: {
              type: 'http',
              url: 'https://mcp.figma.com/mcp',
              headers: { Authorization: 'Bearer nope' },
            },
            local: { command: 'node' },
          },
        }),
        JSON.stringify({ name: 'figma', mcpServers: { figma: { url: 'x' } } }),
      ]),
    ).toEqual([
      { plugin: 'figma', server: 'figma', origin: 'https://mcp.figma.com' },
    ])
    expect(
      readPluginMcpServers('flat', [
        '{not json',
        JSON.stringify({ docs: { type: 'sse', url: 'https://docs.test/sse' } }),
      ]),
    ).toEqual([{ plugin: 'flat', server: 'docs', origin: 'https://docs.test' }])
  })
})

function transport(statuses: unknown[][]): ClaudeTransport & {
  mcpServerStatus: ReturnType<typeof vi.fn>
} {
  const reads = [...statuses]
  return {
    canStopTasks: false,
    write: () => {},
    stopTask: async () => {},
    interrupt: async () => ({}),
    setModel: async () => {},
    setPermissionMode: async () => {},
    mcpServerStatus: vi.fn(async () => reads.shift() ?? []),
    reconnectMcpServer: async () => {},
    close: async () => {},
  }
}

describe('ClaudeMcpStatusService', () => {
  it('records the status with the loaded plugins’ declared servers, read from their manifests', async () => {
    const record = vi.fn()
    const readText = vi.fn(async (path: string) => {
      if (path === '/plugins/figma/.mcp.json')
        return JSON.stringify({
          mcpServers: { figma: { url: 'https://mcp.figma.com/mcp' } },
        })
      throw new Error('ENOENT')
    })
    const service = new ClaudeMcpStatusService(record, () => 'at', readText)
    service.observeInit({
      plugins: [{ name: 'figma', path: '/plugins/figma' }],
    })
    await service.refresh(transport([[figmaConnector, linear]]), () => true)
    expect(record).toHaveBeenCalledTimes(1)
    expect(record.mock.calls[0][0]).toMatchObject({
      kind: 'harness.mcpStatus',
      pluginServers: [
        { plugin: 'figma', server: 'figma', origin: 'https://mcp.figma.com' },
      ],
    })
    expect(readText.mock.calls.map(([path]) => path)).toEqual([
      '/plugins/figma/.mcp.json',
      '/plugins/figma/.claude-plugin/plugin.json',
    ])
  })

  it('records an unchanged status once per start record, and drops a reading whose process is no longer current', async () => {
    const record = vi.fn()
    const service = new ClaudeMcpStatusService(
      record,
      () => 'at',
      async () => {
        throw new Error('ENOENT')
      },
    )
    service.observeInit({})
    const fake = transport([[linear], [linear], [linear], [figmaConnector]])
    await service.refresh(fake, () => true)
    await service.refresh(fake, () => true)
    expect(record).toHaveBeenCalledTimes(1)
    service.observeInit({})
    await service.refresh(fake, () => true)
    expect(record).toHaveBeenCalledTimes(2)
    await service.refresh(fake, () => false)
    expect(record).toHaveBeenCalledTimes(2)
  })
})
