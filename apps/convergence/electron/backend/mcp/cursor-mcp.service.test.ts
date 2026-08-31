import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CursorMcpService } from './cursor-mcp.service'
import type { CommandRunner } from './command-runner'

describe('CursorMcpService', () => {
  let tempDir: string
  let homeDir: string
  let projectPath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'convergence-cursor-mcp-'))
    homeDir = join(tempDir, 'home')
    projectPath = join(tempDir, 'project')
    await mkdir(join(homeDir, '.cursor'), { recursive: true })
    await mkdir(join(projectPath, '.cursor'), { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('groups global and project servers from agent mcp list output', async () => {
    await writeFile(
      join(homeDir, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          linear: {
            command: 'npx',
            args: ['-y', 'mcp-remote', 'https://mcp.linear.app/mcp'],
          },
        },
      }),
    )
    await writeFile(
      join(projectPath, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          'project-docs': {
            url: 'http://127.0.0.1:3845/mcp',
          },
        },
      }),
    )

    const runner = vi.fn(async () => ({
      stdout: `linear: not loaded (needs approval)
project-docs: loaded
`,
      stderr: '',
    })) as CommandRunner

    const result = await new CursorMcpService('/usr/local/bin/agent', runner, {
      homeDir,
    }).list(projectPath)

    expect(runner).toHaveBeenCalledWith(
      '/usr/local/bin/agent',
      ['mcp', 'list'],
      { cwd: projectPath },
    )
    expect(result.error).toBeNull()
    expect(result.globalServers).toEqual([
      expect.objectContaining({
        name: 'linear',
        scope: 'global',
        status: 'needs-auth',
        transportType: 'stdio',
      }),
    ])
    expect(result.projectServers).toEqual([
      expect.objectContaining({
        name: 'project-docs',
        scope: 'project',
        status: 'ready',
        transportType: 'http',
      }),
    ])
  })

  it('returns an error when agent mcp list fails', async () => {
    const runner = vi.fn(async () => {
      throw new Error('agent not found')
    }) as CommandRunner

    const result = await new CursorMcpService('/usr/local/bin/agent', runner, {
      homeDir,
    }).list(projectPath)

    expect(result.error).toBe('agent not found')
    expect(result.globalServers).toEqual([])
    expect(result.projectServers).toEqual([])
  })
})
