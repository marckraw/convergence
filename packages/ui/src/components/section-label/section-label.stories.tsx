import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { SectionLabel } from './section-label'

type LabelledGroupProps = { label: string }

/** A label over a panel's group, as the side panels draw one. */
function LabelledGroup({ label }: LabelledGroupProps) {
  return (
    <section className="flex w-72 flex-col gap-1.5 rounded-md bg-canvas p-4">
      <SectionLabel as="h3">{label}</SectionLabel>
      <p className="text-sm text-ink">ui/ds3d-display · 3 commits ahead</p>
    </section>
  )
}

const meta = {
  title: 'Components/SectionLabel',
  component: LabelledGroup,
  args: { label: 'Branch' },
} satisfies Meta<typeof LabelledGroup>

export default meta

type Story = StoryObj<typeof meta>

/** 11 px, medium, uppercase, a little tracking, muted; a heading when asked. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const label = canvas.getByRole('heading', { level: 3, name: 'Branch' })
    const style = getComputedStyle(label)
    await expect(style.fontSize).toBe('11px')
    await expect(style.fontWeight).toBe('500')
    await expect(style.textTransform).toBe('uppercase')
    await expect(style.letterSpacing).not.toBe('normal')
    await expect(style.color).toBe(tokenColor('--ink-muted'))
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
}

/** Long: the label wraps under itself rather than running out of its column. */
export const Long: Story = {
  args: { label: 'Every repository this conversation has touched so far' },
  play: async ({ canvas }) => {
    const label = canvas.getByRole('heading', { level: 3 })
    await expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth)
  },
}

/**
 * Small: the 10 px step, for a dense panel's eyebrow (Loom's sections, Mission
 * Control's inspector); the same print, one step down.
 */
export const Small: Story = {
  render: () => (
    <section className="flex w-72 flex-col gap-1.5 rounded-md bg-canvas p-4">
      <SectionLabel as="h3" size="sm">
        Seat
      </SectionLabel>
      <p className="text-sm text-ink">Night shift · 2 open</p>
    </section>
  ),
  play: async ({ canvas }) => {
    const label = canvas.getByRole('heading', { level: 3, name: 'Seat' })
    const style = getComputedStyle(label)
    await expect(style.fontSize).toBe('10px')
    await expect(style.fontWeight).toBe('500')
    await expect(style.textTransform).toBe('uppercase')
    await expect(style.color).toBe(tokenColor('--ink-muted'))
  },
}

export const SmallDark: Story = {
  ...Small,
  globals: { theme: 'dark' },
}

/**
 * Nested: a label under another takes the rank below it, not a second size
 * at the same rank (MC-13). Crew settings: "Seats" is an h4, its groups h5
 * at 10 px, and a seat's own sections h6 at 10 px.
 */
export const Nested: Story = {
  render: () => (
    <section className="flex w-72 flex-col gap-1.5 rounded-md bg-canvas p-4">
      <SectionLabel as="h4">Seats</SectionLabel>
      <SectionLabel as="h5" size="sm">
        Horses 2
      </SectionLabel>
      <SectionLabel as="h6" size="sm">
        Policy
      </SectionLabel>
      <p className="text-sm text-ink">One spawn at a time</p>
    </section>
  ),
  play: async ({ canvas }) => {
    const sizeOf = (level: number) =>
      getComputedStyle(canvas.getByRole('heading', { level })).fontSize
    await expect(sizeOf(4)).toBe('11px')
    await expect(sizeOf(5)).toBe('10px')
    await expect(sizeOf(6)).toBe('10px')
  },
}
