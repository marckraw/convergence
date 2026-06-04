import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AntigravityMcpService } from './antigravity-mcp.service'

describe('AntigravityMcpService', () => {
  let tempDir: string
  let homeDir: string
  let projectPath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'convergence-antigravity-mcp-'))
    homeDir = join(tempDir, 'home')
    projectPath = join(tempDir, 'project')
    await mkdir(join(homeDir, '.gemini', 'config'), { recursive: true })
    await mkdir(join(projectPath, '.agents'), { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('returns guidance and configured servers from antigravity config files', async () => {
    await writeFile(
      join(homeDir, '.gemini', 'settings.json'),
      JSON.stringify({
        mcpServers: {
          pencil: {
            command: '/Applications/Pencil.app/mcp',
            args: ['--app', 'desktop'],
          },
        },
      }),
    )
    await writeFile(
      join(homeDir, '.gemini', 'config', 'mcp_config.json'),
      JSON.stringify({
        mcpServers: {
          linear: {
            serverUrl: 'https://mcp.linear.app/mcp',
          },
        },
      }),
    )
    await writeFile(
      join(projectPath, '.agents', 'mcp_config.json'),
      JSON.stringify({
        mcpServers: {
          'project-server': {
            command: 'node',
            args: ['server.js'],
          },
        },
      }),
    )

    const result = await new AntigravityMcpService({ homeDir }).list(
      projectPath,
    )

    expect(result.error).toBeNull()
    expect(result.note).toContain('/mcp list')
    expect(result.globalServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'linear',
          scope: 'global',
          scopeLabel: 'Global config',
          transportType: 'streamable_http',
        }),
        expect.objectContaining({
          name: 'pencil',
          scope: 'global',
          scopeLabel: 'Legacy Gemini settings',
          transportType: 'stdio',
        }),
      ]),
    )
    expect(result.projectServers).toEqual([
      expect.objectContaining({
        name: 'project-server',
        scope: 'project',
        transportType: 'stdio',
      }),
    ])
  })

  it('lets project config override a global server with the same name', async () => {
    await writeFile(
      join(homeDir, '.gemini', 'config', 'mcp_config.json'),
      JSON.stringify({
        mcpServers: {
          shared: {
            serverUrl: 'https://global.example.com/mcp',
          },
        },
      }),
    )
    await writeFile(
      join(projectPath, '.agents', 'mcp_config.json'),
      JSON.stringify({
        mcpServers: {
          shared: {
            command: 'node',
            args: ['project-server.js'],
          },
        },
      }),
    )

    const result = await new AntigravityMcpService({ homeDir }).list(
      projectPath,
    )

    expect(result.globalServers).toEqual([])
    expect(result.projectServers).toEqual([
      expect.objectContaining({
        name: 'shared',
        scope: 'project',
        description: 'node project-server.js',
      }),
    ])
  })
})
