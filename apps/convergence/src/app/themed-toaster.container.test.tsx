import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ToasterProps } from '@convergence/ui'
import { FLOATING_CORNER_CLEAR_BOTTOM } from '@/shared/ui/floating-corner.pure'
import { ThemedToasterContainer } from './themed-toaster.container'

// The toasts' look and theme are the design system's, and its Toaster stories
// check them in both themes (Components/Toaster). What the app decides is
// where the stack stands.
vi.mock('@convergence/ui', () => ({
  Toaster: ({ offset }: ToasterProps) => (
    <div data-testid="toaster" data-offset-bottom={offset?.bottom} />
  ),
}))

afterEach(() => {
  cleanup()
})

describe('ThemedToasterContainer (audit DS-8)', () => {
  it('starts the stack clear above the feedback corner (NAV-7)', () => {
    render(<ThemedToasterContainer />)
    // Mutation: drop `offset` -> sonner's 24 px puts toasts over the corner.
    expect(screen.getByTestId('toaster')).toHaveAttribute(
      'data-offset-bottom',
      String(FLOATING_CORNER_CLEAR_BOTTOM),
    )
  })
})
