import { describe, expect, it } from 'vitest'
import {
  buildProviderStatus,
  buildProviderUpdateInfo,
  compareSemver,
  extractSemver,
  getKnownProviders,
  selectProviderVersionOutput,
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
      install: null,
      version: '2.1.112',
      reason: null,
      update: {
        currentVersion: '2.1.112',
        latestVersion: null,
        status: 'unknown',
        packageName: '@anthropic-ai/claude-code',
        installCommand: 'npm install -g @anthropic-ai/claude-code@latest',
        updateCommand: 'claude update',
        manualUpdateCommand: 'claude update',
        automaticUpdateCommand: '/usr/local/bin/claude update',
        updateCapability: 'automatic',
        updateStrategy: 'provider-self-update',
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
      install: null,
      version: null,
      reason: null,
      update: {
        currentVersion: null,
        latestVersion: null,
        status: 'unknown',
        packageName: '@anthropic-ai/claude-code',
        installCommand: 'npm install -g @anthropic-ai/claude-code@latest',
        updateCommand: 'claude update',
        manualUpdateCommand: 'claude update',
        automaticUpdateCommand: '/usr/local/bin/claude update',
        updateCapability: 'automatic',
        updateStrategy: 'provider-self-update',
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
      install: null,
      version: null,
      reason: 'codex is not available on PATH for the app runtime.',
      update: {
        currentVersion: null,
        latestVersion: null,
        status: 'unknown',
        packageName: '@openai/codex',
        installCommand: 'npm install -g @openai/codex@latest',
        updateCommand: 'npm install -g @openai/codex@latest',
        manualUpdateCommand: 'npm install -g @openai/codex@latest',
        automaticUpdateCommand: null,
        updateCapability: 'manual',
        updateStrategy: null,
        checkError: null,
      },
    })
  })

  it('normalizes provider CLI version output', () => {
    expect(extractSemver('2.1.119 (Claude Code)')).toBe('2.1.119')
    expect(extractSemver('codex-cli 0.124.0')).toBe('0.124.0')
    expect(extractSemver('0.67.6')).toBe('0.67.6')
  })

  it('selects version output from stdout or stderr', () => {
    expect(selectProviderVersionOutput('0.74.0\n', '')).toBe('0.74.0')
    expect(selectProviderVersionOutput('', 'codex-cli 0.133.0\n')).toBe(
      'codex-cli 0.133.0',
    )
    expect(
      selectProviderVersionOutput(
        'Checking provider status\n',
        'pi v0.74.0\nUpdate available: 0.75.4\n',
      ),
    ).toBe('pi v0.74.0')
    expect(
      selectProviderVersionOutput(
        '',
        'Error: crash\n    at file:///tmp/node-v24.15.0/app.js\nNode.js v24.15.0\n',
      ),
    ).toBeNull()
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
      updateCommand: 'npm install -g @openai/codex@latest',
      updateCapability: 'manual',
    })
  })

  it('marks npm-managed providers as automatically updatable', () => {
    const provider = getKnownProviders()[1]!
    const status = buildProviderStatus(
      provider,
      '/Users/me/.fnm/bin/codex',
      'codex-cli 0.124.0',
      '0.125.0',
      null,
      {
        manager: 'npm',
        realBinaryPath:
          '/Users/me/.fnm/installation/lib/node_modules/@openai/codex/bin/codex.js',
        packageName: '@openai/codex',
        packageDirectory:
          '/Users/me/.fnm/installation/lib/node_modules/@openai/codex',
        prefixDirectory: '/Users/me/.fnm/installation',
        npmPath: '/Users/me/.fnm/installation/bin/npm',
        nodePath: '/Users/me/.fnm/installation/bin/node',
        nodeVersion: 'v24.15.0',
        brewPrefix: null,
        formulaName: null,
      },
    )

    expect(status.update).toMatchObject({
      status: 'outdated',
      automaticUpdateCommand:
        '/Users/me/.fnm/installation/bin/npm install -g @openai/codex@latest',
      updateCapability: 'automatic',
      updateStrategy: 'npm-global',
    })
  })

  it('keeps Homebrew-managed providers manual even when self-update exists', () => {
    const provider = getKnownProviders()[0]!
    const status = buildProviderStatus(
      provider,
      '/opt/homebrew/bin/claude',
      '2.1.138',
      '2.1.141',
      null,
      {
        manager: 'homebrew',
        realBinaryPath: '/opt/homebrew/Cellar/claude-code/2.1.138/bin/claude',
        packageName: null,
        packageDirectory: null,
        prefixDirectory: '/opt/homebrew',
        npmPath: null,
        nodePath: null,
        nodeVersion: null,
        brewPrefix: '/opt/homebrew',
        formulaName: 'claude-code',
      },
    )

    expect(status.update).toMatchObject({
      status: 'outdated',
      automaticUpdateCommand: null,
      updateCapability: 'manual',
      updateStrategy: null,
    })
  })

  it('uses the new Pi package for registry checks and install commands', () => {
    const provider = getKnownProviders().find((item) => item.id === 'pi')!

    expect(provider).toMatchObject({
      packageName: '@earendil-works/pi-coding-agent',
      legacyPackageNames: ['@mariozechner/pi-coding-agent'],
      installCommand: 'npm install -g @earendil-works/pi-coding-agent@latest',
      updateCommand: 'npm install -g @earendil-works/pi-coding-agent@latest',
    })
  })

  it('builds a migration command for npm-managed legacy Pi installs', () => {
    const provider = getKnownProviders().find((item) => item.id === 'pi')!
    const status = buildProviderStatus(
      provider,
      '/Users/me/.fnm/bin/pi',
      '0.73.1',
      '0.74.0',
      null,
      {
        manager: 'npm',
        realBinaryPath:
          '/Users/me/.fnm/installation/lib/node_modules/@mariozechner/pi-coding-agent/dist/cli.js',
        packageName: '@mariozechner/pi-coding-agent',
        packageDirectory:
          '/Users/me/.fnm/installation/lib/node_modules/@mariozechner/pi-coding-agent',
        prefixDirectory: '/Users/me/.fnm/installation',
        npmPath: '/Users/me/.fnm/installation/bin/npm',
        nodePath: '/Users/me/.fnm/installation/bin/node',
        nodeVersion: 'v24.15.0',
        brewPrefix: null,
        formulaName: null,
      },
    )

    expect(status.update).toMatchObject({
      status: 'outdated',
      packageName: '@earendil-works/pi-coding-agent',
      automaticUpdateCommand:
        '/Users/me/.fnm/installation/bin/npm uninstall -g @mariozechner/pi-coding-agent && /Users/me/.fnm/installation/bin/npm install -g @earendil-works/pi-coding-agent@latest',
      updateCapability: 'automatic',
      updateStrategy: 'npm-global',
    })
  })
})
