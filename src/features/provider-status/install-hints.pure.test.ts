import { describe, expect, it } from 'vitest'
import { getProviderInstallHint, normalizePlatform } from './install-hints.pure'

describe('normalizePlatform', () => {
  it('passes through known platforms', () => {
    expect(normalizePlatform('darwin')).toBe('darwin')
    expect(normalizePlatform('win32')).toBe('win32')
    expect(normalizePlatform('linux')).toBe('linux')
  })

  it('collapses unknown values into other', () => {
    expect(normalizePlatform('aix')).toBe('other')
    expect(normalizePlatform('')).toBe('other')
  })
})

describe('getProviderInstallHint', () => {
  it('returns null for unknown provider ids', () => {
    expect(getProviderInstallHint('unknown', 'darwin')).toBeNull()
  })

  it('returns claude-code hint with docs url for all platforms', () => {
    const darwin = getProviderInstallHint('claude-code', 'darwin')
    const win32 = getProviderInstallHint('claude-code', 'win32')
    expect(darwin?.commands).toEqual([
      'npm install -g @anthropic-ai/claude-code',
    ])
    expect(win32?.commands).toEqual([
      'npm install -g @anthropic-ai/claude-code',
    ])
    expect(darwin?.platformNote).toBeNull()
    expect(win32?.platformNote).toContain('Windows')
  })

  it('returns codex hint with Windows-specific note on win32', () => {
    const hint = getProviderInstallHint('codex', 'win32')
    expect(hint?.commands).toEqual(['npm install -g @openai/codex'])
    expect(hint?.platformNote).toContain('native Windows')
  })

  it('returns pi hint with login step', () => {
    const hint = getProviderInstallHint('pi', 'darwin')
    expect(hint?.commands).toContain('pi /login')
    expect(hint?.docsUrl).toContain('mariozechner')
  })
})
