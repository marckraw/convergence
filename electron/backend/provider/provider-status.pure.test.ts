import { describe, expect, it } from 'vitest'
import { buildProviderStatus, getKnownProviders } from './provider-status.pure'

describe('provider-status.pure', () => {
  it('returns the expected known providers', () => {
    expect(getKnownProviders().map((provider) => provider.id)).toEqual([
      'claude-code',
      'codex',
      'pi',
    ])
  })

  it('builds an available provider status when a binary path exists', () => {
    const provider = getKnownProviders()[0]!

    expect(
      buildProviderStatus(provider, '/usr/local/bin/claude', '2.1.112'),
    ).toEqual({
      id: 'claude-code',
      name: 'Claude Code',
      vendorLabel: 'Anthropic',
      availability: 'available',
      statusLabel: 'Available',
      binaryPath: '/usr/local/bin/claude',
      version: '2.1.112',
      reason: null,
    })
  })

  it('builds an available status with null version when version is unknown', () => {
    const provider = getKnownProviders()[0]!

    expect(buildProviderStatus(provider, '/usr/local/bin/claude')).toEqual({
      id: 'claude-code',
      name: 'Claude Code',
      vendorLabel: 'Anthropic',
      availability: 'available',
      statusLabel: 'Available',
      binaryPath: '/usr/local/bin/claude',
      version: null,
      reason: null,
    })
  })

  it('builds an unavailable provider status when no binary path exists', () => {
    const provider = getKnownProviders()[1]!

    expect(buildProviderStatus(provider, null)).toEqual({
      id: 'codex',
      name: 'Codex',
      vendorLabel: 'OpenAI',
      availability: 'unavailable',
      statusLabel: 'Not found',
      binaryPath: null,
      version: null,
      reason: 'codex is not available on PATH for the app runtime.',
    })
  })
})
