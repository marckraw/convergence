import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { FC } from 'react'
import {
  readAppliedColorMode,
  useCanvasColorMode,
} from './use-canvas-color-mode'

const Probe: FC = () => <span data-testid="mode">{useCanvasColorMode()}</span>

function setDark(dark: boolean) {
  act(() => {
    document.documentElement.classList.toggle('dark', dark)
  })
}

/** MutationObserver delivers in a microtask; let it land before asserting. */
async function settle() {
  await act(async () => {
    await Promise.resolve()
  })
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
})

describe('readAppliedColorMode', () => {
  it('reads the class the app actually applied', () => {
    document.documentElement.classList.add('dark')
    expect(readAppliedColorMode()).toBe('dark')

    document.documentElement.classList.remove('dark')
    expect(readAppliedColorMode()).toBe('light')
  })
})

describe('useCanvasColorMode', () => {
  it('starts in whatever mode the room is already wearing', () => {
    document.documentElement.classList.add('dark')
    render(<Probe />)

    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
  })

  it('starts light when the room is light', () => {
    render(<Probe />)

    expect(screen.getByTestId('mode')).toHaveTextContent('light')
  })

  /**
   * The point of the ticket: the canvas was stuck in the library's light
   * default. Following the toggle live is the fix, and this is what proves it.
   */
  it('follows the toggle without a remount', async () => {
    document.documentElement.classList.add('dark')
    render(<Probe />)
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')

    setDark(false)
    await settle()
    expect(screen.getByTestId('mode')).toHaveTextContent('light')

    setDark(true)
    await settle()
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
  })

  it('ignores class changes that did not touch the theme', async () => {
    document.documentElement.classList.add('dark')
    render(<Probe />)

    act(() => {
      document.documentElement.classList.add('some-unrelated-class')
    })
    await settle()

    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
    document.documentElement.classList.remove('some-unrelated-class')
  })

  it('stops watching once unmounted', async () => {
    const { unmount } = render(<Probe />)
    unmount()

    // Nothing to assert on screen; this fails loudly if the observer kept a
    // handle on an unmounted tree and React warned about setting state.
    setDark(true)
    await settle()
    expect(document.querySelector('[data-testid="mode"]')).toBeNull()
  })
})
