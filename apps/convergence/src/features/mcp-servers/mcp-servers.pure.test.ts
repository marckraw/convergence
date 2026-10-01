import { describe, expect, it } from 'vitest'
import { mcpStatusTone } from './mcp-servers.pure'

describe('mcp-servers.pure', () => {
  it('maps MCP status values to tones', () => {
    expect(mcpStatusTone('ready')).toBe('success')
    expect(mcpStatusTone('needs-auth')).toBe('warning')
    expect(mcpStatusTone('failed')).toBe('danger')
    expect(mcpStatusTone('disabled')).toBe('neutral')
  })
})
