import { describe, expect, it } from 'vitest'
import {
  buildWindowsHiddenProcessOptions,
  getBinaryExtension,
  needsShellForSpawn,
} from './shell-exec.pure'

describe('getBinaryExtension', () => {
  it('returns lowercase extensions from POSIX and Windows paths', () => {
    expect(getBinaryExtension('C:\\Program Files\\Git\\cmd\\git.EXE')).toBe(
      '.exe',
    )
    expect(getBinaryExtension('/usr/local/bin/claude')).toBe('')
    expect(getBinaryExtension('C:\\Users\\me\\AppData\\npm\\claude.cmd')).toBe(
      '.cmd',
    )
  })

  it('ignores leading dots on dotfiles', () => {
    expect(getBinaryExtension('/home/me/.profile')).toBe('')
  })
})

describe('needsShellForSpawn', () => {
  it('uses a shell for Windows command shims', () => {
    expect(needsShellForSpawn('C:\\npm\\claude.cmd', 'win32')).toBe(true)
    expect(needsShellForSpawn('C:\\npm\\codex.bat', 'win32')).toBe(true)
    expect(needsShellForSpawn('C:\\npm\\pi.ps1', 'win32')).toBe(true)
  })

  it('does not use a shell for native executables or non-Windows platforms', () => {
    expect(needsShellForSpawn('C:\\Tools\\git.exe', 'win32')).toBe(false)
    expect(needsShellForSpawn('/usr/local/bin/codex.cmd', 'darwin')).toBe(false)
  })
})

describe('buildWindowsHiddenProcessOptions', () => {
  it('hides Windows subprocess consoles and only shells wrapped shims', () => {
    expect(
      buildWindowsHiddenProcessOptions('C:\\npm\\codex.cmd', 'win32'),
    ).toEqual({ shell: true, windowsHide: true })
    expect(
      buildWindowsHiddenProcessOptions('/usr/local/bin/codex', 'darwin'),
    ).toEqual({ shell: false, windowsHide: false })
  })
})
