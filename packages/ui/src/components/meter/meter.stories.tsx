import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { TONES } from '#lib/tone.styles'
import { Meter } from './meter'

type UsageRowProps = { remaining: number }

/** A quota row: the window's name, its bar, what's left. */
function UsageRow({ remaining }: UsageRowProps) {
  return (
    <div className="flex w-72 items-center gap-3 rounded-md bg-canvas p-4 text-xs text-ink">
      <span className="w-16 shrink-0 font-medium">Weekly</span>
      <Meter
        value={remaining}
        label="Weekly limit left"
        valueText={`${remaining}% left`}
        thresholds={{ warning: 25, danger: 10 }}
      />
      <span className="w-10 shrink-0 text-right tabular-nums">
        {remaining}%
      </span>
    </div>
  )
}

const meta = {
  title: 'Components/Meter',
  component: UsageRow,
  args: { remaining: 62 },
} satisfies Meta<typeof UsageRow>

export default meta

type Story = StoryObj<typeof meta>

const indicatorIn = (element: HTMLElement) =>
  element.querySelector('[data-slot="meter-indicator"]') as Element

/**
 * A meter, named and valued for a screen reader; the bar fills to its
 * reading, success until the quota runs low.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    const meter = canvas.getByRole('meter', { name: 'Weekly limit left' })
    await expect(meter).toHaveAttribute('aria-valuenow', '62')
    await expect(meter).toHaveAttribute('aria-valuemin', '0')
    await expect(meter).toHaveAttribute('aria-valuemax', '100')
    await expect(meter).toHaveAttribute('aria-valuetext', '62% left')
    const fill = indicatorIn(meter)
    await expect(getComputedStyle(fill).backgroundColor).toBe(
      tokenColor('--success-solid'),
    )
    const track = fill.parentElement as HTMLElement
    await expect(track.getBoundingClientRect().height).toBe(6)
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
}

/** Tones: past a threshold the bar turns warning, then danger; or a tone is given. */
export const Tones: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-3 rounded-md bg-canvas p-4">
      {TONES.map((tone) => (
        <Meter key={tone} value={60} tone={tone} label={`${tone} reading`} />
      ))}
      <Meter
        value={8}
        label="Nearly out"
        thresholds={{ warning: 25, danger: 10 }}
      />
    </div>
  ),
  play: async ({ canvas }) => {
    const nearlyOut = canvas.getByRole('meter', { name: 'Nearly out' })
    await expect(nearlyOut).toHaveAttribute('data-tone', 'danger')
    await expect(getComputedStyle(indicatorIn(nearlyOut)).backgroundColor).toBe(
      tokenColor('--danger-solid'),
    )
    const warning = canvas.getByRole('meter', { name: 'warning reading' })
    await expect(getComputedStyle(indicatorIn(warning)).backgroundColor).toBe(
      tokenColor('--warning-solid'),
    )
  },
}

/** Ring: the composer's usage ring, a glyph's size, the same meter underneath. */
export const Ring: Story = {
  render: () => (
    <p className="flex items-center gap-2 rounded-md bg-canvas p-4 text-xs text-ink">
      <Meter
        shape="ring"
        value={72}
        label="Context window used"
        thresholds={{ warning: 75, danger: 90 }}
      />
      72% of the context used
    </p>
  ),
  play: async ({ canvas }) => {
    const ring = canvas.getByRole('meter', { name: 'Context window used' })
    await expect(ring).toHaveAttribute('aria-valuenow', '72')
    await expect(ring.getBoundingClientRect().width).toBe(20)
    await expect(getComputedStyle(indicatorIn(ring)).stroke).toBe(
      tokenColor('--success-solid'),
    )
  },
}
