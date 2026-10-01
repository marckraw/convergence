import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { ThemedToasterContainer } from './themed-toaster.container'

vi.mock('sonner', () => ({
  Toaster: ({ theme }: { theme?: string }) => (
    <div data-testid="toaster" data-toaster-theme={theme} />
  ),
}))

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-theme')
})

describe('ThemedToasterContainer (audit DS-8)', () => {
  it('draws toasts in the theme on screen, not sonner’s light default', () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    render(<ThemedToasterContainer />)
    // Mutation: drop `theme={theme}` -> the attribute is missing, red.
    expect(screen.getByTestId('toaster')).toHaveAttribute(
      'data-toaster-theme',
      'dark',
    )
  })

  it('follows a theme change while it is open', async () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    render(<ThemedToasterContainer />)
    document.documentElement.setAttribute('data-theme', 'light')
    await waitFor(() =>
      expect(screen.getByTestId('toaster')).toHaveAttribute(
        'data-toaster-theme',
        'light',
      ),
    )
  })
})
