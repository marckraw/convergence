import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, waitFor } from 'storybook/test'
import {
  settled,
  snapshotWhileAnimating,
} from '../../../.storybook/motion-testing'
import { Button } from '../button/button'
import { Tooltip, type TooltipSide } from './tooltip'

type HintsProps = {
  /** What the first control's tooltip says. */
  label: string
}

const SIDES: TooltipSide[] = ['top', 'right', 'bottom', 'left']

/** A row of text buttons, one tooltip on each side, and a clamped name. */
function Hints({ label }: HintsProps) {
  return (
    <div className="flex flex-col items-center gap-6 p-16">
      <div className="flex items-center gap-2">
        {SIDES.map((side, index) => (
          <Tooltip
            key={side}
            label={index === 0 ? label : `Opens ${side}`}
            side={side}
          >
            <Button variant="secondary">{`Show ${side}`}</Button>
          </Tooltip>
        ))}
      </div>
      <Tooltip
        label="feature/a-branch-name-long-enough-to-be-cut-short"
        when="truncated"
      >
        <p
          tabIndex={0}
          className="w-40 truncate rounded-sm text-sm text-ink-muted"
        >
          feature/a-branch-name-long-enough-to-be-cut-short
        </p>
      </Tooltip>
    </div>
  )
}

const meta = {
  title: 'Primitives/Tooltip',
  component: Hints,
  args: { label: 'Opens above' },
} satisfies Meta<typeof Hints>

export default meta

type Story = StoryObj<typeof meta>

const bubble = () => screen.findByRole('tooltip', {}, { timeout: 2000 })

/**
 * Hovering waits a moment, then the tooltip grows from its control on the
 * side asked for. The next one opens at once. Escape puts it away, and so
 * does pressing the control. It is never a native `title`.
 */
export const Default: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    await expect(canvasElement.querySelector('[title]')).toBeNull()
    const top = canvas.getByRole('button', { name: 'Show top' })
    await userEvent.hover(top)
    const tooltip = await bubble()
    await expect(tooltip).toHaveTextContent(args.label)
    const anchor = top.getBoundingClientRect()
    await waitFor(() =>
      expect(tooltip.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        anchor.top,
      ),
    )
    for (const side of ['right', 'bottom', 'left'] as const) {
      await userEvent.hover(
        canvas.getByRole('button', { name: `Show ${side}` }),
      )
      await waitFor(() =>
        expect(screen.getByRole('tooltip')).toHaveTextContent(`Opens ${side}`),
      )
      await expect(screen.getByRole('tooltip')).toHaveAttribute(
        'data-instant',
        'delay',
      )
    }
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())

    const left = canvas.getByRole('button', { name: 'Show left' })
    await userEvent.unhover(left)
    await userEvent.hover(top)
    await bubble()
    await userEvent.click(top)
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  },
}

/** Keyboard focus shows it at once, with no animation. */
export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ args, userEvent }) => {
    await userEvent.tab()
    const tooltip = await bubble()
    await expect(tooltip).toHaveTextContent(args.label)
    await expect(tooltip).toHaveAttribute('data-instant', 'focus')
    await settled(tooltip)
  },
}

/** Long: a long hint wraps inside the tooltip's width (20rem). */
export const Long: Story = {
  args: {
    label:
      'Opens above: providers, accounts, connectors, notifications and everything else that belongs to this device rather than to a project.',
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.hover(canvas.getByRole('button', { name: 'Show top' }))
    const tooltip = await bubble()
    await settled(tooltip)
    await expect(tooltip.getBoundingClientRect().width).toBeLessThanOrEqual(320)
    await expect(tooltip.getBoundingClientRect().height).toBeGreaterThan(30)
  },
}

/**
 * Disabled: a control that is unavailable stays focusable (aria-disabled),
 * so the keyboard reaches it and its tooltip says why (R2).
 */
export const Disabled: Story = {
  render: () => (
    <Button variant="secondary" disabledReason="Open a project first">
      New conversation
    </Button>
  ),
  play: async ({ userEvent }) => {
    await userEvent.tab()
    const tooltip = await bubble()
    await expect(tooltip).toHaveTextContent('Open a project first')
  },
}

/** Truncated: a name cut short shows in full, and only while it is cut. */
export const Truncated: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.hover(
      canvas.getByText('feature/a-branch-name-long-enough-to-be-cut-short'),
    )
    const tooltip = await bubble()
    await expect(tooltip).toHaveTextContent(
      'feature/a-branch-name-long-enough-to-be-cut-short',
    )
  },
}

const CLAMPED_TITLE =
  'Loom: read an issue in place, with its whole description, its comments and the horses that touched it'

/**
 * Clamped: a title cut at two lines is cut short too, so its whole text is
 * one hover away (MC N2), as a Loom issue card's title is.
 */
export const Clamped: Story = {
  render: () => (
    <div className="p-16">
      <Tooltip label={CLAMPED_TITLE} when="truncated">
        <p tabIndex={0} className="line-clamp-2 w-48 rounded-sm text-sm">
          {CLAMPED_TITLE}
        </p>
      </Tooltip>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const title = canvas.getByText(CLAMPED_TITLE)
    await expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth)
    await expect(title.scrollHeight).toBeGreaterThan(title.clientHeight)
    await userEvent.hover(title)
    const tooltip = await bubble()
    await expect(tooltip).toHaveTextContent(CLAMPED_TITLE)
  },
}

/** Reduced motion: the tooltip fades in; it doesn't grow or travel. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.hover(canvas.getByRole('button', { name: 'Show top' }))
    const tooltip = await bubble()
    const opening = await snapshotWhileAnimating(tooltip, 'opacity')
    await expect(opening.opacity).toBeLessThan(1)
    await expect(opening.scale).toBe(1)
    await expect(opening.shiftY).toBe(0)
    await settled(tooltip)
  },
}
