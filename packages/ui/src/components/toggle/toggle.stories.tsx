import type { Meta, StoryObj } from '@storybook/react-vite'
import { Zap } from 'lucide-react'
import { expect, fn, screen } from 'storybook/test'
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
    await expect(fast).toHaveAttribute('data-size', 'md')
    await expect(fast.getBoundingClientRect().height).toBe(32)
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

/**
 * Disabled with a reason (R2): it stays reachable by Tab, a press changes
 * nothing, and its tooltip says why.
 */
export const DisabledWithReason: Story = {
  args: {
    disabledReason: 'Add a second conversation to this crew before connecting.',
    children: 'Connect',
  },
  play: async ({ args, canvas, userEvent }) => {
    const connect = canvas.getByRole('button', { name: 'Connect' })
    await expect(connect).toHaveAttribute('aria-disabled', 'true')
    await expect(connect).toHaveAccessibleDescription(
      'Add a second conversation to this crew before connecting.',
    )
    await userEvent.tab()
    await expect(connect).toHaveFocus()
    await expect(
      await screen.findByRole('tooltip', {}, { timeout: 2000 }),
    ).toHaveTextContent('Add a second conversation')
    await userEvent.keyboard('{Enter}')
    await userEvent.click(connect)
    await expect(connect).toHaveAttribute('aria-pressed', 'false')
    await expect(args.onPressedChange).not.toHaveBeenCalled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
