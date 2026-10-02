import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { storeTheme } from '@/shared/lib/theme'
import { ThemeToggleButton } from './theme-toggle.container'

type ChangeListener = (event: { matches: boolean }) => void

const DARK_SCHEME = '(prefers-color-scheme: dark)'

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
  const inert = {
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const matchMedia = vi.fn((query: string) =>
    query === DARK_SCHEME ? media : inert,
  )
  vi.stubGlobal('matchMedia', matchMedia)
  return {
    fire(matches: boolean) {
      media.matches = matches
      for (const listener of listeners) listener({ matches })
    },
    queries() {
      return matchMedia.mock.calls.map(([query]) => query)
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

/** What the page wears: data-theme on <html> (MAR-3615; the .dark class before it). */
function darkTheme(): boolean {
  return document.documentElement.dataset.theme === 'dark'
}

describe('ThemeToggleButton system appearance', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  it('on System, a prefers-color-scheme change flips data-theme between dark and light', () => {
    storeTheme('system')
    const media = installMatchMedia(false)
    render(<ThemeToggleButton />)

    // System writes the resolved theme, never no attribute: the CSS and the
    // code that reads data-theme see one truth.
    expect(document.documentElement.dataset.theme).toBe('light')
    const queries = media.queries()
    expect(queries.length).toBeGreaterThan(0)
    // Mutation: a different query → this list includes it, and fire below
    // never reaches that listener, so the page stays light.
    expect(queries.every((query) => query === DARK_SCHEME)).toBe(true)
    media.fire(true)
    // Mutation: no listener → stays light here, red.
    expect(darkTheme()).toBe(true)
    media.fire(false)
    expect(darkTheme()).toBe(false)
  })

  it('on Dark, a prefers-color-scheme change does nothing', () => {
    storeTheme('dark')
    const media = installMatchMedia(true)
    render(<ThemeToggleButton />)

    expect(darkTheme()).toBe(true)
    media.fire(false)
    expect(darkTheme()).toBe(true)
    expect(media.netListeners()).toBe(0)
  })

  it('switching System → Light removes the listener', () => {
    storeTheme('system')
    const media = installMatchMedia(false)
    render(<ThemeToggleButton />)

    expect(media.netListeners()).toBe(1)
    const toggle = () => screen.getByRole('button', { name: 'Change theme' })
    expect(toggle()).toHaveAttribute('aria-description', 'Now: System')
    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-description', 'Now: Dark')
    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-description', 'Now: Light')
    // Mutation: a listener that stays after leaving System → the page turns
    // dark on the next OS change, red.
    media.fire(true)
    expect(darkTheme()).toBe(false)
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
