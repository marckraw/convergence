import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PiMcpService } from './pi-mcp.service'

describe('PiMcpService', () => {
  let tempDir: string
  let homeDir: string
  let agentDir: string
  let projectPath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'convergence-pi-mcp-'))
    homeDir = join(tempDir, 'home')
    agentDir = join(tempDir, 'agent')
    projectPath = join(tempDir, 'project')
    await mkdir(homeDir, { recursive: true })
    await mkdir(agentDir, { recursive: true })
    await mkdir(projectPath, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('returns a provider section with Pi MCP adapter guidance', async () => {
    const service = new PiMcpService({ homeDir, agentDir })
    const result = await service.list()

    expect(result).toMatchObject({
      providerId: 'pi',
      providerName: 'Pi Agent',
      globalServers: [],
      projectServers: [],
      error: null,
    })
    expect(result.note).toContain('pi-mcp-adapter')
  })

  it('lists standard global MCP servers used by the Pi adapter', async () => {
    await mkdir(join(homeDir, '.config', 'mcp'), { recursive: true })
    await mkdir(join(agentDir, 'mcp-oauth', 'linear'), { recursive: true })
    await writeFile(
      join(homeDir, '.config', 'mcp', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          linear: {
            url: 'https://mcp.linear.app/mcp',
            auth: 'oauth',
          },
          localDocs: {
            command: 'npx',
            args: ['-y', '@acme/docs-mcp'],
          },
        },
      }),
    )
    await writeFile(
      join(agentDir, 'mcp-oauth', 'linear', 'tokens.json'),
      JSON.stringify({ serverUrl: 'https://mcp.linear.app/mcp' }),
    )

    const result = await new PiMcpService({ homeDir, agentDir }).list()

    expect(result.globalServers).toEqual([
      {
        name: 'linear',
        providerId: 'pi',
        providerName: 'Pi Agent',
        scope: 'global',
        scopeLabel: 'Shared global config',
        status: 'ready',
        statusLabel: 'Authorized',
        transportType: 'streamable_http',
        description: 'https://mcp.linear.app/mcp',
        enabled: true,
      },
      {
        name: 'localDocs',
        providerId: 'pi',
        providerName: 'Pi Agent',
        scope: 'global',
        scopeLabel: 'Shared global config',
        status: 'ready',
        statusLabel: 'Configured',
        transportType: 'stdio',
        description: 'npx -y @acme/docs-mcp',
        enabled: true,
      },
    ])
  })

  it('marks OAuth servers as needing auth when Pi has no token marker', async () => {
    await mkdir(join(homeDir, '.config', 'mcp'), { recursive: true })
    await writeFile(
      join(homeDir, '.config', 'mcp', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          linear: {
            url: 'https://mcp.linear.app/mcp',
            auth: 'oauth',
          },
        },
      }),
    )

    const result = await new PiMcpService({ homeDir, agentDir }).list()

    expect(result.globalServers[0]).toMatchObject({
      name: 'linear',
      status: 'needs-auth',
      statusLabel: 'Needs authentication',
    })
  })

  it('lists project overrides with project scope', async () => {
    await writeFile(
      join(projectPath, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          repoTools: {
            command: 'node',
            args: ['server.mjs'],
          },
        },
      }),
    )

    const result = await new PiMcpService({ homeDir, agentDir }).list(
      projectPath,
    )

    expect(result.projectServers).toEqual([
      expect.objectContaining({
        name: 'repoTools',
        scope: 'project',
        scopeLabel: 'Shared project config',
        transportType: 'stdio',
      }),
    ])
  })
})
