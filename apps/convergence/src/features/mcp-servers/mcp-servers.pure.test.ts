import { describe, expect, it } from 'vitest'
import { getMcpStatusBadgeClassName } from './mcp-servers.pure'

describe('mcp-servers.pure', () => {
  it('maps MCP status values to badge classes', () => {
    expect(getMcpStatusBadgeClassName('ready')).toContain('emerald')
    expect(getMcpStatusBadgeClassName('needs-auth')).toContain('warning')
    expect(getMcpStatusBadgeClassName('failed')).toContain('destructive')
    expect(getMcpStatusBadgeClassName('unknown')).toContain('muted')
  })
})
