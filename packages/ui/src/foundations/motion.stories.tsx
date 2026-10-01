import type { Meta, StoryObj } from '@storybook/react-vite'
import { Loader2 } from 'lucide-react'
import { expect } from 'storybook/test'
import { tokenOn } from '../../.storybook/motion-testing'
import { durationsMs, easings } from '../motion/tokens'

/**
 * Motion: every duration and easing the app animates with, from the
 * TypeScript mirror of tokens.css (its test keeps the two equal), and what
 * reduced motion does to them. Durations stay, so fades keep their timing;
 * travel and scale go to nothing, and a loop stands still.
 */
function Motion() {
  return (
    <div className="grid w-[36rem] gap-6 bg-canvas p-6 text-ink">
      <section aria-label="Durations">
        <h2 className="mb-2 text-sm font-semibold">Durations</h2>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          {Object.entries(durationsMs).map(([name, ms]) => (
            <li key={name} className="flex justify-between font-mono">
              <span>{name}</span>
              <span className="text-ink-muted">{ms} ms</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Easings">
        <h2 className="mb-2 text-sm font-semibold">Easings</h2>
        <ul className="grid gap-1 text-xs">
          {Object.entries(easings).map(([name, curve]) => (
            <li key={name} className="flex justify-between font-mono">
              <span>{name}</span>
              <span className="text-ink-muted">
                cubic-bezier({curve.join(', ')})
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section
        aria-label="In motion"
        className="flex items-center gap-6 text-xs"
      >
        <span
          data-arrival
          className="animate-slide-in-bottom rounded-md bg-surface-muted px-3 py-2"
        >
          A popup arriving
        </span>
        <span className="flex items-center gap-2">
          <Loader2 data-spinner aria-hidden className="h-4 w-4 animate-spin" />
          Working
        </span>
      </section>
    </div>
  )
}

const meta = {
  title: 'Foundations/Motion',
  component: Motion,
} satisfies Meta<typeof Motion>

export default meta

type Story = StoryObj<typeof meta>

/** Full motion: 8 px of travel, a 95% pop, a spinner that turns. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const root = document.documentElement
    await expect(tokenOn(root, '--motion-fast')).toBe('150ms')
    await expect(tokenOn(root, '--motion-shift')).toBe('8px')
    await expect(tokenOn(root, '--motion-scale-from')).toBe('0.95')
    const spinner = canvasElement.querySelector('[data-spinner]')!
    await expect(getComputedStyle(spinner).animationIterationCount).toBe(
      'infinite',
    )
  },
}

/**
 * Reduced motion, as data-motion="reduced" on <html> sets it: the same
 * durations, no travel, no scale, and the spinner stands still.
 */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const root = document.documentElement
    await expect(tokenOn(root, '--motion-fast')).toBe('150ms')
    await expect(tokenOn(root, '--motion-shift')).toBe('0px')
    await expect(tokenOn(root, '--motion-scale-from')).toBe('1')
    const spinner = canvasElement.querySelector('[data-spinner]')!
    await expect(getComputedStyle(spinner).animationIterationCount).toBe('0')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
