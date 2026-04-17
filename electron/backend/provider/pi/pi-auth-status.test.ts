import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { isPiAuthConfigured } from './pi-auth-status'

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'pi-auth-status-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('isPiAuthConfigured', () => {
  it('returns false when the auth file does not exist', () => {
    withTempDir((dir) => {
      expect(isPiAuthConfigured(join(dir, 'missing.json'))).toBe(false)
    })
  })

  it('returns false when the auth file is empty', () => {
    withTempDir((dir) => {
      const authPath = join(dir, 'auth.json')
      writeFileSync(authPath, '')
      expect(isPiAuthConfigured(authPath)).toBe(false)
    })
  })

  it('returns false when the auth file contains {}', () => {
    withTempDir((dir) => {
      const authPath = join(dir, 'auth.json')
      writeFileSync(authPath, '{}')
      expect(isPiAuthConfigured(authPath)).toBe(false)
    })
  })

  it('returns false when the auth file contains invalid JSON', () => {
    withTempDir((dir) => {
      const authPath = join(dir, 'auth.json')
      writeFileSync(authPath, '{not json')
      expect(isPiAuthConfigured(authPath)).toBe(false)
    })
  })

  it('returns true when the auth file has at least one credential key', () => {
    withTempDir((dir) => {
      const authPath = join(dir, 'auth.json')
      writeFileSync(
        authPath,
        JSON.stringify({ anthropic: { type: 'oauth', refresh: '...' } }),
      )
      expect(isPiAuthConfigured(authPath)).toBe(true)
    })
  })
})
