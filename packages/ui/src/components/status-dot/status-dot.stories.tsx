import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { TONES } from '#lib/tone.styles'
import { StatusDot } from './status-dot'

/** Every tone, each beside the word it stands for, in each size. */
function DotSheet() {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-canvas p-3 text-xs text-ink">
      {TONES.map((tone) => (
        <p key={tone} className="flex items-center gap-2">
          <StatusDot tone={tone} size="sm" />
          <StatusDot tone={tone} size="md" />
          <StatusDot tone={tone} size="lg" />
          {tone}
        </p>
      ))}
      <p className="flex items-center gap-2">
        <StatusDot tone="info" pulse label="Working" />
        <span aria-hidden>Working (labelled dot)</span>
      </p>
    </div>
  )
}

const dots = (canvasElement: HTMLElement) => [
  ...canvasElement.querySelectorAll<HTMLElement>('[data-slot="status-dot"]'),
]

const meta = {
  title: 'Components/StatusDot',
  component: DotSheet,
} satisfies Meta<typeof DotSheet>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Today's three sizes, 6, 8 and 10 px, in each tone's solid colour. A
 * labelled dot says its state to a screen reader; the rest are decoration
 * beside their word.
 */
export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    const all = dots(canvasElement)
    await expect(
      all.slice(0, 3).map((dot) => dot.getBoundingClientRect().width),
    ).toEqual([6, 8, 10])
    const danger = all.find(
      (dot) => dot.dataset.tone === 'danger',
    ) as HTMLElement
    await expect(getComputedStyle(danger).backgroundColor).toBe(
      tokenColor('--danger-solid'),
    )
    for (const dot of all) {
      await expect(dot).toHaveAttribute('aria-hidden', 'true')
    }
    await expect(
      canvas.getByText('Working', { selector: '.sr-only' }),
    ).toBeInTheDocument()
    const pulsing = all.find((dot) => dot.dataset.pulse === '') as HTMLElement
    await expect(getComputedStyle(pulsing).animationName).toBe('pulse')
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => {
    const success = dots(canvasElement).find(
      (dot) => dot.dataset.tone === 'success',
    ) as HTMLElement
    await expect(getComputedStyle(success).backgroundColor).toBe(
      tokenColor('--success-solid'),
    )
  },
}

/** Reduced motion: the pulse stands still; the colour still says the state. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const pulsing = dots(canvasElement).find(
      (dot) => dot.dataset.pulse === '',
    ) as HTMLElement
    await expect(getComputedStyle(pulsing).animationName).toBe('none')
  },
}

/**
 * Hollow: the tone's solid as an empty ring, the same size as a filled dot,
 * for what should be there and isn't (a seat with no card).
 */
export const Hollow: Story = {
  render: () => (
    <div className="flex flex-col gap-2 rounded-md bg-canvas p-3 text-xs text-ink">
      <p className="flex items-center gap-2">
        <StatusDot tone="neutral" />
        Has a card
      </p>
      <p className="flex items-center gap-2">
        <StatusDot tone="warning" hollow />
        No card
      </p>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [filled, hollow] = dots(canvasElement)
    await expect(hollow).toHaveAttribute('data-hollow')
    await expect(hollow.getBoundingClientRect().width).toBe(
      filled.getBoundingClientRect().width,
    )
    await expect(getComputedStyle(hollow).borderTopColor).toBe(
      tokenColor('--warning-solid'),
    )
    await expect(getComputedStyle(hollow).backgroundColor).not.toBe(
      getComputedStyle(filled).backgroundColor,
    )
  },
}

export const HollowDark: Story = {
  ...Hollow,
  globals: { theme: 'dark' },
}
