import type { Meta, StoryObj } from '@storybook/react-vite'
import { Plus, Trash2 } from 'lucide-react'
import { expect, fn } from 'storybook/test'
import { Button } from './button'

const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: {
    children: 'Send',
    onClick: fn(),
  },
} satisfies Meta<typeof Button>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Send' })
    await expect(button).toBeVisible()
    await userEvent.click(button)
    await expect(args.onClick).toHaveBeenCalledOnce()
    // The keyboard reaches it and Enter presses it, as a native button does.
    await userEvent.tab()
    await userEvent.tab({ shift: true })
    await expect(button).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onClick).toHaveBeenCalledTimes(2)
  },
}

/** Every variant the app uses: the main action, the quieter ones, and delete. */
export const Variants: Story = {
  render: (args) => (
    <div className="flex max-w-xl flex-wrap items-center gap-2">
      <Button {...args} variant="default">
        Send
      </Button>
      <Button {...args} variant="secondary">
        Cancel
      </Button>
      <Button {...args} variant="outline">
        Open project
      </Button>
      <Button {...args} variant="ghost">
        Mark as read
      </Button>
      <Button {...args} variant="link">
        Reload
      </Button>
      <Button {...args} variant="destructive">
        <Trash2 aria-hidden />
        Delete
      </Button>
    </div>
  ),
  play: async ({ canvas }) => {
    for (const name of [
      'Send',
      'Cancel',
      'Open project',
      'Mark as read',
      'Reload',
      'Delete',
    ]) {
      await expect(canvas.getByRole('button', { name })).toBeVisible()
    }
  },
}

/** Every size: sm, the default, lg, and the square icon button. */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="default">
        Default
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
      <Button {...args} size="icon" aria-label="New conversation">
        <Plus aria-hidden />
      </Button>
    </div>
  ),
  play: async ({ canvas }) => {
    const heights = ['Small', 'Default', 'Large'].map(
      (name) =>
        canvas.getByRole('button', { name }).getBoundingClientRect().height,
    )
    // Each size is taller than the one before it.
    await expect(heights[0]).toBeLessThan(heights[1])
    await expect(heights[1]).toBeLessThan(heights[2])
    // The icon-only button is named for what it does, not for its glyph.
    const icon = canvas.getByRole('button', { name: 'New conversation' })
    const box = icon.getBoundingClientRect()
    await expect(box.width).toBe(box.height)
  },
}

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Send' })
    await expect(button).toBeDisabled()
    // Out of the tab order, and the pointer passes through it.
    await userEvent.tab()
    await expect(button).not.toHaveFocus()
    await expect(getComputedStyle(button).pointerEvents).toBe('none')
  },
}

export const Dark: Story = {
  ...Variants,
  globals: { theme: 'dark' },
}
