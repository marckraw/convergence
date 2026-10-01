import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor } from 'storybook/test'
import { runningAnimations } from '../../../.storybook/motion-testing'
import { tokenColor } from '../../../.storybook/color-testing'
import { Switch } from './switch'

const meta = {
  title: 'Primitives/Switch',
  component: Switch,
  args: {
    'aria-label': 'Check for updates automatically',
    onCheckedChange: fn(),
  },
} satisfies Meta<typeof Switch>

export default meta

type Story = StoryObj<typeof meta>

const thumbOf = (toggle: HTMLElement): HTMLElement => {
  const thumb = toggle.querySelector<HTMLElement>('[data-slot="switch-thumb"]')
  if (!thumb) throw new Error('the switch has no thumb')
  return thumb
}

/**
 * A click and Space toggle it; on, the thumb slides across. Off, its edge is
 * the control line; the keyboard's ring really draws.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const toggle = canvas.getByRole('switch', {
      name: 'Check for updates automatically',
    })
    await expect(toggle).not.toBeChecked()
    await expect(getComputedStyle(toggle).borderTopColor).toBe(
      tokenColor('--control-line'),
    )
    const off = thumbOf(toggle).getBoundingClientRect().left
    await userEvent.click(toggle)
    await expect(toggle).toBeChecked()
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(
      true,
      expect.anything(),
    )
    await waitFor(() =>
      expect(thumbOf(toggle).getBoundingClientRect().left).toBe(off + 16),
    )
    await userEvent.tab()
    await userEvent.tab({ shift: true })
    await expect(toggle).toHaveFocus()
    await expect(getComputedStyle(toggle).outlineStyle).toBe('solid')
    await userEvent.keyboard(' ')
    await expect(toggle).not.toBeChecked()
    const box = toggle.getBoundingClientRect()
    await expect(box.width).toBe(36)
    await expect(box.height).toBe(20)
  },
}

/** Disabled: shows how it's set and can't be changed. */
export const Disabled: Story = {
  args: { disabled: true, defaultChecked: true },
  play: async ({ args, canvas, userEvent }) => {
    const toggle = canvas.getByRole('switch', {
      name: 'Check for updates automatically',
    })
    await expect(toggle).toBeDisabled()
    await expect(toggle).toBeChecked()
    await userEvent.tab()
    await expect(toggle).not.toHaveFocus()
    await expect(args.onCheckedChange).not.toHaveBeenCalled()
  },
}

/** Reduced motion: the thumb jumps across, nothing slides. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async ({ canvas, userEvent }) => {
    const toggle = canvas.getByRole('switch', {
      name: 'Check for updates automatically',
    })
    await userEvent.click(toggle)
    await expect(runningAnimations(thumbOf(toggle))).toHaveLength(0)
    await expect(toggle).toBeChecked()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
