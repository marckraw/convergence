import { describe, expect, it } from 'vitest'
import { normalizeGitHubRemoteUrl } from './git-origin.pure'

describe('normalizeGitHubRemoteUrl', () => {
  it('rewrites the SSH scp form to https', () => {
    expect(
      normalizeGitHubRemoteUrl('git@github.com:ef-global/backpack-suite.git'),
    ).toBe('https://github.com/ef-global/backpack-suite.git')
    expect(normalizeGitHubRemoteUrl('git@github.com:owner/repo')).toBe(
      'https://github.com/owner/repo.git',
    )
  })

  it('rewrites ssh:// URLs to https', () => {
    expect(
      normalizeGitHubRemoteUrl('ssh://git@github.com/owner/repo.git'),
    ).toBe('https://github.com/owner/repo.git')
  })

  it('normalizes https URLs to the .git form', () => {
    expect(normalizeGitHubRemoteUrl('https://github.com/owner/repo')).toBe(
      'https://github.com/owner/repo.git',
    )
    expect(normalizeGitHubRemoteUrl('https://github.com/owner/repo.git')).toBe(
      'https://github.com/owner/repo.git',
    )
  })

  it('returns null for non-GitHub remotes and malformed input', () => {
    expect(
      normalizeGitHubRemoteUrl('https://gitlab.com/owner/repo.git'),
    ).toBeNull()
    expect(normalizeGitHubRemoteUrl('git@gitlab.com:owner/repo.git')).toBeNull()
    expect(normalizeGitHubRemoteUrl('not a url')).toBeNull()
    expect(normalizeGitHubRemoteUrl('')).toBeNull()
    expect(
      normalizeGitHubRemoteUrl('https://github.com/owner/repo/extra'),
    ).toBeNull()
  })
})
