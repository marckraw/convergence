import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import {
  DEFAULT_CREW_MEMBER_SEAT,
  type SessionCrewMember,
} from '@/entities/session-crew'
import { CrewSettingsPanel } from './crew-settings-panel.presentational'
import {
  DEFAULT_CREW_ROUND_CAP,
  DEFAULT_CREW_STALL_MINUTES,
} from './crew-loop.pure'
import { crewTokens } from '@convergence/ui'

const seat = (overrides: Partial<SessionCrewMember>): SessionCrewMember => ({
  ...DEFAULT_CREW_MEMBER_SEAT,
  sessionId: null,
  batonName: null,
  canvasX: null,
  canvasY: null,
  ...overrides,
})

const members: SessionCrewMember[] = [
  seat({
    sessionId: 'session-fable',
    batonName: 'fable',
    role: 'mastermind',
    roleCard: 'You are the crew’s mastermind: groom, rule, and hand back.',
  }),
  seat({
    sessionId: 'session-opus',
    batonName: 'opus-mac',
    roleCard: 'You are a horse: implement the brief and run the gates.',
  }),
  seat({
    batonName: 'sonnet-recipe',
    kind: 'dynamic',
    providerId: 'claude-code',
    model: 'claude-sonnet-5',
    hostPolicy: 'little-monster',
    lanePolicy: 'own-worktree',
    wipLimit: 2,
  }),
]

const titles: Record<string, string> = {
  'session-fable': 'Fable · convergence',
  'session-opus': 'opus-mac · convergence',
}

const meta = {
  title: 'Features/MissionControl/CrewSettingsPanel',
  component: CrewSettingsPanel,
  args: {
    emoji: '🐎',
    accentColor: crewTokens.violet,
    onEmojiChange: fn(),
    onAccentColorChange: fn(),
    includePositions: false,
    lastExportPath: null,
    exporting: false,
    onIncludePositionsChange: fn(),
    onExport: fn(),
    onRequestDelete: fn(),
    updateError: null,
    savedName: 'convergence development',
    crewName: 'convergence development',
    members,
    resolveName: (sessionId: string): string | null =>
      titles[sessionId] ?? null,
    deliveryLimit: null,
    attentionMinutes: null,
    lapCap: null,
    defaultDeliveryLimit: DEFAULT_CREW_ROUND_CAP,
    defaultAttentionMinutes: DEFAULT_CREW_STALL_MINUTES,
    busy: false,
    running: false,
    seatProblems: {},
    seatNotices: {},
    batonNameDrafts: {},
    seatDrafts: {},
    resolveHost: (): string | null => 'local',
    onCrewNameChange: fn(),
    onBatonNameEdit: fn(),
    onSeatEdit: fn(),
    onSeatDraftEdit: fn(),
    onSeatDraftCommit: fn(),
    onBatonNameCommit: fn(),
    onDeliveryLimitChange: fn(),
    onAttentionMinutesChange: fn(),
    onLapCapChange: fn(),
    onAddConversation: fn(),
    onRemoveMember: fn(),
    onClose: fn(),
    openSeatKey: null,
    onToggleSeat: fn(),
    seatQuery: '',
    onSeatQueryChange: fn(),
    addMenuOpen: false,
    onAddMenuToggle: fn(),
    hostOptions: [
      { id: 'local', label: 'This Mac' },
      { id: 'little-monster', label: 'little-monster' },
    ],
    resolveProviderName: (): string | null => 'Claude Code',
    onOpenConversation: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex h-225 w-80 flex-col">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CrewSettingsPanel>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The crew: its seats by role, each closed seat named in full for a screen
 * reader, Add as a menu, and the crew's details folded under them.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const panel = canvas.getByRole('region', { name: 'Crew settings' })
    await expect(
      within(panel).getByRole('heading', { name: 'convergence development' }),
    ).toBeVisible()
    await expect(
      within(panel).getByRole('region', { name: 'Mastermind 1' }),
    ).toBeVisible()
    const horse = within(panel).getByRole('button', {
      name: 'opus-mac — opus-mac · convergence · host This Mac · lane default · WIP 1 · has a role card',
    })
    await userEvent.click(horse)
    await expect(args.onToggleSeat).toHaveBeenCalledWith('session-opus')
    await expect(
      within(panel).getByRole('button', { name: /^sonnet-recipe — recipe/ }),
    ).toHaveAccessibleName(/no role card$/)
    const add = within(panel).getByRole('button', { name: 'Add' })
    await expect(add).toHaveAttribute('aria-haspopup', 'menu')
    await expect(add).toHaveAttribute('aria-expanded', 'false')
    // A real Menu's trigger (MC-5); AddMenu shows it open, and the
    // container's tests drive it open and closed.
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Close crew settings' }),
    )
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** One seat open: its editor takes the row's place. */
export const OpenSeat: Story = {
  args: { openSeatKey: 'session-opus' },
  play: async ({ args, canvas, userEvent }) => {
    const editor = canvas.getByRole('region', { name: 'Seat opus-mac' })
    await expect(
      within(editor).getByRole('textbox', { name: 'Baton name for opus-mac' }),
    ).toHaveValue('opus-mac')
    // Role and lane are segmented radio groups, the chosen one the raised
    // chip (MC-7, R7): readable in both themes.
    await expect(
      within(editor).getByRole('radiogroup', { name: 'Role for opus-mac' }),
    ).toBeVisible()
    await expect(
      within(editor).getByRole('radiogroup', { name: 'Lane for opus-mac' }),
    ).toBeVisible()
    await userEvent.click(
      within(editor).getByRole('button', {
        name: 'Open opus-mac · convergence',
      }),
    )
    await expect(args.onOpenConversation).toHaveBeenCalledWith('session-opus')
  },
}

/** The Add menu open: its two entries, New recipe honest that it is not built. */
export const AddMenu: Story = {
  args: { addMenuOpen: true },
  play: async ({ args, userEvent }) => {
    // A real Menu (MC-5), named by its trigger, in the popup layer.
    const menu = await screen.findByRole('menu', { name: 'Add' })
    await expect(
      within(menu).getByRole('menuitem', { name: 'New recipe' }),
    ).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Add conversation…' }),
    )
    await expect(args.onAddConversation).toHaveBeenCalledOnce()
  },
}

/** No seats yet: what a seat is, and both ways to add one, without a menu. */
export const Empty: Story = {
  args: { members: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No seats yet')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Add' })).toBeNull()
    await expect(
      canvas.getByRole('button', { name: 'Add conversation…' }),
    ).toBeEnabled()
  },
}

/** A crew large enough to search: the seat search appears at eight seats. */
export const Long: Story = {
  args: {
    members: Array.from({ length: 9 }, (_, n) =>
      seat({
        sessionId: `session-horse-${n + 1}`,
        batonName: `horse-${n + 1}`,
      }),
    ),
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByRole('searchbox', {
        name: 'Find a seat by name, role or host',
      }),
      '7',
    )
    await expect(args.onSeatQueryChange).toHaveBeenCalledWith('7')
    await expect(canvas.getByRole('region', { name: 'Horses 9' })).toBeVisible()
  },
}

/**
 * The crew's details, unfolded: name, decoration, the loop limits with what
 * they mean, export, and delete, which asks first.
 */
export const Details: Story = {
  args: {
    running: true,
    lastExportPath: '/Users/marcin/recipes/convergence-development.crew.yaml',
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByText(
        'Crew details — name, decoration, loop limits, tracker, export',
      ),
    )
    const name = canvas.getByRole('textbox', { name: 'Crew name' })
    await expect(name).toHaveValue('convergence development')
    await userEvent.type(
      canvas.getByRole('spinbutton', {
        name: 'Delivery limit per run for this crew',
      }),
      '6',
    )
    await expect(args.onDeliveryLimitChange).toHaveBeenCalledWith(6)
    // The disclosure has finished opening (it grows and fades in, MC-31).
    await waitFor(() =>
      expect(
        canvas.getByText(
          'Crew is running — changes apply from the next delivery.',
        ),
      ).toBeVisible(),
    )
    await expect(
      canvas.getByText(
        'Last exported to …/recipes/convergence-development.crew.yaml',
      ),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Export crew…' }))
    await expect(args.onExport).toHaveBeenCalledOnce()
    // Delete crew… asks in ConfirmDialog, which the container opens (R5).
    await userEvent.click(canvas.getByRole('button', { name: 'Delete crew…' }))
    await expect(args.onRequestDelete).toHaveBeenCalledOnce()
  },
}

export const DetailsDark: Story = {
  ...Details,
  globals: { theme: 'dark' },
}

/** An update was refused: the panel says so, and the refused seat is marked. */
export const Failed: Story = {
  args: {
    updateError: 'The crew could not be saved: another window changed it.',
    seatProblems: {
      'session-opus': { batonName: 'That name is taken by another seat.' },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'another window changed it',
    )
    await expect(
      canvas.getByRole('button', { name: /^opus-mac — / }),
    ).toHaveAccessibleName(/an edit was refused — open to see why$/)
  },
}

/** Saving: the add and detail controls wait for the door. */
export const Busy: Story = {
  args: { busy: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Add' })).toBeDisabled()
  },
}
