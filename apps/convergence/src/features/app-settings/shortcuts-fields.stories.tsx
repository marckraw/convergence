import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { TooltipProvider } from '@convergence/ui'
import { ShortcutsFields } from './shortcuts-fields.presentational'

const meta = {
  title: 'Features/AppSettings/ShortcutsFields',
  component: ShortcutsFields,
  args: {
    commandCenterShortcut: { key: 'p', shiftKey: true, altKey: false },
    commandCenterLabel: '⌘⇧P',
    conflictError: null,
    isRecording: false,
    isSaving: false,
    onStartRecord: fn(),
    onRestoreDefault: fn(),
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="w-[560px]">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof ShortcutsFields>

export default meta

type Story = StoryObj<typeof meta>

/** The current shortcut, Record shortcut, and Restore default. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('⌘⇧P')).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Record shortcut' }),
    )
    await expect(args.onStartRecord).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Restore default' }),
    )
    await expect(args.onRestoreDefault).toHaveBeenCalledOnce()
  },
}

/** On the default already: there is nothing to restore. */
export const DefaultShortcut: Story = {
  name: 'On the default',
  args: {
    commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false },
    commandCenterLabel: '⌘K',
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Restore default' }),
    ).toBeDisabled()
  },
}

/** Busy, recording: the field asks for keys and both buttons wait. */
export const Busy: Story = {
  args: { isRecording: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Press a shortcut…')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Listening…' }),
    ).toBeDisabled()
  },
}

/** Failed: the shortcut is taken, and the alert says by what. */
export const Failed: Story = {
  args: {
    conflictError: '⌘F is already used by Sidebar search.',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'already used by Sidebar search',
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
