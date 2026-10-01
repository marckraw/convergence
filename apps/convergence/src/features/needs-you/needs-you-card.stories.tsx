import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import {
  cardContext,
  cardFixtures,
  cardSession,
} from './needs-you-card.fixture'
import { NeedsYouCard } from './needs-you-card.presentational'
import { needsYouCardModel } from './needs-you-card.pure'

/**
 * A card as the Needs-you feed builds it. The fixture's context carries its
 * own clock, so "Last moved 5 m ago" never ages.
 */
const cardOf = (
  session: Parameters<typeof needsYouCardModel>[0],
  context: Partial<Parameters<typeof needsYouCardModel>[1]> = {},
) => needsYouCardModel(session, { ...cardContext, ...context })

const meta = {
  title: 'Features/NeedsYou/NeedsYouCard',
  component: NeedsYouCard,
  args: {
    card: cardOf(cardFixtures.open),
    onSelect: fn(),
    onPin: fn(),
    onDismiss: fn(),
    onArchive: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NeedsYouCard>

export default meta

type Story = StoryObj<typeof meta>

/**
 * An errand with an open PR: the card selects the conversation, the PR is its
 * own door, and the menu pins it. Its icons are named, with a tooltip each.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const card = canvas.getByRole('button', { name: 'Horse, Convergence' })
    await userEvent.click(card)
    await expect(args.onSelect).toHaveBeenCalledWith('open')
    const pr = canvas.getByRole('link', { name: /^Pull request #42/ })
    await expect(pr).toHaveAttribute(
      'href',
      'https://github.com/acme/app/pull/42',
    )
    await expect(pr.closest('button')).toBeNull()
    const provider = canvas.getByRole('img', { name: 'OpenAI' })
    await userEvent.hover(provider)
    await expect(await screen.findByRole('tooltip')).toHaveTextContent('OpenAI')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
    await expect(canvas.getByRole('img', { name: 'Errand' })).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Actions for Horse' }),
    )
    const menu = await screen.findByRole('menu')
    // An open PR is not done: the menu offers no Archive.
    await expect(
      within(menu).queryByRole('menuitem', { name: 'Archive' }),
    ).toBeNull()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Pin' }))
    await expect(args.onPin).toHaveBeenCalledWith('open', true)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Waiting on you: the summary says what for, and Snooze puts it aside. */
export const Waiting: Story = {
  args: { card: cardOf(cardFixtures.waiting) },
  play: async ({ args, canvas, userEvent }) => {
    const actions = canvas.getByRole('group', {
      name: 'Review actions for Horse',
    })
    await userEvent.click(
      within(actions).getByRole('button', { name: 'Snooze' }),
    )
    await expect(args.onDismiss).toHaveBeenCalledWith('waiting')
    await expect(args.onSelect).not.toHaveBeenCalled()
  },
}

/** A failed run: Acknowledge and Archive, without opening the menu. */
export const Failed: Story = {
  args: {
    card: cardOf(
      cardSession({ id: 'failed', status: 'failed', attention: 'failed' }),
    ),
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('button', { name: 'Horse, Failed, Convergence' }),
    ).toBeVisible()
    const actions = canvas.getByRole('group', {
      name: 'Review actions for Horse',
    })
    await userEvent.click(
      within(actions).getByRole('button', { name: 'Archive' }),
    )
    await expect(args.onArchive).toHaveBeenCalledWith('failed')
  },
}

export const FailedDark: Story = {
  ...Failed,
  globals: { theme: 'dark' },
}

/** Working: the summary says so; nothing is asked of you yet. */
export const Busy: Story = {
  args: { card: cardOf(cardFixtures.working) },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: /^Horse, Working/ }),
    ).toBeVisible()
    await expect(canvas.queryByRole('group')).toBeNull()
  },
}

/** Pinned, with a long name and the active conversation's mark. */
export const Long: Story = {
  args: {
    active: true,
    card: cardOf(
      cardSession({
        id: 'pinned',
        name: 'Fable — review the Loom sheets against the Design Director’s frames and settle the QA list',
        pinnedAt: '2026-09-12T12:01:00Z',
      }),
    ),
  },
  play: async ({ args, canvas, userEvent }) => {
    const card = canvas.getByRole('button', { name: /^Fable — review/ })
    await expect(card).toHaveAttribute('aria-current', 'true')
    // The pin is drawn inside the card's button, beside the name.
    await expect(canvas.getByLabelText('Pinned')).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: /^Actions for Fable/ }),
    )
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Unpin' }),
    )
    await expect(args.onPin).toHaveBeenCalledWith('pinned', false)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

/** On another machine: the card names the host and how long since it spoke. */
export const Remote: Story = {
  args: { card: cardOf(cardFixtures.remote) },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('img', { name: 'little-monster' }),
    ).toBeVisible()
    await expect(canvas.getByText('host · not recorded')).toBeVisible()
  },
}
