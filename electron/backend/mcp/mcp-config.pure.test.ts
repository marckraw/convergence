import { describe, expect, it } from 'vitest'
import {
  extractMcpServerRecords,
  parseJsonConfigObject,
  partitionMcpSummariesByScope,
} from './mcp-config.pure'
import type { McpServerSummary } from './mcp.types'

describe('mcp-config.pure', () => {
  it('parses JSON config objects', () => {
    expect(parseJsonConfigObject('{"mcpServers":{}}')).toEqual({
      mcpServers: {},
    })
    expect(parseJsonConfigObject('not-json')).toBeNull()
  })

  it('extracts mcpServers records from config roots', () => {
    expect(
      extractMcpServerRecords({
        mcpServers: {
          linear: { command: 'npx' },
        },
      }),
    ).toEqual({
      linear: { command: 'npx' },
    })
  })

  it('partitions summaries by scope', () => {
    const summaries = [
      { scope: 'global' },
      { scope: 'project' },
      { scope: 'global' },
    ] as McpServerSummary[]

    expect(partitionMcpSummariesByScope(summaries)).toEqual({
      globalServers: [{ scope: 'global' }, { scope: 'global' }],
      projectServers: [{ scope: 'project' }],
    })
  })
})
