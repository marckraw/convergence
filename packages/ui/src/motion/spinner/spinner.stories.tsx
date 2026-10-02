import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { Spinner } from './spinner'

type WaitingProps = {
  /** What's under way, in words: the spinner beside them says nothing. */
  text: string
}

/** A line that waits, as the app shows one: the spinner, then what it waits for. */
function Waiting({ text }: WaitingProps) {
  return (
    <p className="flex w-72 max-w-full items-center gap-2 rounded-md bg-canvas p-2 text-sm text-ink-muted">
      <Spinner />
      <span className="min-w-0 truncate">{text}</span>
    </p>
  )
}

const spinnerIn = (canvasElement: HTMLElement) =>
  canvasElement.querySelector<SVGElement>('[data-slot="spinner"]') as SVGElement

const meta = {
  title: 'Motion/Spinner',
  component: Waiting,
  args: { text: 'Loading the conversation…' },
} satisfies Meta<typeof Waiting>

export default meta

type Story = StoryObj<typeof meta>

/**
 * One even turn after another, for as long as it's shown, in the text's
 * color. Hidden from screen readers: the words beside it say what's under way.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const spinner = spinnerIn(canvasElement)
    await expect(spinner).toHaveAttribute('aria-hidden', 'true')
    const style = getComputedStyle(spinner)
    await expect(style.animationName).toBe('spin')
    await expect(style.animationTimingFunction).toBe('linear')
    await expect(style.animationIterationCount).toBe('infinite')
    await expect(style.color).toBe(tokenColor('--muted-foreground'))
    const box = spinner.getBoundingClientRect()
    await expect([box.width, box.height]).toEqual([16, 16])
  },
}

/** Every size: 12, 14 and 16 px. */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3 rounded-md bg-canvas p-2 text-ink-muted">
      <Spinner size="xs" />
      <Spinner size="sm" />
      <Spinner size="md" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const widths = [
      ...canvasElement.querySelectorAll<SVGElement>('[data-slot="spinner"]'),
    ].map((spinner) => spinner.getBoundingClientRect().width)
    await expect(widths).toEqual([12, 14, 16])
  },
}

/** Busy: a spinner shown alone, with a label, is a status a screen reader reads. */
export const Busy: Story = {
  render: () => (
    <div className="rounded-md bg-canvas p-2 text-ink-muted">
      <Spinner label="Loading the history…" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Loading the history…',
    )
  },
}

/** Long: the words are cut short, and the spinner keeps its size beside them. */
export const Long: Story = {
  args: {
    text: 'Loading the conversation with the agent that rewrote the whole design system, from the first turn to the newest one',
  },
  play: async ({ canvasElement }) => {
    const box = spinnerIn(canvasElement).getBoundingClientRect()
    await expect([box.width, box.height]).toEqual([16, 16])
  },
}

/** Dark: it takes the text's color, so it follows the theme. */
export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => {
    await expect(getComputedStyle(spinnerIn(canvasElement)).color).toBe(
      tokenColor('--muted-foreground'),
    )
  },
}

/** Reduced motion: it stands still; the open circle still reads as busy. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(getComputedStyle(spinnerIn(canvasElement)).animationName).toBe(
      'none',
    )
  },
}
