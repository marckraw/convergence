import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FALLBACK_SHELL,
  WINDOWS_FALLBACK_SHELL,
  resolveDefaultShell,
} from './shell-resolver.pure'

describe('resolveDefaultShell', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses SHELL from env when set', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')

    expect(resolveDefaultShell({ SHELL: '/bin/bash' })).toEqual({
      shell: '/bin/bash',
      args: ['-l'],
    })
  })

  it('falls back when SHELL is missing', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')

    expect(resolveDefaultShell({})).toEqual({
      shell: FALLBACK_SHELL,
      args: ['-l'],
    })
  })

  it('falls back when SHELL is empty', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')

    expect(resolveDefaultShell({ SHELL: '' })).toEqual({
      shell: FALLBACK_SHELL,
      args: ['-l'],
    })
  })

  it('always passes login shell arg', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')

    expect(resolveDefaultShell({ SHELL: '/usr/bin/fish' }).args).toEqual(['-l'])
  })

  it('uses ComSpec without login args on Windows', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')

    expect(
      resolveDefaultShell({ ComSpec: 'C:\\Windows\\System32\\cmd.exe' }),
    ).toEqual({
      shell: 'C:\\Windows\\System32\\cmd.exe',
      args: [],
    })
  })

  it('falls back to PowerShell on Windows', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')

    expect(resolveDefaultShell({})).toEqual({
      shell: WINDOWS_FALLBACK_SHELL,
      args: ['-NoLogo'],
    })
  })
})
