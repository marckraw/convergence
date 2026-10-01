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
