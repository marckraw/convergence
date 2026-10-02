import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { LoomCollapseButton } from './loom-collapse-button.presentational'

const meta = {
  title: 'Features/Waves/LoomCollapseButton',
  component: LoomCollapseButton,
  args: { onCollapse: fn() },
} satisfies Meta<typeof LoomCollapseButton>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The control at the end of both of Loom's headers: icon-only, named
 * "Collapse Loom", and the name is its tooltip. It answers the pointer and the
 * keyboard alike.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const collapse = canvas.getByRole('button', { name: 'Collapse Loom' })
    await expect(collapse).toHaveAttribute('data-tooltip', 'Collapse Loom')
    // Under the button, off the header row it sits in.
    await expect(collapse).toHaveAttribute('data-tooltip-side', 'bottom')
    await userEvent.click(collapse)
    await expect(args.onCollapse).toHaveBeenCalledOnce()
    await userEvent.tab({ shift: true })
    await userEvent.tab()
    await expect(collapse).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onCollapse).toHaveBeenCalledTimes(2)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
