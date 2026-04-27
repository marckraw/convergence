import { describe, expect, it } from 'vitest'
import {
  buildProviderStatus,
  buildProviderUpdateInfo,
  compareSemver,
  extractSemver,
  getKnownProviders,
} from './provider-status.pure'

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
      update: {
        currentVersion: '2.1.112',
        latestVersion: null,
        status: 'unknown',
        packageName: '@anthropic-ai/claude-code',
        installCommand: 'npm install -g @anthropic-ai/claude-code@latest',
        updateCommand: 'claude update',
        checkError: null,
      },
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
      update: {
        currentVersion: null,
        latestVersion: null,
        status: 'unknown',
        packageName: '@anthropic-ai/claude-code',
        installCommand: 'npm install -g @anthropic-ai/claude-code@latest',
        updateCommand: 'claude update',
        checkError: null,
      },
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
      update: {
        currentVersion: null,
        latestVersion: null,
        status: 'unknown',
        packageName: '@openai/codex',
        installCommand: 'npm install -g @openai/codex@latest',
        updateCommand: 'codex --upgrade',
        checkError: null,
      },
    })
  })

  it('normalizes provider CLI version output', () => {
    expect(extractSemver('2.1.119 (Claude Code)')).toBe('2.1.119')
    expect(extractSemver('codex-cli 0.124.0')).toBe('0.124.0')
    expect(extractSemver('0.67.6')).toBe('0.67.6')
  })

  it('compares semver values', () => {
    expect(compareSemver('0.124.0', '0.125.0')).toBeLessThan(0)
    expect(compareSemver('2.1.119', '2.1.112')).toBeGreaterThan(0)
    expect(compareSemver('0.70.2', '0.70.2')).toBe(0)
    expect(compareSemver('1.0.0-alpha.1', '1.0.0')).toBeLessThan(0)
  })

  it('marks a provider as outdated when a newer registry version exists', () => {
    const provider = getKnownProviders()[1]!

    expect(
      buildProviderUpdateInfo(provider, 'codex-cli 0.124.0', '0.125.0'),
    ).toMatchObject({
      currentVersion: '0.124.0',
      latestVersion: '0.125.0',
      status: 'outdated',
      packageName: '@openai/codex',
      updateCommand: 'codex --upgrade',
    })
  })
})
