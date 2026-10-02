import type { Meta, StoryObj } from '@storybook/react-vite'
import { Cloud, TriangleAlert } from 'lucide-react'
import { expect, fn } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { Spinner } from '../../motion/spinner/spinner'
import { StatusDot } from '../status-dot/status-dot'
import { StatusPill, StatusPillButton } from './status-pill'

/** A conversation header's status row: one pill per tone. */
function StatusRow() {
  return (
    <div className="flex w-160 max-w-full flex-wrap items-center gap-1.5 rounded-md bg-canvas p-3">
      <StatusPill>Edited 2 files</StatusPill>
      <StatusPill tone="info" leading={<Cloud className="size-3" />}>
        Remote
      </StatusPill>
      <StatusPill tone="success" leading={<StatusDot tone="success" />}>
        Finished
      </StatusPill>
      <StatusPill tone="warning" leading={<TriangleAlert className="size-3" />}>
        Worktree removed
      </StatusPill>
      <StatusPill tone="danger">Failed</StatusPill>
    </div>
  )
}

const meta = {
  title: 'Components/StatusPill',
  component: StatusRow,
} satisfies Meta<typeof StatusRow>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Every tone: the tone's line and ink, and its tint where the tone says
 * something. Neutral, like the header's activity chip, has no wash.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    const pill = (text: string) =>
      canvas.getByText(text).closest('[data-slot="status-pill"]') as Element
    await expect(getComputedStyle(pill('Failed')).color).toBe(
      tokenColor('--danger-ink'),
    )
    await expect(getComputedStyle(pill('Remote')).borderTopColor).toBe(
      tokenColor('--info-line'),
    )
    await expect(getComputedStyle(pill('Edited 2 files')).backgroundColor).toBe(
      'rgba(0, 0, 0, 0)',
    )
    await expect(getComputedStyle(pill('Failed')).fontSize).toBe('11px')
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    const pill = canvas
      .getByText('Worktree removed')
      .closest('[data-slot="status-pill"]') as Element
    await expect(getComputedStyle(pill).color).toBe(tokenColor('--warning-ink'))
  },
}

/** Busy: a Spinner leads the words, which say what is under way. */
export const Busy: Story = {
  render: () => (
    <div className="rounded-md bg-canvas p-3">
      <StatusPill tone="info" leading={<Spinner size="xs" />}>
        Working
      </StatusPill>
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText('Working')).toBeVisible()
    const spinner = canvasElement.querySelector('[data-slot="spinner"]')
    await expect(spinner).toHaveAttribute('aria-hidden', 'true')
  },
}

/** Long: the words are cut short and the leading glyph keeps its size. */
export const Long: Story = {
  render: () => (
    <div className="w-56 rounded-md bg-canvas p-3">
      <StatusPill tone="warning" leading={<TriangleAlert className="size-3" />}>
        The worktree for this conversation was removed from the disk outside
        Convergence
      </StatusPill>
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    const words = canvas.getByText(/The worktree/)
    await expect(getComputedStyle(words).textOverflow).toBe('ellipsis')
    await expect(words.scrollWidth).toBeGreaterThan(words.clientWidth)
    const glyph = canvasElement.querySelector('svg') as SVGElement
    await expect(glyph.getBoundingClientRect().width).toBe(12)
  },
}

const onPress = fn()

/**
 * Pressable: a state that opens what it is about (Parallel work's "2 running",
 * a harness alert). The same box and print as the plain pill beside it, so
 * the row is one height, with a focus ring and a target that reaches 4 px
 * further than it looks.
 */
export const Pressable: Story = {
  render: () => (
    <div className="flex items-center gap-1.5 rounded-md bg-canvas p-3">
      <StatusPill>Edited 2 files</StatusPill>
      <StatusPillButton tone="info" aria-expanded={false} onClick={onPress}>
        2 running
      </StatusPillButton>
      <StatusPillButton tone="danger">Harness: rate limited</StatusPillButton>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const pressable = canvas.getByRole('button', { name: '2 running' })
    const plain = canvas
      .getByText('Edited 2 files')
      .closest('[data-slot="status-pill"]') as Element
    await expect(pressable.getBoundingClientRect().height).toBe(
      plain.getBoundingClientRect().height,
    )
    await expect(getComputedStyle(pressable).color).toBe(
      tokenColor('--info-ink'),
    )
    await userEvent.tab()
    await expect(pressable).toHaveFocus()
    await expect(getComputedStyle(pressable).outlineStyle).not.toBe('none')
    await userEvent.keyboard('{Enter}')
    await expect(onPress).toHaveBeenCalled()
  },
}

export const PressableDark: Story = {
  ...Pressable,
  name: 'Pressable, dark',
  globals: { theme: 'dark' },
}
