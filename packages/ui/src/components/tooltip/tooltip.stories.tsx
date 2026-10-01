import type { Meta, StoryObj } from '@storybook/react-vite'
import { Settings } from 'lucide-react'
import { expect, screen, waitFor } from 'storybook/test'
import { settled } from '../../../.storybook/motion-testing'
import { Button } from '../button/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip'

type SettingsHintProps = {
  /** What the tooltip says. */
  hint: string
}

/** The sidebar's settings button and its hint. */
function SettingsHint({ hint }: SettingsHintProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Settings">
            <Settings aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-64">
          {hint}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const meta = {
  title: 'Primitives/Tooltip',
  component: SettingsHint,
  args: { hint: 'Settings (⌘,)' },
} satisfies Meta<typeof SettingsHint>

export default meta

type Story = StoryObj<typeof meta>

/** Pointing at the trigger shows the hint; moving away hides it. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Settings' })
    await userEvent.hover(trigger)
    const tooltip = await screen.findByRole('tooltip')
    await expect(tooltip).toHaveTextContent(args.hint)
    await settled(tooltip.parentElement as HTMLElement)
    await userEvent.unhover(trigger)
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  },
}

/** The keyboard shows it too: focus the trigger and the hint appears. */
export const KeyboardFocus: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: 'Settings' })).toHaveFocus()
    const tooltip = await screen.findByRole('tooltip')
    await expect(tooltip).toHaveTextContent(args.hint)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  },
}

/** Long: a long hint wraps inside the tooltip's width. */
export const Long: Story = {
  args: {
    hint: 'Settings: providers, accounts, connectors, notifications, the dispatch board and everything else that belongs to this device rather than to a project.',
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.hover(canvas.getByRole('button', { name: 'Settings' }))
    await screen.findByRole('tooltip')
    const surface = document.querySelector<HTMLElement>(
      '[data-radix-popper-content-wrapper] > *',
    )
    await expect(surface).not.toBeNull()
    await settled(surface as HTMLElement)
    await expect(surface!.getBoundingClientRect().width).toBeLessThanOrEqual(
      256,
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Reduced motion: the hint arrives without its pop or slide. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.hover(canvas.getByRole('button', { name: 'Settings' }))
    await screen.findByRole('tooltip')
    const surface = document.querySelector<HTMLElement>(
      '[data-radix-popper-content-wrapper] > *',
    )
    await expect(surface).not.toBeNull()
    await expect(getComputedStyle(surface as HTMLElement).animationName).toBe(
      'none',
    )
  },
}
