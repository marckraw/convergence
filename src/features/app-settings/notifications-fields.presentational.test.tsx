import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_NOTIFICATION_PREFS } from '@/entities/notifications'
import { NotificationsFields } from './notifications-fields.presentational'

function makeProps(
  overrides: Partial<Parameters<typeof NotificationsFields>[0]> = {},
) {
  return {
    prefs: DEFAULT_NOTIFICATION_PREFS,
    platform: 'darwin',
    isSaving: false,
    onChange: vi.fn(),
    onTestFire: vi.fn(),
    ...overrides,
  }
}

describe('NotificationsFields', () => {
  it('renders the master, channel, event, and suppress toggles', () => {
    render(<NotificationsFields {...makeProps()} />)

    expect(
      screen.getByRole('switch', { name: 'Enable notifications' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Toasts' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Sounds' })).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'System notifications' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Dock badge' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Dock bounce' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Finished' })).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Needs input' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Needs approval' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Errored' })).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Suppress when window is focused' }),
    ).toBeInTheDocument()
  })

  it('hides macOS-only toggles when platform is win32', () => {
    render(<NotificationsFields {...makeProps({ platform: 'win32' })} />)

    expect(
      screen.queryByRole('switch', { name: 'Dock badge' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('switch', { name: 'Dock bounce' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Toasts' })).toBeInTheDocument()
  })

  it('toggling a channel calls onChange with the merged prefs', () => {
    const onChange = vi.fn()
    render(<NotificationsFields {...makeProps({ onChange })} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Toasts' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ toasts: false, sounds: true }),
    )
  })

  it('toggling an event flips only that event flag', () => {
    const onChange = vi.fn()
    render(<NotificationsFields {...makeProps({ onChange })} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Errored' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        events: expect.objectContaining({
          finished: true,
          needsInput: true,
          needsApproval: true,
          errored: false,
        }),
      }),
    )
  })

  it('disables non-master switches when notifications are off', () => {
    render(
      <NotificationsFields
        {...makeProps({
          prefs: { ...DEFAULT_NOTIFICATION_PREFS, enabled: false },
        })}
      />,
    )

    expect(
      screen.getByRole('switch', { name: 'Enable notifications' }),
    ).not.toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Toasts' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Errored' })).toBeDisabled()
  })

  it('test-fire buttons dispatch the chosen severity', () => {
    const onTestFire = vi.fn()
    render(<NotificationsFields {...makeProps({ onTestFire })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Soft' }))
    fireEvent.click(screen.getByRole('button', { name: 'Alert' }))

    expect(onTestFire).toHaveBeenNthCalledWith(1, 'info')
    expect(onTestFire).toHaveBeenNthCalledWith(2, 'critical')
  })
})
