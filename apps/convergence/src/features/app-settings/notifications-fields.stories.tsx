import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { NotificationsFields } from './notifications-fields.presentational'

type Prefs = ComponentProps<typeof NotificationsFields>['prefs']

const prefs: Prefs = {
  enabled: true,
  toasts: true,
  sounds: false,
  system: true,
  dockBadge: true,
  dockBounce: false,
  events: {
    finished: true,
    needsInput: true,
    needsApproval: true,
    errored: true,
    terminalIdle: false,
  },
  suppressWhenFocused: true,
}

const meta = {
  title: 'Features/AppSettings/NotificationsFields',
  component: NotificationsFields,
  args: {
    prefs,
    platform: 'darwin',
    isSaving: false,
    onChange: fn(),
    onTestFire: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NotificationsFields>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A master switch, the channels (the Dock's two on macOS), the events, and a
 * test notification of each severity.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('switch', { name: 'Sounds' }))
    await expect(args.onChange).toHaveBeenLastCalledWith({
      ...prefs,
      sounds: true,
    })
    await userEvent.click(canvas.getByRole('switch', { name: 'Terminal idle' }))
    await expect(args.onChange).toHaveBeenLastCalledWith({
      ...prefs,
      events: { ...prefs.events, terminalIdle: true },
    })
    await expect(
      canvas.getByRole('switch', { name: 'Dock bounce' }),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Soft' }))
    await expect(args.onTestFire).toHaveBeenCalledWith('info')
    await userEvent.click(canvas.getByRole('button', { name: 'Alert' }))
    await expect(args.onTestFire).toHaveBeenCalledWith('critical')
  },
}

/** Not on macOS: there is no Dock, so no Dock switches. */
export const OtherPlatform: Story = {
  name: 'Other platform',
  args: { platform: 'linux' },
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole('switch', { name: 'Dock badge' }),
    ).toBeNull()
    await expect(
      canvas.queryByRole('switch', { name: 'Dock bounce' }),
    ).toBeNull()
  },
}

/** Disabled: with the master switch off, every channel and event waits. */
export const Disabled: Story = {
  args: { prefs: { ...prefs, enabled: false } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('switch', { name: 'Enable notifications' }),
    ).toBeEnabled()
    await expect(canvas.getByRole('switch', { name: 'Toasts' })).toBeDisabled()
    await expect(
      canvas.getByRole('switch', { name: 'Finished' }),
    ).toBeDisabled()
  },
}

/** Busy: saving holds the test buttons. */
export const Busy: Story = {
  args: { isSaving: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Soft' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Alert' })).toBeDisabled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
