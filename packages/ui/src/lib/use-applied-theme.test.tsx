import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FC } from 'react'
import { useAppliedTheme } from './use-applied-theme'

const Probe: FC = () => <span data-testid="theme">{useAppliedTheme()}</span>

const root = document.documentElement

function setTheme(theme: 'light' | 'dark' | null) {
  act(() => {
    if (theme === null) delete root.dataset.theme
    else root.dataset.theme = theme
  })
}

/** MutationObserver delivers in a microtask; let it land before asserting. */
async function settle() {
  await act(async () => {
    await Promise.resolve()
  })
}

afterEach(() => {
  delete root.dataset.theme
  vi.unstubAllGlobals()
})

describe('useAppliedTheme', () => {
  it('starts in whatever theme the page is already wearing', () => {
    root.dataset.theme = 'dark'
    render(<Probe />)
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
  })

  it('starts light when the page is light', () => {
    root.dataset.theme = 'light'
    render(<Probe />)
    expect(screen.getByTestId('theme')).toHaveTextContent('light')
  })

  /**
   * The canvas's old bug, kept fixed through the switch to data-theme: it was
   * stuck in the library's light default. Following the toggle live, without
   * a remount, is what proves it.
   */
  it('follows data-theme without a remount', async () => {
    root.dataset.theme = 'dark'
    render(<Probe />)

    setTheme('light')
    await settle()
    expect(screen.getByTestId('theme')).toHaveTextContent('light')

    setTheme('dark')
    await settle()
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
  })

  it('ignores attribute changes that did not touch the theme', async () => {
    root.dataset.theme = 'dark'
    render(<Probe />)

    act(() => {
      root.classList.add('dark-unrelated')
      root.dataset.motion = 'reduced'
    })
    await settle()

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    root.classList.remove('dark-unrelated')
    delete root.dataset.motion
  })

  it('follows the system while nothing sets data-theme', async () => {
    const listeners = new Set<() => void>()
    const media = {
      matches: false,
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media),
    )
    const view = render(<Probe />)
    expect(screen.getByTestId('theme')).toHaveTextContent('light')

    act(() => {
      media.matches = true
      for (const listener of listeners) listener()
    })
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')

    // The attribute wins over the system once it is written.
    setTheme('light')
    await settle()
    expect(screen.getByTestId('theme')).toHaveTextContent('light')

    view.unmount()
    expect(listeners.size).toBe(0)
  })

  it('stops watching once unmounted', async () => {
    const { unmount } = render(<Probe />)
    unmount()

    // Nothing to assert on screen; this fails loudly if the observer kept a
    // handle on an unmounted tree and React warned about setting state.
    setTheme('dark')
    await settle()
    expect(document.querySelector('[data-testid="theme"]')).toBeNull()
  })
})
