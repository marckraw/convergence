import type { Meta, StoryObj } from '@storybook/react-vite'
import { GitMerge, Library } from 'lucide-react'
import { expect } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { TONES } from '#lib/tone.styles'
import { Badge } from './badge'

/** Every tone in every shape, as rows of a list would show them. */
function BadgeSheet() {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-canvas p-4">
      {(['pill', 'label', 'count'] as const).map((shape) => (
        <div key={shape} className="flex flex-wrap items-center gap-2">
          {TONES.map((tone) => (
            <Badge key={tone} tone={tone} shape={shape}>
              {shape === 'count' ? '12' : tone}
            </Badge>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Badge hue="merged" icon={<GitMerge />}>
          Merged
        </Badge>
        <Badge hue="tag-cyan">Planning</Badge>
        <Badge hue="tag-violet" icon={<Library />}>
          Project
        </Badge>
        <Badge hue="crew-amber">Night shift</Badge>
        <Badge hue="provider-anthropic" shape="label">
          Claude Code
        </Badge>
      </div>
    </div>
  )
}

const meta = {
  title: 'Components/Badge',
  component: BadgeSheet,
} satisfies Meta<typeof BadgeSheet>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Every tone and shape, each one 20 px tall so a row of them lines up. The
 * neutral pill is the app's most copied chip; the neutral count is the
 * composer's count.
 */
export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    const badges = [
      ...canvasElement.querySelectorAll<HTMLElement>('[data-slot="badge"]'),
    ]
    await expect(badges.length).toBe(20)
    for (const badge of badges) {
      await expect(badge.getBoundingClientRect().height).toBe(20)
    }
    const danger = canvas
      .getAllByText('danger')[0]
      .closest('[data-slot="badge"]')
    await expect(getComputedStyle(danger as Element).color).toBe(
      tokenColor('--danger-ink'),
    )
    const merged = canvas.getByText('Merged').closest('[data-slot="badge"]')
    await expect(getComputedStyle(merged as Element).color).toBe(
      tokenColor('--merged-ink'),
    )
    // The glyph is decoration: the word says it.
    await expect(
      merged?.querySelector('svg')?.closest('[aria-hidden="true"]'),
    ).not.toBeNull()
  },
}

/** Dark: every tone keeps its contrast (axe checks each word). */
export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    const success = canvas
      .getAllByText('success')[0]
      .closest('[data-slot="badge"]')
    await expect(getComputedStyle(success as Element).color).toBe(
      tokenColor('--success-ink'),
    )
  },
}

/** Long: the word is cut short inside its room; the badge never widens its row. */
export const Long: Story = {
  render: () => (
    <div className="flex w-48 items-center gap-2 rounded-md bg-canvas p-2 text-sm text-ink">
      <span className="shrink-0">Skill</span>
      <Badge tone="info">
        Imported from a project nobody remembers the name of
      </Badge>
    </div>
  ),
  play: async ({ canvas }) => {
    const words = canvas.getByText(/Imported from/)
    await expect(getComputedStyle(words).textOverflow).toBe('ellipsis')
    await expect(words.scrollWidth).toBeGreaterThan(words.clientWidth)
    const badge = words.closest('[data-slot="badge"]') as HTMLElement
    const row = badge.parentElement as HTMLElement
    await expect(badge.getBoundingClientRect().right).toBeLessThanOrEqual(
      row.getBoundingClientRect().right,
    )
  },
}
