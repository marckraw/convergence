import { describe, expect, it } from 'vitest'
import { getBinaryExtension, needsShellForSpawn } from './shell-exec.pure'

describe('getBinaryExtension', () => {
  it('returns lowercase extension including the dot', () => {
    expect(getBinaryExtension('C:\\Program Files\\Git\\cmd\\git.EXE')).toBe(
      '.exe',
    )
    expect(getBinaryExtension('/usr/local/bin/claude')).toBe('')
    expect(getBinaryExtension('C:\\Users\\foo\\AppData\\npm\\claude.cmd')).toBe(
      '.cmd',
    )
  })

  it('ignores leading dots on dotfiles', () => {
    expect(getBinaryExtension('/home/u/.profile')).toBe('')
  })
})

describe('needsShellForSpawn', () => {
  it('returns false on non-Windows platforms regardless of extension', () => {
    expect(needsShellForSpawn('/usr/local/bin/claude.cmd', 'darwin')).toBe(
      false,
    )
    expect(needsShellForSpawn('/usr/local/bin/claude.bat', 'linux')).toBe(false)
  })

  it('returns true on win32 for .cmd, .bat, and .ps1', () => {
    expect(needsShellForSpawn('C:\\Users\\npm\\claude.cmd', 'win32')).toBe(true)
    expect(needsShellForSpawn('C:\\Tools\\codex.bat', 'win32')).toBe(true)
    expect(needsShellForSpawn('C:\\Tools\\thing.ps1', 'win32')).toBe(true)
  })

  it('returns false on win32 for .exe and extensionless binaries', () => {
    expect(
      needsShellForSpawn('C:\\Program Files\\git\\bin\\git.exe', 'win32'),
    ).toBe(false)
    expect(needsShellForSpawn('C:\\Tools\\claude', 'win32')).toBe(false)
  })
})
