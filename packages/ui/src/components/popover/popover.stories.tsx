import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, waitFor, within } from 'storybook/test'
import { settled } from '../../../.storybook/motion-testing'
import { Button } from '../button/button'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

type UsagePopoverProps = {
  /** The lines the popover lists. */
  lines: string[]
}

/** The context-usage details behind a status-bar button. */
function UsagePopover({ lines }: UsagePopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary">Context 42%</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" aria-label="Context usage">
        <h2 className="mb-2 text-sm font-semibold">Context usage</h2>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <Button className="mt-3" variant="secondary" size="sm">
          Compact now
        </Button>
      </PopoverContent>
    </Popover>
  )
}

const meta = {
  title: 'Primitives/Popover',
  component: UsagePopover,
  args: {
    lines: ['84k of 200k tokens', 'System prompt: 12k', 'Conversation: 72k'],
  },
} satisfies Meta<typeof UsagePopover>

export default meta

type Story = StoryObj<typeof meta>

/** Opens from its trigger with focus inside, and Escape gives focus back. */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Context 42%' })
    await userEvent.click(trigger)
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const popover = await screen.findByRole('dialog', { name: 'Context usage' })
    await settled(popover)
    await expect(popover).toBeVisible()
    await expect(
      within(popover).getByRole('button', { name: 'Compact now' }),
    ).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await expect(trigger).toHaveFocus()
  },
}

/** Long: more lines than fit grow the popover, which stays on screen. */
export const Long: Story = {
  args: {
    lines: Array.from(
      { length: 18 },
      (_, index) => `Tool result ${index + 1}: 3.2k tokens`,
    ),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Context 42%' }))
    const popover = await screen.findByRole('dialog', { name: 'Context usage' })
    await settled(popover)
    const box = popover.getBoundingClientRect()
    await expect(box.top).toBeGreaterThanOrEqual(0)
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
