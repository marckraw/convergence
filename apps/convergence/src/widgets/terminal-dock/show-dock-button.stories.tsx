import type { Meta, StoryObj } from '@storybook/react-vite'
import { TooltipProvider } from '@convergence/ui'
import { expect, fn, screen } from 'storybook/test'
import { ShowDockButton } from './show-dock-button.presentational'

const meta = {
  title: 'Widgets/Terminal dock/Show dock button',
  component: ShowDockButton,
  args: {
    terminals: 2,
    shortcut: '⌘`',
    onShow: fn(),
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      // It sits at the end of the window's status bar, in the bar's 11 px.
      <TooltipProvider>
        <div className="flex h-40 flex-col justify-end bg-canvas">
          <div className="flex h-7 items-center justify-end border-t border-hairline px-3 text-2xs text-ink-muted">
            <Story />
          </div>
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof ShowDockButton>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A terminal glyph and how many terminals the hidden dock holds, named
 * "Show terminal", its tooltip saying the key that does the same (⌘`). A
 * press brings the dock back.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const show = canvas.getByRole('button', { name: 'Show terminal' })
    await expect(show).toHaveTextContent('2')
    await expect(show).toHaveAttribute('data-tooltip-shortcut', '⌘`')
    await expect(show).toHaveAccessibleDescription('2 terminals open')
    await userEvent.click(show)
    await expect(args.onShow).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Its tooltip: the name, the key, and what the hidden dock holds. */
export const Hovered: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.hover(canvas.getByRole('button', { name: 'Show terminal' }))
    const tooltip = await screen.findByRole('tooltip')
    await expect(tooltip).toHaveTextContent('Show terminal')
    await expect(tooltip).toHaveTextContent('⌘`')
    await expect(tooltip).toHaveTextContent('2 terminals open')
  },
}

/** One terminal: the count says so in the singular. */
export const One: Story = {
  args: { terminals: 1 },
  play: async ({ canvas }) => {
    const show = canvas.getByRole('button', { name: 'Show terminal' })
    await expect(show).toHaveTextContent('1')
    await expect(show).toHaveAccessibleDescription('1 terminal open')
  },
}
