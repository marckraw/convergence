import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { CodexUsageRing } from './codex-usage-ring.presentational'

/*
 * The ring is decoration beside the pill's own label: hidden from assistive
 * tech, so its stories check that it stays hidden and draws its share.
 */

const meta = {
  title: 'Features/Composer/CodexUsageRing',
  component: CodexUsageRing,
  args: { value: 64, tone: 'green', isLoading: false },
} satisfies Meta<typeof CodexUsageRing>

export default meta

type Story = StoryObj<typeof meta>

const arc = (root: HTMLElement) => root.querySelectorAll('circle')[1]

/** Most of the quota left. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
    )
    await expect(arc(canvasElement)).toHaveAttribute(
      'stroke-dasharray',
      '64 36',
    )
  },
}

/** Running low. */
export const Amber: Story = {
  args: { value: 18, tone: 'amber' },
}

/** Nearly gone. */
export const Failed: Story = {
  args: { value: 3, tone: 'red' },
}

/** Asking: the arc pulses. */
export const Busy: Story = {
  args: { value: null, tone: 'muted', isLoading: true },
  play: async ({ canvasElement }) => {
    await expect(arc(canvasElement)).toHaveAttribute(
      'stroke-dasharray',
      '0 100',
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

export const ReducedMotion: Story = {
  ...Busy,
  globals: { motion: 'reduced' },
}
