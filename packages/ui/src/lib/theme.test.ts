import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DARK_SCHEME_QUERY,
  applyTheme,
  readAppliedTheme,
  resolveTheme,
} from './theme'

function stubSystem(dark: boolean) {
  const matchMedia = vi.fn((query: string) => ({
    matches: query === DARK_SCHEME_QUERY && dark,
  }))
  vi.stubGlobal('matchMedia', matchMedia)
  return matchMedia
}

afterEach(() => {
  delete document.documentElement.dataset.theme
  vi.unstubAllGlobals()
})

describe('resolveTheme', () => {
  it('keeps an explicit choice whatever the system says', () => {
    stubSystem(true)
    expect(resolveTheme('light')).toBe('light')
    stubSystem(false)
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('resolves System against the system now', () => {
    const matchMedia = stubSystem(true)
    expect(resolveTheme('system')).toBe('dark')
    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
    stubSystem(false)
    expect(resolveTheme('system')).toBe('light')
  })

  it('reads System as light where there is no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(resolveTheme('system')).toBe('light')
  })
})

describe('applyTheme', () => {
  it('writes the resolved theme on <html>, System included', () => {
    stubSystem(true)
    applyTheme('system')
    expect(document.documentElement.dataset.theme).toBe('dark')
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    // Never the old class: nothing reads it any more.
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('can theme a subtree, as the terminal dock is themed', () => {
    const dock = document.createElement('div')
    applyTheme('dark', dock)
    expect(dock.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })
})

describe('readAppliedTheme', () => {
  it('reads data-theme back', () => {
    stubSystem(false)
    document.documentElement.dataset.theme = 'dark'
    expect(readAppliedTheme()).toBe('dark')
    document.documentElement.dataset.theme = 'light'
    stubSystem(true)
    expect(readAppliedTheme()).toBe('light')
  })

  it('follows the system when nothing set data-theme, as the CSS does', () => {
    stubSystem(true)
    expect(readAppliedTheme()).toBe('dark')
    stubSystem(false)
    expect(readAppliedTheme()).toBe('light')
  })

  it('ignores a value that is not a theme', () => {
    stubSystem(false)
    document.documentElement.dataset.theme = 'sepia'
    expect(readAppliedTheme()).toBe('light')
  })
})
