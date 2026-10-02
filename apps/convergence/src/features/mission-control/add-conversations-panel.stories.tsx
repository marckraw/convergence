import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, within } from 'storybook/test'
import {
  AddConversationsPanel,
  ANY_PROJECT_OPTION_ID,
} from './add-conversations-panel.presentational'

const meta = {
  title: 'Features/MissionControl/AddConversationsPanel',
  component: AddConversationsPanel,
  args: {
    crewName: 'convergence development',
    query: '',
    onQueryChange: fn(),
    projectOptions: [
      { id: ANY_PROJECT_OPTION_ID, label: 'All projects' },
      { id: 'project-convergence', label: 'convergence' },
      { id: 'project-studio', label: 'backpack-studio' },
    ],
    selectedProjectId: null,
    onProjectChange: fn(),
    available: [
      {
        sessionId: 'session-opus',
        name: 'opus-mac',
        detail: 'Claude Code · Opus 5 · convergence',
      },
      {
        sessionId: 'session-sol',
        name: 'Sol',
        detail: 'Codex · gpt-6 · convergence',
        inCrew: 'backpack studio',
      },
    ],
    selectedIds: ['session-opus'],
    onToggle: fn(),
    alreadyInCrew: ['Fable'],
    busy: false,
    onAdd: fn(),
    onClose: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex h-160 w-80 flex-col">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AddConversationsPanel>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Bringing conversations into a crew: pick them, see which already sit in
 * another crew, and add. Adding changes nothing about the conversation.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const panel = canvas.getByRole('region', { name: 'Add conversations' })
    // The project picker says which choice it is, not only its value (MC-12).
    await expect(
      within(panel).getByRole('combobox', { name: 'Project: All projects' }),
    ).toBeVisible()
    const opus = within(panel).getByRole('button', { name: /^opus-mac/ })
    await expect(opus).toHaveAttribute('aria-pressed', 'true')
    const sol = within(panel).getByRole('button', { name: /^Sol/ })
    await expect(sol).toHaveTextContent('In crew “backpack studio”')
    await userEvent.click(sol)
    await expect(args.onToggle).toHaveBeenCalledWith('session-sol')
    await userEvent.type(
      within(panel).getByRole('searchbox', {
        name: 'Search conversations to add',
      }),
      'o',
    )
    await expect(args.onQueryChange).toHaveBeenCalledWith('o')
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Add 1 conversation' }),
    )
    await expect(args.onAdd).toHaveBeenCalledOnce()
    await expect(panel).toHaveTextContent('Already in this crew: Fable.')
    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Close the add conversations panel',
      }),
    )
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** The project picker narrows the list to one project. */
export const ProjectPicker: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'convergence' }),
    )
    await expect(args.onProjectChange).toHaveBeenCalledWith(
      'project-convergence',
    )
  },
}

/** Everything is already in the crew: the list says so; Add waits. */
export const Empty: Story = {
  args: { available: [], selectedIds: [] },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Every conversation is already in this crew.'),
    ).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Add 0 conversations' }),
    ).toBeDisabled()
  },
}

/** A search that finds nothing is said as the search's answer. */
export const NoMatch: Story = {
  args: { available: [], selectedIds: [], query: 'zebra' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('No conversations match this search.'),
    ).toBeVisible()
  },
}

/** The door refused one of two: its sentence, and the refused one stays picked. */
export const Failed: Story = {
  args: {
    selectedIds: ['session-sol'],
    refusal: {
      sentences: ['Sol already sits in “backpack studio”: one seat, one crew.'],
      added: 1,
      attempted: 2,
    },
  },
  play: async ({ canvas }) => {
    const alert = canvas.getByRole('alert')
    await expect(alert).toHaveTextContent('one seat, one crew')
    await expect(alert).toHaveTextContent(
      '1 of 2 added; the refused conversation stays selected.',
    )
  },
}

/** Adding: the panel's controls wait until the door answers. */
export const Busy: Story = {
  args: { busy: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('searchbox', { name: 'Search conversations to add' }),
    ).toBeDisabled()
    await expect(
      canvas.getByRole('button', { name: 'Add 1 conversation' }),
    ).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  },
}
