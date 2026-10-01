import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { SessionBadge } from './session-badge.presentational'

/**
 * Each attention the record can hold, as the glyph shows it. The app draws
 * this glyph only through the session entity's SessionStateBadge, which
 * answers `compacting` from the record; it is drawn bare here to show the
 * shared part on its own.
 */
const ATTENTIONS = [
  ['needs-approval', 'Needs approval'],
  ['needs-input', 'Needs input'],
  ['finished', 'Finished'],
  ['failed', 'Failed'],
  ['none', 'Working'],
] as const

function AllAttentions() {
  return (
    <ul
      aria-label="Attentions"
      className="space-y-1.5 rounded-md bg-canvas p-3 text-xs text-ink"
    >
      {ATTENTIONS.map(([attention, words]) => (
        <li key={attention} className="flex items-center gap-2">
          <SessionBadge attention={attention} status="running" />
          {words}
        </li>
      ))}
    </ul>
  )
}

const meta = {
  title: 'Components/Shared/Session badge',
  component: SessionBadge,
  args: { attention: 'finished', status: 'completed' },
} satisfies Meta<typeof SessionBadge>

export default meta

type Story = StoryObj<typeof meta>

/** Finished: the success tone's check, decoration beside the row's words. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const glyph = canvasElement.querySelector('[data-tone="success"]')
    await expect(glyph).toBeVisible()
    await expect(glyph).toHaveAttribute('aria-hidden', 'true')
  },
}

/**
 * Every attention in its tone (R1): waiting on you is warning, for an answer
 * as for an approval; finished is success, failed is danger; work under way
 * spins.
 */
export const States: Story = {
  render: () => <AllAttentions />,
  play: async ({ canvas }) => {
    const tones = canvas
      .getAllByRole('listitem')
      .map((item) =>
        item.querySelector('[data-tone]')?.getAttribute('data-tone'),
      )
    await expect(tones).toEqual([
      'warning',
      'warning',
      'success',
      'danger',
      undefined,
    ])
    const working = canvas.getAllByRole('listitem').at(-1)!
    await expect(
      working.querySelector('[data-slot="spinner"]'),
    ).toBeInTheDocument()
  },
}

export const Dark: Story = {
  ...States,
  globals: { theme: 'dark' },
}

/** Compacting is busy, never the finished check, and says so to a screen reader. */
export const Busy: Story = {
  args: { compacting: true },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Compacting context…',
    )
    await expect(canvasElement.querySelector('[data-tone]')).toBeNull()
  },
}

/** Under reduced motion the spinner stands still; it still reads as busy. */
export const ReducedMotion: Story = {
  args: { compacting: true },
  globals: { motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const spinner = canvasElement.querySelector('[data-slot="spinner"]')!
    await expect(getComputedStyle(spinner).animationName).toBe('none')
  },
}
