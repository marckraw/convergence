import { describe, expect, it } from 'vitest'
import {
  deriveDefaultCloneDirectoryName,
  normalizeCloneDirectoryName,
  normalizeCloneRemoteUrl,
  resolveCloneDestination,
} from './git-clone.pure'

describe('git clone helpers', () => {
  it('derives folder names from common remote URL formats', () => {
    expect(
      deriveDefaultCloneDirectoryName('https://github.com/acme/app.git'),
    ).toBe('app')
    expect(deriveDefaultCloneDirectoryName('git@github.com:acme/app.git')).toBe(
      'app',
    )
    expect(
      deriveDefaultCloneDirectoryName('ssh://git@example.com/acme/app'),
    ).toBe('app')
  })

  it('rejects unsafe remote URLs', () => {
    expect(() => normalizeCloneRemoteUrl('')).toThrow('Repository URL')
    expect(() => normalizeCloneRemoteUrl('--upload-pack=/tmp/x')).toThrow(
      'unsafe',
    )
    expect(() => normalizeCloneRemoteUrl('https://x.test/repo.git\0')).toThrow(
      'unsafe',
    )
  })

  it('rejects unsafe clone folder names', () => {
    expect(() => normalizeCloneDirectoryName('../repo')).toThrow('unsafe')
    expect(() => normalizeCloneDirectoryName('nested/repo')).toThrow('unsafe')
    expect(() => normalizeCloneDirectoryName('--repo')).toThrow('unsafe')
    expect(() => normalizeCloneDirectoryName('.')).toThrow('unsafe')
  })

  it('resolves the clone destination inside the selected parent folder', () => {
    expect(resolveCloneDestination('/tmp/projects', 'repo')).toBe(
      '/tmp/projects/repo',
    )
    expect(() => resolveCloneDestination('/tmp/projects', '../repo')).toThrow(
      'unsafe',
    )
  })
})
