import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, waitFor } from 'storybook/test'
import { settled } from '../../../.storybook/motion-testing'
import { TooltipCard } from './tooltip-card'

type SummaryProps = {
  /** The conversations the card lists. */
  names: string[]
}

/** The status bar's agent count, with the conversations behind it in a card. */
function Summary({ names }: SummaryProps) {
  return (
    <TooltipCard
      side="top"
      content={
        <ul className="space-y-0.5" aria-label="Running conversations">
          {names.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      }
    >
      <span
        tabIndex={0}
        className="rounded-sm px-1 text-xs tabular-nums text-muted-foreground"
      >
        {`${names.length} running`}
      </span>
    </TooltipCard>
  )
}

const meta = {
  title: 'Primitives/TooltipCard',
  component: Summary,
  args: {
    names: ['Tooltip host', 'Button codemod', 'Release notes'],
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Summary>

export default meta

type Story = StoryObj<typeof meta>

/** Pointing at it shows the list; the label tooltip never shows beside it. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.hover(canvas.getByText(`${args.names.length} running`))
    const list = await screen.findByRole(
      'list',
      { name: 'Running conversations' },
      { timeout: 2000 },
    )
    for (const name of args.names) await expect(list).toHaveTextContent(name)
    await settled(list.parentElement as HTMLElement)
  },
}

/** The keyboard opens it too: focus the count and the list appears. */
export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ userEvent }) => {
    await userEvent.tab()
    const list = await screen.findByRole(
      'list',
      { name: 'Running conversations' },
      { timeout: 2000 },
    )
    await settled(list.parentElement as HTMLElement)
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.queryByRole('list', { name: 'Running conversations' }),
      ).toBeNull(),
    )
  },
}

/** Long: many rows stay inside the card's width. */
export const Long: Story = {
  args: {
    names: Array.from(
      { length: 8 },
      (_, index) =>
        `Conversation ${index + 1} about a long-running refactor of the composer`,
    ),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.hover(canvas.getByText('8 running'))
    const list = await screen.findByRole(
      'list',
      { name: 'Running conversations' },
      { timeout: 2000 },
    )
    const card = list.parentElement as HTMLElement
    await settled(card)
    await expect(card.getBoundingClientRect().width).toBeLessThanOrEqual(320)
  },
}
