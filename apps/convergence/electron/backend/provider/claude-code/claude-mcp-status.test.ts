import { describe, expect, it, vi } from 'vitest'
import {
  mcpJsonServerBlock,
  mcpOrigin,
  pluginJsonMcpServers,
  pluginRootPath,
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
        mcpJsonServerBlock(
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
        ),
        pluginJsonMcpServers(
          JSON.stringify({
            name: 'figma',
            mcpServers: { figma: { url: 'x' } },
          }),
        ).block,
      ]),
    ).toEqual([
      { plugin: 'figma', server: 'figma', origin: 'https://mcp.figma.com' },
    ])
    expect(
      readPluginMcpServers('flat', [
        mcpJsonServerBlock('{not json'),
        mcpJsonServerBlock(
          JSON.stringify({
            docs: { type: 'sse', url: 'https://docs.test/sse' },
          }),
        ),
      ]),
    ).toEqual([{ plugin: 'flat', server: 'docs', origin: 'https://docs.test' }])
  })

  it('R7 counts connected servers before the bound — count over the listed servers and this turns red', () => {
    const fact = readClaudeMcpStatus(
      Array.from({ length: 25 }, (_, index) => ({
        name: `s${index}`,
        status: 'connected',
        config: { url: `https://s${index}.test/` },
      })),
      [],
      'at',
    )
    expect({
      listed: fact.servers.length,
      connected: fact.connected,
      omitted: fact.omitted,
    }).toEqual({ listed: 20, connected: 25, omitted: 5 })
  })

  it('R10 a cut name says so, and whether a plugin server was loaded is read on the whole status', () => {
    const server = 'x'.repeat(64)
    const long = {
      name: `plugin:figma:${server}`,
      status: 'failed',
      config: { url: 'https://mcp.figma.com/mcp' },
    }
    // The loaded server sits beyond the 20-server bound.
    const quiet = Array.from({ length: 20 }, (_, index) => ({
      name: `q${index}`,
      status: 'connected',
    }))
    const fact = readClaudeMcpStatus(
      [
        figmaConnector,
        long,
        ...quiet,
        { name: 'plugin:docs:docs', status: 'connected' },
      ],
      [
        { plugin: 'figma', server, origin: 'https://mcp.figma.com' },
        { plugin: 'docs', server: 'docs', origin: 'https://docs.test' },
        { plugin: 'gone', server: 'gone', origin: 'https://gone.test' },
      ],
      'at',
    )
    expect({
      cut: fact.servers.find((entry) => entry.name.startsWith('plugin:figma:')),
      whole: fact.servers.find((entry) => entry.name === 'claude.ai Figma')
        ?.nameTruncated,
      plugins: fact.pluginServers.map(({ server, loaded }) => [
        server.slice(0, 4),
        loaded,
      ]),
    }).toEqual({
      cut: {
        name: `plugin:figma:${'x'.repeat(49)}`,
        status: 'failed',
        scope: null,
        origin: 'https://mcp.figma.com',
        nameTruncated: true,
      },
      whole: undefined,
      // Not loaded first: only those can be hidden.
      plugins: [
        ['gone', false],
        ['xxxx', true],
        ['docs', true],
      ],
    })
  })

  it('lists alerts first and counts an alert beyond the bound; a worst-case fact still fits the envelope untruncated', () => {
    const fact = readClaudeMcpStatus(
      Array.from({ length: 30 }, (_, index) => ({
        name: `${'\u00e9'.repeat(200)}${index}`,
        status: index % 2 ? 'needs-auth' : 'connected',
        scope: 's'.repeat(40),
        config: {
          type: 'http',
          url: `https://${'h'.repeat(200)}${index}.com/`,
        },
      })),
      Array.from({ length: 12 }, (_, index) => ({
        plugin: 'p'.repeat(100),
        server: `${'s'.repeat(100)}${index}`,
        origin: `https://${'o'.repeat(200)}.com`,
      })),
      '2026-09-25T00:00:00.000Z',
    )
    expect(fact.servers.every((entry) => entry.nameTruncated)).toBe(true)
    expect(JSON.parse(boundedHarnessPayload(fact)).truncated).toBeUndefined()
  })
})

describe('MAR-3206 R9 — only real server blocks from plugin manifests', () => {
  it('plugin.json’s other keys are never servers: author: { url } → no server', () => {
    const manifest = pluginJsonMcpServers(
      JSON.stringify({
        name: 'figma',
        author: { name: 'Figma', url: 'https://github.com/figma' },
        homepage: { url: 'https://figma.com' },
      }),
    )
    expect(manifest).toEqual({ block: null, paths: [] })
    expect(readPluginMcpServers('figma', [manifest.block])).toEqual([])
  })

  it('a string or strings under mcpServers name files; a path is kept only inside the plugin root', () => {
    expect(
      pluginJsonMcpServers(JSON.stringify({ mcpServers: './config/mcp.json' })),
    ).toEqual({ block: null, paths: ['./config/mcp.json'] })
    expect(
      pluginJsonMcpServers(JSON.stringify({ mcpServers: ['a.json', 3] })),
    ).toEqual({ block: null, paths: ['a.json'] })
    expect({
      inside: pluginRootPath('/plugins/figma', './config/mcp.json'),
      up: pluginRootPath('/plugins/figma', '../other/.mcp.json'),
      sneaky: pluginRootPath('/plugins/figma', 'config/../../x.json'),
      absolute: pluginRootPath('/plugins/figma', '/etc/x.json'),
      root: pluginRootPath('/plugins/figma', '.'),
      dotted: pluginRootPath('/plugins/figma', '..mcp.json'),
    }).toEqual({
      inside: '/plugins/figma/config/mcp.json',
      up: null,
      sneaky: null,
      absolute: null,
      root: null,
      dotted: '/plugins/figma/..mcp.json',
    })
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
    expect(readText.mock.calls.map(([path]) => path).sort()).toEqual([
      '/plugins/figma/.claude-plugin/plugin.json',
      '/plugins/figma/.mcp.json',
    ])
  })

  it('R9 follows plugin.json’s string path inside the plugin, and refuses one that escapes it — even through a link', async () => {
    const files: Record<string, string> = {
      '/plugins/a/.claude-plugin/plugin.json': JSON.stringify({
        name: 'a',
        author: { url: 'https://github.com/a' },
        mcpServers: './config/servers.json',
      }),
      '/plugins/a/config/servers.json': JSON.stringify({
        mcpServers: { a: { url: 'https://a.test/mcp' } },
      }),
      '/plugins/b/.claude-plugin/plugin.json': JSON.stringify({
        mcpServers: '../a/config/servers.json',
      }),
      '/plugins/c/.claude-plugin/plugin.json': JSON.stringify({
        mcpServers: './linked.json',
      }),
    }
    const readText = vi.fn(async (path: string) => {
      if (path in files) return files[path]
      throw new Error('ENOENT')
    })
    // c's `linked.json` is a link out of its plugin, to a's file.
    const realPath = async (path: string) =>
      path === '/plugins/c/linked.json'
        ? '/plugins/a/config/servers.json'
        : path
    const record = vi.fn()
    const service = new ClaudeMcpStatusService(
      record,
      () => 'at',
      readText,
      realPath,
    )
    service.observeInit({
      plugins: [
        { name: 'a', path: '/plugins/a' },
        { name: 'b', path: '/plugins/b' },
        { name: 'c', path: '/plugins/c' },
      ],
    })
    await service.refresh(transport([[]]), () => true)
    expect(record.mock.calls[0][0].pluginServers).toEqual([
      { plugin: 'a', server: 'a', origin: 'https://a.test', loaded: false },
    ])
    expect(readText.mock.calls.map(([path]) => path)).not.toContain(
      '/plugins/a/../a/config/servers.json',
    )
  })

  it('R8 a second start record with another plugin list re-reads the manifests — keep the cache across a start record and this turns red', async () => {
    const record = vi.fn()
    const readText = vi.fn(async (path: string) => {
      const plugin = path.split('/')[2]
      if (path.endsWith('.mcp.json'))
        return JSON.stringify({
          mcpServers: { [plugin]: { url: `https://${plugin}.test/mcp` } },
        })
      throw new Error('ENOENT')
    })
    const service = new ClaudeMcpStatusService(record, () => 'at', readText)
    service.observeInit({ plugins: [{ name: 'one', path: '/plugins/one' }] })
    await service.refresh(transport([[linear]]), () => true)
    service.observeInit({ plugins: [{ name: 'two', path: '/plugins/two' }] })
    await service.refresh(transport([[linear]]), () => true)
    expect(
      record.mock.calls.map(([fact]) =>
        fact.pluginServers.map((entry: { plugin: string }) => entry.plugin),
      ),
    ).toEqual([['one'], ['two']])
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
