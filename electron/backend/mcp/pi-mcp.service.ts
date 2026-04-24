import type { ProviderMcpVisibility } from './mcp.types'

export class PiMcpService {
  async list(): Promise<ProviderMcpVisibility> {
    return {
      providerId: 'pi',
      providerName: 'Pi Agent',
      globalServers: [],
      projectServers: [],
      error: null,
      note: 'Pi has no built-in MCP server management. Extension-based MCP integrations are possible, but the Pi CLI does not expose a server list Convergence can inspect yet.',
    }
  }
}
