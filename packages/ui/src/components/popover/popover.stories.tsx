import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef } from 'react'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import {
  arrived,
  snapshotWhileAnimating,
} from '../../../.storybook/motion-testing'
import { Button } from '../button/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from './popover'

type UsagePopoverProps = {
  /** The lines the popover lists. */
  lines: string[]
  onCompact: () => void
  /** Focus the Compact button when it opens, not the first control. */
  focusCompact?: boolean
}

/** The context-usage details behind a composer pill. */
function UsagePopover({ lines, onCompact, focusCompact }: UsagePopoverProps) {
  const compactRef = useRef<HTMLButtonElement>(null)
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="secondary" />}>
        Context 42%
      </PopoverTrigger>
      <PopoverContent
        className="flex max-h-(--available-height) w-72 flex-col gap-3 overflow-y-auto"
        initialFocus={focusCompact ? compactRef : undefined}
      >
        <PopoverHeader>
          <PopoverTitle>Context usage</PopoverTitle>
          <PopoverDescription>
            What fills the context window.
          </PopoverDescription>
        </PopoverHeader>
        <ul className="flex flex-col gap-1 text-sm text-ink-muted">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm">
            Details
          </Button>
          <Button ref={compactRef} size="sm" onClick={onCompact}>
            Compact now
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const popoverClosed = () =>
  waitFor(() =>
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull(),
  )

const meta = {
  title: 'Primitives/Popover',
  component: UsagePopover,
  args: {
    lines: ['84k of 200k tokens', 'System prompt: 12k', 'Conversation: 72k'],
    onCompact: fn(),
  },
} satisfies Meta<typeof UsagePopover>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Opens from its trigger, named by its title, with focus on its first
 * control; Escape closes it and gives focus back to the trigger.
 */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Context 42%' })
    await userEvent.click(trigger)
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const popover = await screen.findByRole('dialog', { name: 'Context usage' })
    await expect(popover).toHaveAccessibleDescription(
      'What fills the context window.',
    )
    // It grows from the trigger, travelling in from its side.
    const opening = await snapshotWhileAnimating(popover, 'opacity')
    await expect(opening.scale).toBeLessThan(1)
    await arrived(popover)
    await waitFor(() =>
      expect(
        within(popover).getByRole('button', { name: 'Details' }),
      ).toHaveFocus(),
    )
    await userEvent.keyboard('{Escape}')
    await popoverClosed()
    await expect(trigger).toHaveFocus()
  },
}

/** A press outside closes it; what was pressed keeps the click. */
export const OutsideClick: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Context 42%' })
    await userEvent.click(trigger)
    const popover = await screen.findByRole('dialog', { name: 'Context usage' })
    await arrived(popover)
    await userEvent.click(document.body)
    await popoverClosed()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  },
}

/** `initialFocus` puts the focus where the popover asks for it. */
export const InitialFocus: Story = {
  args: { focusCompact: true },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Context 42%' }))
    const popover = await screen.findByRole('dialog', { name: 'Context usage' })
    const compact = within(popover).getByRole('button', { name: 'Compact now' })
    await waitFor(() => expect(compact).toHaveFocus())
    await userEvent.keyboard('{Enter}')
    await expect(args.onCompact).toHaveBeenCalledOnce()
    await arrived(popover)
  },
}

/** Long: more lines than fit scroll inside the popover, which stays on screen. */
export const Long: Story = {
  args: {
    lines: Array.from(
      { length: 60 },
      (_, index) => `Tool result ${index + 1}: 3.2k tokens`,
    ),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Context 42%' }))
    const popover = await screen.findByRole('dialog', { name: 'Context usage' })
    await arrived(popover)
    const box = popover.getBoundingClientRect()
    await expect(box.top).toBeGreaterThanOrEqual(0)
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
    await expect(popover.scrollHeight).toBeGreaterThan(popover.clientHeight)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Reduced motion: it fades in where it stands, without the grow or the travel. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Context 42%' }))
    const popover = await screen.findByRole('dialog', { name: 'Context usage' })
    const opening = await snapshotWhileAnimating(popover, 'opacity')
    await expect(opening.opacity).toBeLessThan(1)
    await expect(opening.scale).toBe(1)
    await expect(opening.shiftY).toBe(0)
    await arrived(popover)
  },
}
