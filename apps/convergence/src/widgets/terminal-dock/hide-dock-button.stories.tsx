import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { HideDockButton } from './hide-dock-button.presentational'

const meta = {
  title: 'Widgets/Terminal dock/Hide dock button',
  component: HideDockButton,
  args: {
    placement: 'bottom',
    shortcut: '⌘`',
    onHide: fn(),
  },
  decorators: [
    (Story) => (
      // It sits on the dock's strip, dark in both themes (R12).
      <div
        data-theme="dark"
        className="bg-terminal-strip p-2 text-terminal-ink"
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HideDockButton>

export default meta

type Story = StoryObj<typeof meta>

/**
 * One icon button named "Hide terminal", its tooltip saying the key that
 * does the same (⌘`). A press puts the dock away.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const hide = canvas.getByRole('button', { name: 'Hide terminal' })
    await expect(hide).toHaveAttribute('data-tooltip-shortcut', '⌘`')
    await userEvent.click(hide)
    await expect(args.onHide).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** The glyph folds the dock toward the edge it sits on; the name stays. */
export const Placements: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <HideDockButton {...args} placement="bottom" />
      <HideDockButton {...args} placement="left" />
      <HideDockButton {...args} placement="right" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getAllByRole('button', { name: 'Hide terminal' }),
    ).toHaveLength(3)
  },
}
