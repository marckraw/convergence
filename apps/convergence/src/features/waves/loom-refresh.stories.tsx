import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { LoomRefreshView } from './loom-refresh.presentational'

const meta = {
  title: 'Features/Waves/LoomRefresh',
  component: LoomRefreshView,
  args: { label: 'read 2m ago', blocked: false, onRefresh: fn() },
} satisfies Meta<typeof LoomRefreshView>

export default meta

type Story = StoryObj<typeof meta>

/** Refresh and when the tracker was last read; the answer is the age resetting. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('read 2m ago')).toBeVisible()
    const refresh = canvas.getByRole('button', { name: 'Refresh' })
    await userEvent.click(refresh)
    await expect(args.onRefresh).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Enter}')
    await expect(args.onRefresh).toHaveBeenCalledTimes(2)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Backing off a rate limit: Refresh says when it reads again and does nothing now. */
export const Disabled: Story = {
  args: { blocked: true, label: 'rate-limited · reads again in 40s' },
  play: async ({ args, canvas, userEvent }) => {
    const refresh = canvas.getByRole('button', { name: 'Refresh' })
    await expect(refresh).toBeDisabled()
    await userEvent.tab()
    await expect(refresh).not.toHaveFocus()
    await expect(args.onRefresh).not.toHaveBeenCalled()
  },
}
