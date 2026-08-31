import { describe, expect, it } from 'vitest'
import { FALLBACK_SHELL, resolveDefaultShell } from './shell-resolver.pure'

describe('resolveDefaultShell', () => {
  it('uses SHELL from env when set', () => {
    expect(resolveDefaultShell({ SHELL: '/bin/bash' })).toEqual({
      shell: '/bin/bash',
      args: ['-l'],
    })
  })

  it('falls back when SHELL is missing', () => {
    expect(resolveDefaultShell({})).toEqual({
      shell: FALLBACK_SHELL,
      args: ['-l'],
    })
  })

  it('falls back when SHELL is empty', () => {
    expect(resolveDefaultShell({ SHELL: '' })).toEqual({
      shell: FALLBACK_SHELL,
      args: ['-l'],
    })
  })

  it('always passes login shell arg', () => {
    expect(resolveDefaultShell({ SHELL: '/usr/bin/fish' }).args).toEqual(['-l'])
  })
})
