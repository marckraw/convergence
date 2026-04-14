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
})
