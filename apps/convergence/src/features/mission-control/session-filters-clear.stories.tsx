import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { SessionFiltersClear } from './session-filters-clear.presentational'

const meta = {
  title: 'Features/MissionControl/SessionFiltersClear',
  component: SessionFiltersClear,
  args: { onClear: fn() },
} satisfies Meta<typeof SessionFiltersClear>

export default meta

type Story = StoryObj<typeof meta>

/** The filter row's one Clear: every chip and picker at once (MC-7). */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Clear filters' }))
    await expect(args.onClear).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
