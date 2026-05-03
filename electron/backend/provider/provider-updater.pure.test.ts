import { describe, expect, it } from 'vitest'
import {
  buildNpmProviderUpdateArgs,
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
})
