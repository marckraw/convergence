import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { DebugLoggingFields } from './debug-logging-fields.presentational'

const meta = {
  title: 'Features/AppSettings/DebugLoggingFields',
  component: DebugLoggingFields,
  args: {
    prefs: { enabled: false },
    isSaving: false,
    onToggleEnabled: fn(),
    onOpenLogFolder: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-140">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DebugLoggingFields>

export default meta

type Story = StoryObj<typeof meta>

/** A switch to capture logs, and a button to the folder they land in. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const capture = canvas.getByRole('switch', {
      name: 'Capture provider debug logs',
    })
    await expect(capture).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(capture)
    await expect(args.onToggleEnabled).toHaveBeenCalledWith(true)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Open log folder' }),
    )
    await expect(args.onOpenLogFolder).toHaveBeenCalledOnce()
  },
}

/** Capturing. */
export const Enabled: Story = {
  args: { prefs: { enabled: true } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('switch', { name: 'Capture provider debug logs' }),
    ).toHaveAttribute('aria-checked', 'true')
  },
}

/** Busy: saving locks both controls. */
export const Busy: Story = {
  args: { isSaving: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('switch', { name: 'Capture provider debug logs' }),
    ).toBeDisabled()
    await expect(
      canvas.getByRole('button', { name: 'Open log folder' }),
    ).toBeDisabled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
