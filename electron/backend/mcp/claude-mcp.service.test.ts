import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { ClaudeMcpService } from './claude-mcp.service'
import type { CommandRunner } from './command-runner'

describe('ClaudeMcpService', () => {
  it('groups global and project servers from claude mcp output', async () => {
    const runner = vi.fn(async (_binaryPath: string, args: string[]) => {
      if (args[0] === 'mcp' && args[1] === 'list') {
        return {
          stdout: `Checking MCP server health…

atlassian: https://mcp.atlassian.com/v1/mcp (HTTP) - ! Needs authentication
project-docs: npx @acme/project-docs-mcp - ✓ Connected
`,
          stderr: '',
        }
      }

      if (args[0] === 'mcp' && args[1] === 'get' && args[2] === 'atlassian') {
        return {
          stdout: `atlassian:
  Scope: User config (available in all your projects)
  Status: ! Needs authentication
  Type: http
  URL: https://mcp.atlassian.com/v1/mcp
`,
          stderr: '',
        }
      }

      if (
        args[0] === 'mcp' &&
        args[1] === 'get' &&
        args[2] === 'project-docs'
      ) {
        return {
          stdout: `project-docs:
  Scope: Project config (available in this project)
  Status: ✓ Connected
  Type: stdio
  Command: npx
  Args: @acme/project-docs-mcp
`,
          stderr: '',
        }
      }

      throw new Error(`Unexpected command: ${args.join(' ')}`)
    }) as CommandRunner

    const service = new ClaudeMcpService('/usr/local/bin/claude', runner)
    const result = await service.list('/tmp/project')

    expect(result.error).toBeNull()
    expect(result.globalServers).toEqual([
      expect.objectContaining({
        name: 'atlassian',
        scope: 'global',
        status: 'needs-auth',
        transportType: 'http',
      }),
    ])
    expect(result.projectServers).toEqual([
      expect.objectContaining({
        name: 'project-docs',
        scope: 'project',
        status: 'ready',
        transportType: 'stdio',
        description: 'npx @acme/project-docs-mcp',
      }),
    ])
  })

  it('falls back to list output when claude mcp get fails for built-in servers', async () => {
    const runner = vi.fn(async (_binaryPath: string, args: string[]) => {
      if (args[0] === 'mcp' && args[1] === 'list') {
        return {
          stdout: `Checking MCP server health…

claude.ai Notion: https://mcp.notion.com/mcp - ! Needs authentication
atlassian: https://mcp.atlassian.com/v1/mcp (HTTP) - ! Needs authentication
`,
          stderr: '',
        }
      }

      if (args[0] === 'mcp' && args[1] === 'get' && args[2] === 'atlassian') {
        return {
          stdout: `atlassian:
  Scope: User config (available in all your projects)
  Status: ! Needs authentication
  Type: http
  URL: https://mcp.atlassian.com/v1/mcp
`,
          stderr: '',
        }
      }

      if (
        args[0] === 'mcp' &&
        args[1] === 'get' &&
        args[2] === 'claude.ai Notion'
      ) {
        throw new Error(
          'No MCP server found with name: "claude.ai Notion". Configured servers: atlassian, claude.ai Notion',
        )
      }

      throw new Error(`Unexpected command: ${args.join(' ')}`)
    }) as CommandRunner

    const service = new ClaudeMcpService('/usr/local/bin/claude', runner)
    const result = await service.list('/tmp/project')

    expect(result.error).toBeNull()
    expect(result.projectServers).toEqual([])
    expect(result.globalServers).toEqual([
      expect.objectContaining({
        name: 'claude.ai Notion',
        scope: 'global',
        scopeLabel: 'Built-in global',
        status: 'needs-auth',
        transportType: 'http',
        description: 'https://mcp.notion.com/mcp',
      }),
      expect.objectContaining({
        name: 'atlassian',
        scope: 'global',
        scopeLabel: 'User config (available in all your projects)',
        status: 'needs-auth',
        transportType: 'http',
        description: 'https://mcp.atlassian.com/v1/mcp',
      }),
    ])
  })

  it('infers project scope from .mcp.json when details are unavailable', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'convergence-claude-mcp-'))
    await writeFile(
      join(projectPath, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'project-docs': {
            command: 'npx',
            args: ['@acme/project-docs-mcp'],
          },
        },
      }),
    )

    const runner = vi.fn(async (_binaryPath: string, args: string[]) => {
      if (args[0] === 'mcp' && args[1] === 'list') {
        return {
          stdout: `project-docs: npx @acme/project-docs-mcp - ✓ Connected\n`,
          stderr: '',
        }
      }

      if (
        args[0] === 'mcp' &&
        args[1] === 'get' &&
        args[2] === 'project-docs'
      ) {
        throw new Error('project details unavailable')
      }

      throw new Error(`Unexpected command: ${args.join(' ')}`)
    }) as CommandRunner

    try {
      const service = new ClaudeMcpService('/usr/local/bin/claude', runner)
      const result = await service.list(projectPath)

      expect(result.error).toBeNull()
      expect(result.globalServers).toEqual([])
      expect(result.projectServers).toEqual([
        expect.objectContaining({
          name: 'project-docs',
          scope: 'project',
          scopeLabel: 'Project config',
          status: 'ready',
          transportType: 'stdio',
          description: 'npx @acme/project-docs-mcp',
        }),
      ])
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })
})
