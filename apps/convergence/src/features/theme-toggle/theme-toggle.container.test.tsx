import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { storeTheme } from '@/shared/lib/theme'
import { ThemeToggleButton } from './theme-toggle.container'

type ChangeListener = (event: { matches: boolean }) => void

function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<ChangeListener>()
  const media = {
    matches: initialMatches,
    addEventListener: vi.fn((type: string, listener: ChangeListener) => {
      if (type === 'change') listeners.add(listener)
    }),
    removeEventListener: vi.fn((type: string, listener: ChangeListener) => {
      if (type === 'change') listeners.delete(listener)
    }),
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  )
  return {
    fire(matches: boolean) {
      media.matches = matches
      for (const listener of listeners) listener({ matches })
    },
    netListeners() {
      return (
        media.addEventListener.mock.calls.filter(([type]) => type === 'change')
          .length -
        media.removeEventListener.mock.calls.filter(
          ([type]) => type === 'change',
        ).length
      )
    },
    addCalls() {
      return media.addEventListener.mock.calls.filter(
        ([type]) => type === 'change',
      ).length
    },
  }
}

function darkClass(): boolean {
  return document.documentElement.classList.contains('dark')
}

describe('ThemeToggleButton system appearance', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('on System, a prefers-color-scheme change adds and removes the dark class', () => {
    storeTheme('system')
    const media = installMatchMedia(false)
    render(<ThemeToggleButton />)

    expect(darkClass()).toBe(false)
    media.fire(true)
    // Mutation: no listener → stays light here, red.
    expect(darkClass()).toBe(true)
    media.fire(false)
    expect(darkClass()).toBe(false)
  })

  it('on Dark, a prefers-color-scheme change does nothing', () => {
    storeTheme('dark')
    const media = installMatchMedia(true)
    render(<ThemeToggleButton />)

    expect(darkClass()).toBe(true)
    media.fire(false)
    expect(darkClass()).toBe(true)
    expect(media.netListeners()).toBe(0)
  })

  it('switching System → Light removes the listener', () => {
    storeTheme('system')
    const media = installMatchMedia(false)
    render(<ThemeToggleButton />)

    expect(media.netListeners()).toBe(1)
    fireEvent.click(screen.getByTitle('Theme: system'))
    fireEvent.click(screen.getByTitle('Theme: dark'))
    expect(screen.getByTitle('Theme: light')).toBeTruthy()
    // Mutation: a listener that stays after leaving System → dark class
    // appears on the next OS change, red.
    media.fire(true)
    expect(darkClass()).toBe(false)
    expect(media.netListeners()).toBe(0)
  })

  it('re-rendering on System keeps a single listener', () => {
    storeTheme('system')
    const media = installMatchMedia(false)
    const view = render(<ThemeToggleButton />)
    view.rerender(<ThemeToggleButton />)
    view.rerender(<ThemeToggleButton />)
    view.rerender(<ThemeToggleButton />)

    expect(media.addCalls()).toBe(1)
    expect(media.netListeners()).toBe(1)
  })
})
