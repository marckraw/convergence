import { describe, expect, it, vi } from 'vitest'
import { CodexMcpService } from './codex-mcp.service'
import type { CommandRunner } from './command-runner'

describe('CodexMcpService', () => {
  it('separates global and project-only effective servers', async () => {
    const runner = vi.fn(async (_binaryPath: string, args: string[]) => {
      if (args.join(' ') === 'mcp list --json') {
        return {
          stdout: JSON.stringify([
            {
              name: 'linear',
              enabled: true,
              disabled_reason: null,
              transport: {
                type: 'streamable_http',
                url: 'https://mcp.linear.app/mcp',
              },
            },
          ]),
          stderr: '',
        }
      }

      if (args.join(' ') === '-C /tmp/project mcp list --json') {
        return {
          stdout: JSON.stringify([
            {
              name: 'linear',
              enabled: true,
              disabled_reason: null,
              transport: {
                type: 'streamable_http',
                url: 'https://mcp.linear.app/mcp',
              },
            },
            {
              name: 'project-docs',
              enabled: true,
              disabled_reason: null,
              transport: {
                type: 'stdio',
                command: 'npx',
                args: ['@acme/project-docs-mcp'],
              },
            },
          ]),
          stderr: '',
        }
      }

      throw new Error(`Unexpected command: ${args.join(' ')}`)
    }) as CommandRunner

    const service = new CodexMcpService('/usr/local/bin/codex', runner)
    const result = await service.list('/tmp/project')

    expect(result.error).toBeNull()
    expect(result.globalServers).toEqual([
      expect.objectContaining({
        name: 'linear',
        scope: 'global',
        transportType: 'streamable_http',
        status: 'ready',
      }),
    ])
    expect(result.projectServers).toEqual([
      expect.objectContaining({
        name: 'project-docs',
        scope: 'project',
        transportType: 'stdio',
        description: 'npx @acme/project-docs-mcp',
      }),
    ])
  })
})
