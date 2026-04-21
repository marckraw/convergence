import { delimiter } from 'path'
import { describe, expect, it } from 'vitest'
import {
  buildShellPathProbeCommand,
  extractShellPathFromStdout,
  mergePathValues,
} from './shell-path.shared.pure'

describe('shell-path.shared.pure', () => {
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

  it('merges path values without duplicates using the platform delimiter', () => {
    const a = ['/a', '/b'].join(delimiter)
    const b = ['/b', '/c'].join(delimiter)
    const c = ['/a', '/d'].join(delimiter)

    expect(mergePathValues(a, b, c)).toBe(
      ['/a', '/b', '/c', '/d'].join(delimiter),
    )
  })

  it('ignores null, undefined, and empty segments', () => {
    expect(mergePathValues(null, undefined, '', '/a', '   /b  ')).toBe(
      ['/a', '/b'].join(delimiter),
    )
  })
})
