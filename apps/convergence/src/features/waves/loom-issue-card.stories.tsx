import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { LoomIssueCard } from './loom-issue-card.presentational'

const meta = {
  title: 'Features/Waves/LoomIssueCard',
  component: LoomIssueCard,
  args: {
    identifier: 'MAR-3085',
    title: 'Loom: carry the blocked label through the tracker adapter',
    trackerStatus: 'In Progress',
    labels: ['horse:opus-mac', 'wave:loom-p2'],
    door: { kind: 'open', onOpen: fn() },
    'data-loom-issue': 'MAR-3085',
  },
  decorators: [
    (Story) => (
      <div className="flex w-80 flex-col">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LoomIssueCard>

export default meta

type Story = StoryObj<typeof meta>

const card = (canvasElement: HTMLElement) =>
  canvasElement.querySelector<HTMLElement>('[data-loom-issue]')!

/**
 * An issue in the loop: the identifier and the title, then the tracker's
 * status and labels as chips. The title is the card's door, named with the
 * identifier, and it opens by pointer and by keyboard.
 */
export const Default: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const door = canvas.getByRole('button', {
      name: 'MAR-3085 Loom: carry the blocked label through the tracker adapter',
    })
    await expect(card(canvasElement)).toHaveTextContent(
      'MAR-3085Loom: carry the blocked label through the tracker adapterLinear: In Progresshorse:opus-macwave:loom-p2',
    )
    const onOpen = (args.door as { onOpen: () => void }).onOpen
    await userEvent.click(door)
    await expect(onOpen).toHaveBeenCalledOnce()
    await userEvent.tab({ shift: true })
    await userEvent.tab()
    await expect(door).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(onOpen).toHaveBeenCalledTimes(2)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/**
 * What a row adds: facts between the head and the chips, and its asks after
 * them.
 */
export const WithFacts: Story = {
  args: {
    meta: (
      <span className="truncate text-2xs text-ink-muted">
        opus-mac · working · lap 2
      </span>
    ),
    children: <span className="text-2xs text-warning-ink">blocked</span>,
  },
  play: async ({ canvasElement }) => {
    await expect(card(canvasElement)).toHaveTextContent(
      /adapteropus-mac · working · lap 2Linear: In Progress.*blocked$/,
    )
  },
}

/** Done: a check before the identifier, and the status chip in success. */
export const Done: Story = {
  args: { trackerStatus: 'Done', done: true },
  play: async ({ canvasElement }) => {
    const status = canvasElement.querySelector('[data-loom-chip="status"]')
    await expect(status).toHaveTextContent('Linear: Done')
    await expect(status).toHaveAttribute('data-tone', 'success')
    // The check is drawn, and hidden from assistive tech: the chip says it.
    await expect(
      card(canvasElement).querySelector('svg[aria-hidden="true"]'),
    ).not.toBeNull()
  },
}

export const DoneDark: Story = {
  ...Done,
  globals: { theme: 'dark' },
}

/**
 * An issue outside the loop: the whole card is the link to it in Linear, and
 * a status the tracker never said reads "not seen".
 */
export const Link: Story = {
  args: {
    identifier: 'MAR-3300',
    title: 'Settings: one search across every pane',
    trackerStatus: '',
    labels: ['area › settings'],
    door: { kind: 'link', href: 'https://linear.app/example/issue/mar-3300' },
    'data-loom-issue': 'MAR-3300',
  },
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link')
    await expect(link).toHaveAttribute(
      'href',
      'https://linear.app/example/issue/mar-3300',
    )
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveTextContent(
      'MAR-3300Settings: one search across every paneLinear: not seenarea › settings',
    )
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

/** A card that cannot open has no door, and says it is disabled. */
export const Inert: Story = {
  args: { door: { kind: 'inert' } },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByRole('button')).toBeNull()
    await expect(canvas.queryByRole('link')).toBeNull()
    await expect(card(canvasElement)).toHaveAttribute('aria-disabled', 'true')
  },
}

/** The wave panel's plain list row: no edge, no fill, no chips. */
export const Plain: Story = {
  args: { plain: true, done: true },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('button', { name: /MAR-3085/ })).toBeVisible()
    await expect(canvasElement.querySelector('[data-loom-chip]')).toBeNull()
    await expect(canvasElement.querySelector('svg')).toBeNull()
  },
}

/** A long title is clamped to two lines, and the whole of it is one hover away. */
export const Long: Story = {
  args: {
    identifier: 'MAR-3155',
    title:
      'Loom: the identifier never breaks after its dash, the title takes the rest of the row and wraps onto a second line before it is cut short, whatever the column width',
    'data-loom-issue': 'MAR-3155',
  },
  play: async ({ args, canvas }) => {
    const title = canvas.getByText(args.title)
    await expect(title).toHaveAttribute('data-tooltip', args.title)
    await expect(title).toHaveAttribute('data-tooltip-when', 'truncated')
    await expect(canvas.getByText('MAR-3155')).toBeVisible()
  },
}
