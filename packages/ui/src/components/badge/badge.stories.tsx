import type { Meta, StoryObj } from '@storybook/react-vite'
import { GitMerge, Library } from 'lucide-react'
import { expect, screen } from 'storybook/test'
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
  play: async ({ canvas, userEvent }) => {
    const words = canvas.getByText(/Imported from/)
    await expect(getComputedStyle(words).textOverflow).toBe('ellipsis')
    await expect(words.scrollWidth).toBeGreaterThan(words.clientWidth)
    const badge = words.closest('[data-slot="badge"]') as HTMLElement
    const row = badge.parentElement as HTMLElement
    await expect(badge.getBoundingClientRect().right).toBeLessThanOrEqual(
      row.getBoundingClientRect().right,
    )
    // Cut short, the whole word is one hover away (R2, MC N5).
    await userEvent.hover(words)
    const tooltip = await screen.findByRole('tooltip', {}, { timeout: 2000 })
    await expect(tooltip).toHaveTextContent(
      'Imported from a project nobody remembers the name of',
    )
  },
}

/**
 * Sizes: 10 px words (`sm`, the default) or 11 px (`md`), among 11 px words
 * such as the composer's strip; both in the same 20 px box, so a row of
 * them still lines up (ruling 10: a size, never a className).
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2 rounded-md bg-canvas p-4 text-2xs text-ink-muted">
      <span>Runs on</span>
      <Badge shape="label" outline size="md">
        kuba-vps
      </Badge>
      <Badge shape="label" outline>
        Local
      </Badge>
    </div>
  ),
  play: async ({ canvas }) => {
    const md = canvas.getByText('kuba-vps').closest('[data-slot="badge"]')!
    const sm = canvas.getByText('Local').closest('[data-slot="badge"]')!
    await expect(md).toHaveAttribute('data-size', 'md')
    await expect(sm).toHaveAttribute('data-size', 'sm')
    await expect(getComputedStyle(md).fontSize).toBe('11px')
    await expect(getComputedStyle(sm).fontSize).toBe('10px')
    for (const badge of [md, sm]) {
      await expect(badge.getBoundingClientRect().height).toBe(20)
    }
  },
}

/**
 * Caps: a kind or a short state in capitals, as lists of skills and servers
 * show them; the same box, 20 px, in the same tones.
 */
export const Caps: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-canvas p-4">
      <Badge caps>Project</Badge>
      <Badge caps tone="success">
        Enabled
      </Badge>
      <Badge caps shape="label" tone="warning">
        Beta
      </Badge>
    </div>
  ),
  play: async ({ canvas }) => {
    const project = canvas.getByText('Project').closest('[data-slot="badge"]')
    await expect(getComputedStyle(project as Element).textTransform).toBe(
      'uppercase',
    )
    await expect((project as HTMLElement).getBoundingClientRect().height).toBe(
      20,
    )
    // The words stay as written: a screen reader reads "Project", not letters.
    await expect(canvas.getByText('Enabled')).toBeVisible()
  },
}

/** A bare span's background, as computed styles say it: no fill at all. */
const noFill = () => {
  const probe = document.createElement('span')
  document.body.append(probe)
  const fill = getComputedStyle(probe).backgroundColor
  probe.remove()
  return fill
}

/**
 * Outline: the tone's edge and ink with no wash, for a label on paper that is
 * already tinted (Loom's cards), shown here on the muted surface.
 */
export const Outline: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-muted p-4">
      {TONES.map((tone) => (
        <Badge key={tone} tone={tone} outline>
          {tone}
        </Badge>
      ))}
      <Badge outline shape="label">
        modified
      </Badge>
    </div>
  ),
  play: async ({ canvas }) => {
    const neutral = canvas
      .getByText('neutral')
      .closest('[data-slot="badge"]') as HTMLElement
    await expect(neutral).toHaveAttribute('data-outline')
    // No wash: the paper under it shows through, as under a bare span.
    await expect(getComputedStyle(neutral).backgroundColor).toBe(noFill())
    await expect(getComputedStyle(neutral).color).toBe(
      tokenColor('--neutral-ink'),
    )
    const danger = canvas
      .getByText('danger')
      .closest('[data-slot="badge"]') as HTMLElement
    await expect(getComputedStyle(danger).color).toBe(
      tokenColor('--danger-ink'),
    )
  },
}

export const OutlineDark: Story = {
  ...Outline,
  globals: { theme: 'dark' },
}
