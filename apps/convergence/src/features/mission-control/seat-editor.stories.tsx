import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, within } from 'storybook/test'
import {
  DEFAULT_CREW_MEMBER_SEAT,
  type SessionCrewMember,
} from '@/entities/session-crew'
import { SeatEditor } from './seat-editor.presentational'

const seat = (
  overrides: Partial<SessionCrewMember> = {},
): SessionCrewMember => ({
  ...DEFAULT_CREW_MEMBER_SEAT,
  sessionId: 'session-opus',
  batonName: 'opus-mac',
  canvasX: null,
  canvasY: null,
  roleCard:
    'You are a horse in the convergence crew. Implement the brief, run the gates, and return your result with verification evidence.',
  ...overrides,
})

const residentFacts = [
  { term: 'Kind', value: 'Resident — a conversation' },
  {
    term: 'Conversation',
    value: 'opus-mac',
    open: { label: 'Open opus-mac', onOpen: fn() },
  },
  { term: 'Host', value: 'This Mac' },
]

const meta = {
  title: 'Features/MissionControl/SeatEditor',
  component: SeatEditor,
  args: {
    member: seat(),
    nameValue: 'opus-mac',
    cardDraft: undefined,
    lanePathValue: '',
    onLanePathChange: fn(),
    onLanePathCommit: fn(),
    wipValue: '1',
    facts: residentFacts,
    factsHeading: 'Facts · from the conversation',
    hostOptions: [
      { id: 'local', label: 'This Mac' },
      { id: 'little-monster', label: 'little-monster' },
    ],
    problems: {},
    nameNotice: null,
    busy: false,
    onNameChange: fn(),
    onNameCommit: fn(),
    onCardChange: fn(),
    onCardCommit: fn(),
    onWriteCard: fn(),
    onWipChange: fn(),
    onWipCommit: fn(),
    onSeatEdit: fn(),
    onClose: fn(),
    onRemove: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SeatEditor>

export default meta

type Story = StoryObj<typeof meta>

/**
 * One seat, open: its name and live address, its role, the role card, policy
 * as controls and facts as text. Typed fields save when they are left.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const editor = canvas.getByRole('region', { name: 'Seat opus-mac' })
    const name = within(editor).getByRole('textbox', {
      name: 'Baton name for opus-mac',
    })
    await userEvent.type(name, '2')
    await expect(args.onNameChange).toHaveBeenCalledWith('opus-mac2')
    await userEvent.keyboard('{Enter}')
    await expect(args.onNameCommit).toHaveBeenCalled()
    // Role and lane: segmented radio groups (MC-7), the chosen one checked.
    const role = within(editor).getByRole('radiogroup', {
      name: 'Role for opus-mac',
    })
    await expect(
      within(role).getByRole('radio', { name: 'horse' }),
    ).toBeChecked()
    await userEvent.click(within(role).getByRole('radio', { name: 'reviewer' }))
    await expect(args.onSeatEdit).toHaveBeenCalledWith({ role: 'reviewer' })
    await expect(
      within(editor).getByRole('textbox', { name: 'Role card for opus-mac' }),
    ).toHaveValue(args.member.roleCard)
    await userEvent.click(
      within(editor).getByRole('radio', { name: 'own worktree' }),
    )
    await expect(args.onSeatEdit).toHaveBeenCalledWith({
      lanePolicy: 'own-worktree',
    })
    await expect(
      within(editor).getByRole('button', {
        name: 'Lower the WIP limit for opus-mac',
      }),
    ).toBeDisabled()
    await userEvent.click(
      within(editor).getByRole('button', {
        name: 'Raise the WIP limit for opus-mac',
      }),
    )
    await expect(args.onSeatEdit).toHaveBeenCalledWith({ wipLimit: 2 })
    await userEvent.click(
      within(editor).getByRole('switch', {
        name: 'Pause automatic dispatch to this seat',
      }),
    )
    await expect(args.onSeatEdit).toHaveBeenCalledWith({ paused: true })
    const facts = within(editor).getByRole('region', { name: 'Facts' })
    await userEvent.click(
      within(facts).getByRole('button', { name: 'Open opus-mac' }),
    )
    await expect(args.facts[1]!.open!.onOpen).toHaveBeenCalledOnce()
    await userEvent.click(
      within(editor).getByRole('button', { name: 'Remove from crew' }),
    )
    await expect(args.onRemove).toHaveBeenCalledOnce()
    await userEvent.click(
      within(editor).getByRole('button', { name: 'Close opus-mac' }),
    )
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** No card yet: the seat says what that means, and offers to write one. */
export const Empty: Story = {
  args: { member: seat({ roleCard: null }) },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('No card yet')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Write a card' }))
    await expect(args.onWriteCard).toHaveBeenCalledOnce()
  },
}

/**
 * A recipe in its own worktree: where each spawn runs, the worktree path,
 * and Delete recipe rather than Remove.
 */
export const Long: Story = {
  args: {
    member: seat({
      sessionId: null,
      batonName: 'sonnet-recipe',
      kind: 'dynamic',
      providerId: 'claude-code',
      model: 'claude-sonnet-5',
      hostPolicy: 'little-monster',
      lanePolicy: 'own-worktree',
      lanePath: '/Users/marcin/Projects/Private/convergence-lane-sonnet',
      wipLimit: 3,
    }),
    nameValue: 'sonnet-recipe',
    lanePathValue: '/Users/marcin/Projects/Private/convergence-lane-sonnet',
    wipValue: '3',
    factsHeading: 'Facts · the recipe',
    facts: [
      { term: 'Kind', value: 'Recipe — spawned on demand' },
      { term: 'Provider', value: 'Claude Code · claude-sonnet-5' },
      { term: 'Conversation', value: 'None — one is spawned per run' },
    ],
  },
  play: async ({ args, canvas, userEvent }) => {
    // The host is the app's Select (MC-10): its trigger shows the label.
    // Its Field's caption names it (MC-4).
    const host = canvas.getByRole('combobox', {
      name: /^Host for sonnet-recipe/,
    })
    await expect(host).toHaveTextContent('little-monster')
    await userEvent.click(host)
    await userEvent.click(
      await screen.findByRole('option', { name: 'This Mac' }),
    )
    await expect(args.onSeatEdit).toHaveBeenCalledWith({ hostPolicy: 'local' })
    const path = canvas.getByRole('textbox', { name: /Worktree path/ })
    await expect(path).toHaveValue(args.lanePathValue)
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Lower the WIP limit for sonnet-recipe',
      }),
    )
    await expect(args.onSeatEdit).toHaveBeenCalledWith({ wipLimit: 2 })
    await expect(
      canvas.getByRole('button', { name: 'Delete recipe' }),
    ).toBeVisible()
  },
}

/** The door refused a name: its sentence under the field, and what still stands. */
export const Failed: Story = {
  args: {
    nameValue: 'opus mac!',
    problems: {
      batonName:
        'A baton name is letters, digits and dashes; “opus mac!” has a space and a “!”.',
    },
  },
  play: async ({ canvas }) => {
    const alert = canvas.getByRole('alert')
    await expect(alert).toHaveTextContent('has a space and a “!”')
    await expect(alert).toHaveTextContent('Still named “opus-mac”')
  },
}

export const FailedDark: Story = {
  ...Failed,
  globals: { theme: 'dark' },
}

/** The conversation is gone: the seat says so, keeps its card, and offers removal. */
export const Orphan: Story = {
  args: { member: seat({ conversationMissing: true }) },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByText('opus-mac’s conversation no longer exists'),
    ).toBeVisible()
    await expect(canvas.queryByRole('region', { name: 'Facts' })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Remove seat' }))
    await expect(args.onRemove).toHaveBeenCalledOnce()
  },
}

/** The mastermind's seat can run the drill by itself. */
export const Mastermind: Story = {
  args: {
    member: seat({ role: 'mastermind', batonName: 'fable' }),
    nameValue: 'fable',
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('checkbox', {
        name: 'Run the drill by itself when the context passes the alert',
      }),
    )
    await expect(args.onSeatEdit).toHaveBeenCalledWith({ drillAuto: true })
  },
}

/** Saving: every control waits for the door. */
export const Disabled: Story = {
  args: { busy: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('textbox', { name: 'Baton name for opus-mac' }),
    ).toBeDisabled()
    await expect(
      canvas.getByRole('radio', { name: 'mastermind' }),
    ).toHaveAttribute('aria-disabled', 'true')
    await expect(
      canvas.getByRole('button', { name: 'Remove from crew' }),
    ).toBeDisabled()
  },
}
