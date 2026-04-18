import { describe, expect, it } from 'vitest'
import { getFallbackPathEntries } from './shell-path.darwin.pure'

describe('shell-path.darwin.pure', () => {
  it('includes Homebrew and standard Unix locations', () => {
    const entries = getFallbackPathEntries()

    expect(entries).toContain('/opt/homebrew/bin')
    expect(entries).toContain('/usr/local/bin')
    expect(entries).toContain('/usr/bin')
  })

  it('uses forward-slash paths (POSIX style)', () => {
    const entries = getFallbackPathEntries()

    for (const entry of entries) {
      expect(entry.startsWith('/')).toBe(true)
      expect(entry).not.toContain('\\')
    }
  })
})
