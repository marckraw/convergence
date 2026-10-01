import type { Meta, StoryObj } from '@storybook/react-vite'
import { MoreHorizontal } from 'lucide-react'
import { expect, fn, screen } from 'storybook/test'
import { Button } from '@convergence/ui'
import {
  cardContext,
  cardFixtures,
  cardSession,
} from './needs-you-card.fixture'
import { needsYouCardModel } from './needs-you-card.pure'
import { SessionActivityCard } from './session-activity-card.presentational'

/** The fixture's context carries its own clock, so the card never ages. */
const cardOf = (session: Parameters<typeof needsYouCardModel>[0]) =>
  needsYouCardModel(session, cardContext)

const meta = {
  title: 'Features/NeedsYou/SessionActivityCard',
  component: SessionActivityCard,
  args: {
    card: cardOf(cardFixtures.pinned),
    compact: true,
    actions: (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Actions for Horse"
      >
        <MoreHorizontal aria-hidden className="size-4" />
      </Button>
    ),
    onSelect: fn(),
    onRename: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SessionActivityCard>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The compact card the project tree draws: name, state, model and the
 * provider, host and kind as named icons. A double click renames.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const card = canvas.getByRole('button', { name: 'Horse, Convergence' })
    await userEvent.click(card)
    await expect(args.onSelect).toHaveBeenCalledWith('pinned')
    await userEvent.dblClick(card)
    await expect(args.onRename).toHaveBeenCalledOnce()
    // The pin is drawn inside the card's button, beside the name.
    await expect(canvas.getByLabelText('Pinned')).toBeVisible()
    // The keyboard walks from the card to its named icons: provider, host.
    await expect(card).toHaveFocus()
    const host = canvas.getByRole('img', { name: 'laptop' })
    await userEvent.tab()
    await userEvent.tab()
    await expect(host).toHaveFocus()
    await expect(await screen.findByRole('tooltip')).toHaveTextContent('laptop')
    await expect(canvas.getByRole('img', { name: 'Resident' })).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** The expanded card: project, model, the PR and when it last moved. */
export const Expanded: Story = {
  args: { card: cardOf(cardFixtures.open), compact: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('gpt-6')).toBeVisible()
    await expect(canvas.getByText('5 m ago')).toBeVisible()
    await expect(
      canvas.getByRole('link', { name: /^Pull request #42/ }),
    ).toBeVisible()
  },
}

/** The name is being regenerated: the card says so beside it. */
export const Busy: Story = {
  args: { regeneratingName: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Regenerating name')).toBeVisible()
  },
}

/**
 * Its host stopped answering: the compact card says how long since it last
 * spoke, and that the host is unreachable, instead of a state badge.
 */
export const Failed: Story = {
  args: {
    card: cardOf(
      cardSession({
        id: 'lost',
        executionHost: 'lm',
        attention: 'host-unreachable',
        executionHostLastEventAt: '2026-09-12T12:01:00Z',
      }),
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Host unreachable')).toBeVisible()
    await expect(
      canvas.getByRole('img', { name: 'little-monster' }),
    ).toBeVisible()
  },
}

/** The owning surface names the card for itself. */
export const Long: Story = {
  args: {
    selectionLabel: 'Open Horse in the project tree',
    card: cardOf(
      cardSession({
        id: 'long',
        name: 'Horse — implement the Loom search across every sheet, the strip and the outside group',
        originKind: 'spawn',
      }),
    ),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Open Horse in the project tree' }),
    ).toBeVisible()
    await expect(canvas.getByRole('img', { name: 'Errand' })).toBeVisible()
  },
}
