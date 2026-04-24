import { describe, expect, it } from 'vitest'
import { PiMcpService } from './pi-mcp.service'

describe('PiMcpService', () => {
  it('returns a provider section with a Pi MCP note', async () => {
    const service = new PiMcpService()
    const result = await service.list()

    expect(result).toEqual({
      providerId: 'pi',
      providerName: 'Pi Agent',
      globalServers: [],
      projectServers: [],
      error: null,
      note: 'Pi has no built-in MCP server management. Extension-based MCP integrations are possible, but the Pi CLI does not expose a server list Convergence can inspect yet.',
    })
  })
})
