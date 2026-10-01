import type { Meta, StoryObj } from '@storybook/react-vite'
import { Zap } from 'lucide-react'
import { expect, fn } from 'storybook/test'
import { Toggle } from './toggle'

const meta = {
  title: 'Primitives/Toggle',
  component: Toggle,
  args: {
    children: (
      <>
        <Zap aria-hidden />
        Fast
      </>
    ),
    onPressedChange: fn(),
  },
} satisfies Meta<typeof Toggle>

export default meta

type Story = StoryObj<typeof meta>

/**
 * It says "pressed", not "switch". A click or Enter flips it; pressed, it is
 * the raised chip (R7); the keyboard's ring really draws.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const fast = canvas.getByRole('button', { name: 'Fast' })
    await expect(fast).toHaveAttribute('aria-pressed', 'false')
    await expect(getComputedStyle(fast).boxShadow).toBe('none')
    await userEvent.click(fast)
    await expect(fast).toHaveAttribute('aria-pressed', 'true')
    await expect(getComputedStyle(fast).boxShadow).not.toBe('none')
    await expect(args.onPressedChange).toHaveBeenLastCalledWith(
      true,
      expect.anything(),
    )
    await userEvent.tab()
    await userEvent.tab({ shift: true })
    await expect(fast).toHaveFocus()
    await expect(getComputedStyle(fast).outlineStyle).toBe('solid')
    await userEvent.keyboard('{Enter}')
    await expect(fast).toHaveAttribute('aria-pressed', 'false')
    await expect(fast).toHaveAttribute('data-size', 'sm')
    await expect(fast.getBoundingClientRect().height).toBe(28)
  },
}

/** Chip: a filter, rounded with an edge, as Mission Control's are. */
export const Chip: Story = {
  args: { variant: 'chip', children: 'Needs you', defaultPressed: true },
  play: async ({ canvas, userEvent }) => {
    const chip = canvas.getByRole('button', { name: 'Needs you' })
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(chip)
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
  },
}

export const Disabled: Story = {
  args: { disabled: true, defaultPressed: true },
  play: async ({ args, canvas, userEvent }) => {
    const fast = canvas.getByRole('button', { name: 'Fast' })
    await expect(fast).toBeDisabled()
    await expect(fast).toHaveAttribute('aria-pressed', 'true')
    await userEvent.tab()
    await expect(fast).not.toHaveFocus()
    await expect(args.onPressedChange).not.toHaveBeenCalled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
