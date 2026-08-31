import { describe, expect, it } from 'vitest'
import {
  getIdentity,
  normalizeCodexStatus,
  normalizeTransportType,
  parseCodexServers,
  toSummary,
} from './codex-mcp.pure'

describe('codex-mcp.pure', () => {
  describe('parseCodexServers', () => {
    it('returns Codex server records from array JSON', () => {
      expect(
        parseCodexServers(
          JSON.stringify([
            {
              name: 'linear',
              enabled: true,
              transport: { type: 'streamable_http' },
            },
          ]),
        ),
      ).toEqual([
        {
          name: 'linear',
          enabled: true,
          transport: { type: 'streamable_http' },
        },
      ])
    })

    it('returns an empty list for non-array JSON', () => {
      expect(parseCodexServers(JSON.stringify({ name: 'linear' }))).toEqual([])
    })
  })

  describe('normalizeTransportType', () => {
    it('preserves known Codex transport types', () => {
      expect(normalizeTransportType('stdio')).toBe('stdio')
      expect(normalizeTransportType('http')).toBe('http')
      expect(normalizeTransportType('sse')).toBe('sse')
      expect(normalizeTransportType('streamable_http')).toBe('streamable_http')
    })

    it('maps unknown transport values to unknown', () => {
      expect(normalizeTransportType('websocket')).toBe('unknown')
      expect(normalizeTransportType(null)).toBe('unknown')
    })
  })

  describe('normalizeCodexStatus', () => {
    it('marks enabled servers without disabled reasons as ready', () => {
      expect(normalizeCodexStatus(true, null)).toEqual({
        status: 'ready',
        statusLabel: 'Configured',
      })
    })

    it('marks disabled servers as disabled with the best label', () => {
      expect(normalizeCodexStatus(false, null)).toEqual({
        status: 'disabled',
        statusLabel: 'Disabled',
      })
      expect(normalizeCodexStatus(true, 'Needs OAuth')).toEqual({
        status: 'disabled',
        statusLabel: 'Needs OAuth',
      })
    })
  })

  describe('toSummary', () => {
    it('maps a Codex URL transport record to a provider summary', () => {
      expect(
        toSummary(
          {
            name: 'linear',
            enabled: true,
            transport: {
              type: 'streamable_http',
              url: 'https://mcp.linear.app/mcp',
            },
          },
          'global',
          'Global config',
        ),
      ).toEqual({
        name: 'linear',
        providerId: 'codex',
        providerName: 'Codex',
        scope: 'global',
        scopeLabel: 'Global config',
        status: 'ready',
        statusLabel: 'Configured',
        transportType: 'streamable_http',
        description: 'https://mcp.linear.app/mcp',
        enabled: true,
      })
    })

    it('falls back to command arguments and filters non-string args', () => {
      expect(
        toSummary(
          {
            name: 'project-docs',
            transport: {
              type: 'stdio',
              command: 'npx',
              args: ['@acme/project-docs-mcp', 123, '--stdio'],
            },
          },
          'project',
          'Project config',
        ),
      ).toEqual(
        expect.objectContaining({
          description: 'npx @acme/project-docs-mcp --stdio',
          enabled: true,
          scope: 'project',
          transportType: 'stdio',
        }),
      )
    })

    it('returns null for unnamed records and unknown for blank descriptions', () => {
      expect(toSummary({}, 'global', 'Global config')).toBeNull()
      expect(toSummary({ name: 'empty' }, 'global', 'Global config')).toEqual(
        expect.objectContaining({ description: 'Unknown' }),
      )
    })
  })

  describe('getIdentity', () => {
    it('normalizes default identity fields for comparison', () => {
      expect(getIdentity({ name: 'linear' })).toBe(
        JSON.stringify({
          enabled: true,
          disabledReason: null,
          transport: null,
          startupTimeoutSec: null,
          toolTimeoutSec: null,
          enabledTools: null,
          disabledTools: null,
        }),
      )
    })

    it('includes configuration fields that distinguish effective project records', () => {
      expect(
        getIdentity({
          enabled: false,
          disabled_reason: 'local override',
          transport: { type: 'stdio', command: 'npx', args: ['server'] },
          startup_timeout_sec: 10,
          tool_timeout_sec: 20,
          enabled_tools: ['search'],
          disabled_tools: ['write'],
        }),
      ).toBe(
        JSON.stringify({
          enabled: false,
          disabledReason: 'local override',
          transport: { type: 'stdio', command: 'npx', args: ['server'] },
          startupTimeoutSec: 10,
          toolTimeoutSec: 20,
          enabledTools: ['search'],
          disabledTools: ['write'],
        }),
      )
    })
  })
})
