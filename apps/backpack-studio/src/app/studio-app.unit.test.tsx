import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudioApp } from './studio-app.container'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Studio onboarding (MAR-2853)', () => {
  it('keeps the exact sign-in copy and advances through the delayed mock seam', async () => {
    // Mutations: remove a frame string, change filled variant, skip the delay, or drop onSignedIn.
    vi.useFakeTimers()
    render(<StudioApp />)
    for (const text of [
      'Your work starts here.',
      'Sign in with your EF work account. Your assistant and GCS tools will be ready.',
      'Sign-in opens securely in your browser.',
      'Return here when it finishes.',
      'Need access? Contact your GCS team.',
    ])
      expect(screen.getByText(text)).toBeTruthy()
    const button = screen.getByRole('button', {
      name: 'Continue with Microsoft',
    })
    expect(button.classList.contains('ef-button-filled')).toBe(true)
    fireEvent.click(button)
    expect(button.getAttribute('disabled')).not.toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(screen.queryByText('Welcome, Marcin.')).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    for (const text of [
      'Welcome, Marcin.',
      '● Connected to backpack.automations',
      'What would be useful today?',
      'Create and design',
      'Turn a brief or a Figma frame into a first draft.',
      'Investigate and build',
      'Find a problem, explore a fix, review the work.',
      'Plan and organize',
      'Make sense of tickets, priorities and decisions.',
      'These are starting points. You can ask for anything GCS tools support.',
    ])
      expect(screen.getByText(text)).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'Skip and start a conversation' })
        .classList.contains('ef-button-filled'),
    ).toBe(true)
    fireEvent.click(
      screen.getByRole('button', { name: 'Skip and start a conversation' }),
    )
    expect(
      screen.getByRole('heading', { name: 'What would you like to get done?' }),
    ).toBeTruthy()
  })
  it('opens Hello with the developer chord and toggles the shared captured connection', async () => {
    // Mutations: remove the chord listener, remove the toggle refresh, or let Hello read its own connected fixture.
    vi.useFakeTimers()
    render(<StudioApp />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with Microsoft' }),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true, shiftKey: true })
    expect(screen.getByText('The captured daemon shook hands.')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Simulate an unreachable daemon' }),
    )
    expect(screen.getByText('The captured daemon did not answer.')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true, shiftKey: true })
    expect(
      screen.getByText('○ Not connected to backpack.automations'),
    ).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Skip and start a conversation' }),
    )
    expect(screen.getByText('○ Not connected')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true, shiftKey: true })
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Simulate an unreachable daemon' }),
    )
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true, shiftKey: true })
    expect(screen.getByText('● Connected')).toBeTruthy()
  })
})
