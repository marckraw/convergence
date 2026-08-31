import { describe, expect, it } from 'vitest'
import {
  buildShellPathProbeCommand,
  extractShellPathFromStdout,
  getFallbackPathEntries,
  mergePathValues,
} from './shell-path.pure'

describe('shell-path.pure', () => {
  it('builds a shell probe command with markers', () => {
    const command = buildShellPathProbeCommand()

    expect(command).toContain('__CONVERGENCE_PATH_START__')
    expect(command).toContain('__CONVERGENCE_PATH_END__')
    expect(command).toContain('"$PATH"')
  })

  it('extracts the path value between markers', () => {
    const value = extractShellPathFromStdout(
      [
        'noise',
        '__CONVERGENCE_PATH_START__',
        '/a:/b:/c',
        '__CONVERGENCE_PATH_END__',
      ].join('\n'),
    )

    expect(value).toBe('/a:/b:/c')
  })

  it('returns null when markers are missing', () => {
    expect(extractShellPathFromStdout('no markers here')).toBeNull()
  })

  it('merges path values without duplicates', () => {
    expect(mergePathValues('/a:/b', '/b:/c', '/a:/d')).toBe('/a:/b:/c:/d')
  })

  it('includes common fallback locations', () => {
    const fallbackEntries = getFallbackPathEntries()

    expect(fallbackEntries).toContain('/opt/homebrew/bin')
    expect(fallbackEntries).toContain('/usr/local/bin')
  })
})
