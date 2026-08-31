import { describe, expect, it } from 'vitest'
import { matchesWorkspaceEnvFilePattern } from './workspace-env.pure'

describe('matchesWorkspaceEnvFilePattern', () => {
  it('matches env files from default root-level patterns', () => {
    expect(matchesWorkspaceEnvFilePattern('.env', ['.env', '.env.*'])).toBe(
      true,
    )
    expect(
      matchesWorkspaceEnvFilePattern('.env.local', ['.env', '.env.*']),
    ).toBe(true)
  })

  it('skips common template env files', () => {
    expect(
      matchesWorkspaceEnvFilePattern('.env.example', ['.env', '.env.*']),
    ).toBe(false)
    expect(
      matchesWorkspaceEnvFilePattern('.env.production.sample', [
        '.env',
        '.env.*',
      ]),
    ).toBe(false)
  })

  it('ignores unrelated files', () => {
    expect(
      matchesWorkspaceEnvFilePattern('README.md', ['.env', '.env.*']),
    ).toBe(false)
  })
})
