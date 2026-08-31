import { describe, expect, it } from 'vitest'
import {
  buildBinaryPathCandidates,
  buildNonNpmProviderInstallInfo,
  buildNpmProviderUninstallArgs,
  buildNpmProviderUpdateArgs,
  resolveHomebrewProviderInstall,
  resolveNpmManagedProviderInstall,
} from './provider-updater.pure'

describe('provider-updater.pure', () => {
  it('resolves an npm global prefix from a scoped package binary', () => {
    expect(
      resolveNpmManagedProviderInstall(
        '/Users/me/.fnm/node-versions/v24.14.1/installation/lib/node_modules/@openai/codex/bin/codex.js',
        '@openai/codex',
        'darwin',
      ),
    ).toEqual({
      packageName: '@openai/codex',
      packageDirectory:
        '/Users/me/.fnm/node-versions/v24.14.1/installation/lib/node_modules/@openai/codex',
      prefixDirectory: '/Users/me/.fnm/node-versions/v24.14.1/installation',
      npmPath: '/Users/me/.fnm/node-versions/v24.14.1/installation/bin/npm',
    })
  })

  it('resolves a Windows npm global prefix without a lib segment', () => {
    expect(
      resolveNpmManagedProviderInstall(
        'C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js',
        '@openai/codex',
        'win32',
      ),
    ).toEqual({
      packageName: '@openai/codex',
      packageDirectory:
        'C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex',
      prefixDirectory: 'C:\\Users\\me\\AppData\\Roaming\\npm',
      npmPath: 'C:\\Users\\me\\AppData\\Roaming\\npm\\npm.cmd',
    })
  })

  it('returns null when the real binary is not under the expected package', () => {
    expect(
      resolveNpmManagedProviderInstall(
        '/opt/homebrew/bin/codex',
        '@openai/codex',
        'darwin',
      ),
    ).toBeNull()
  })

  it('builds the targeted npm update arguments', () => {
    expect(buildNpmProviderUpdateArgs('@openai/codex')).toEqual([
      'install',
      '-g',
      '@openai/codex@latest',
    ])
  })

  it('pins the npm update to the owning prefix when one is provided', () => {
    expect(
      buildNpmProviderUpdateArgs('@openai/codex', '/Users/me/.npm-global'),
    ).toEqual([
      'install',
      '-g',
      '@openai/codex@latest',
      '--prefix',
      '/Users/me/.npm-global',
    ])
  })

  it('builds npm uninstall arguments with and without a prefix', () => {
    expect(buildNpmProviderUninstallArgs('@openai/codex-cli')).toEqual([
      'uninstall',
      '-g',
      '@openai/codex-cli',
    ])
    expect(
      buildNpmProviderUninstallArgs(
        '@openai/codex-cli',
        '/Users/me/.npm-global',
      ),
    ).toEqual([
      'uninstall',
      '-g',
      '@openai/codex-cli',
      '--prefix',
      '/Users/me/.npm-global',
    ])
  })

  it('expands a PATH value into npm binary candidates (posix)', () => {
    expect(
      buildBinaryPathCandidates(
        'npm',
        '/Users/me/.npm-global/bin:/Users/me/.fnm/node-versions/v24.14.1/installation/bin: ',
        'darwin',
      ),
    ).toEqual([
      '/Users/me/.npm-global/bin/npm',
      '/Users/me/.fnm/node-versions/v24.14.1/installation/bin/npm',
    ])
  })

  it('expands a PATH value into npm binary candidates (win32)', () => {
    expect(
      buildBinaryPathCandidates(
        'npm',
        'C:\\Users\\me\\AppData\\Roaming\\npm;C:\\Program Files\\nodejs',
        'win32',
      ),
    ).toEqual([
      'C:\\Users\\me\\AppData\\Roaming\\npm\\npm.cmd',
      'C:\\Users\\me\\AppData\\Roaming\\npm\\npm.exe',
      'C:\\Users\\me\\AppData\\Roaming\\npm\\npm',
      'C:\\Program Files\\nodejs\\npm.cmd',
      'C:\\Program Files\\nodejs\\npm.exe',
      'C:\\Program Files\\nodejs\\npm',
    ])
  })

  it('detects Homebrew-managed provider paths on macOS', () => {
    expect(
      resolveHomebrewProviderInstall(
        '/opt/homebrew/Cellar/codex/0.130.0/bin/codex',
        'darwin',
      ),
    ).toEqual({
      prefixDirectory: '/opt/homebrew',
      formulaName: 'codex',
    })
  })

  it('classifies non-npm Claude installs as provider-managed', () => {
    expect(
      buildNonNpmProviderInstallInfo(
        '/Users/me/.local/bin/claude',
        'claude-code',
      ),
    ).toMatchObject({
      manager: 'self',
      realBinaryPath: '/Users/me/.local/bin/claude',
    })
  })

  it('classifies non-npm Cursor installs as provider-managed', () => {
    expect(
      buildNonNpmProviderInstallInfo(
        '/Users/me/.local/share/cursor-agent/versions/2026.06.02-8c11d9f/cursor-agent',
        'cursor',
      ),
    ).toMatchObject({
      manager: 'self',
      realBinaryPath:
        '/Users/me/.local/share/cursor-agent/versions/2026.06.02-8c11d9f/cursor-agent',
    })
  })

  it('classifies non-npm Antigravity installs as provider-managed', () => {
    expect(
      buildNonNpmProviderInstallInfo('/Users/me/.local/bin/agy', 'antigravity'),
    ).toMatchObject({
      manager: 'self',
      realBinaryPath: '/Users/me/.local/bin/agy',
    })
  })
})
