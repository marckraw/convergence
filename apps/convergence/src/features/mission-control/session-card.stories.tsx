import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import type { SessionSummary } from '@/entities/session'
import type { SessionCrew } from '@/entities/session-crew'
import type { SessionCard } from './mission-control.types'
import { buildSessionWireHint } from './relay-hop.pure'
import { SessionCardView } from './session-card.presentational'
import { crewTokens } from '@convergence/ui'

const session = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  id: 'session-opus',
  contextKind: 'project',
  projectId: 'project-convergence',
  workspaceId: null,
  providerId: 'claude-code',
  model: 'claude-opus-5',
  effort: 'high',
  name: 'opus-mac',
  status: 'idle',
  attention: 'none',
  activity: null,
  contextWindow: null,
  workingDirectory: '/Users/marcin/Projects/Private/convergence',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-09-17T10:00:00.000Z',
  updatedAt: '2026-09-17T12:00:00.000Z',
  executionHost: 'local',
  originKind: 'resident',
  pinnedAt: null,
  ...overrides,
})

const crew = (
  id: string,
  name: string,
  accentColor: string | null,
  emoji: string | null = null,
): SessionCrew => ({
  id,
  name,
  emoji,
  accentColor,
  position: 0,
  roundCap: null,
  stallMinutes: null,
  lapCap: null,
  members: [],
  createdAt: '2026-09-17T08:00:00.000Z',
  updatedAt: '2026-09-17T08:00:00.000Z',
  sessionIds: ['session-opus'],
})

const cardOf = (
  overrides: Partial<SessionSummary> = {},
  rest: Partial<Omit<SessionCard, 'session'>> = {},
): SessionCard => ({
  session: session(overrides),
  projectName: 'convergence',
  providerLabel: 'Claude Code',
  activityLabel: 'idle · 10m',
  crews: [crew('crew-1', 'convergence development', crewTokens.violet, '🐎')],
  searchText: 'opus-mac convergence',
  ...rest,
})

/** The card that breathes: running, in its crew's colour. */
const working = cardOf(
  { status: 'running' },
  { activityLabel: 'working · reading the Loom sheets' },
)

const meta = {
  title: 'Features/MissionControl/SessionCard',
  component: SessionCardView,
  args: {
    card: cardOf(),
    open: false,
    hailOpen: false,
    wireHint: buildSessionWireHint(
      [
        {
          sourceSessionId: 'session-fable',
          targetSessionId: 'session-opus',
          armed: true,
        },
        {
          sourceSessionId: 'session-opus',
          targetSessionId: 'session-fable',
          armed: true,
        },
      ],
      'session-opus',
    ),
    onOpen: fn(),
    onHail: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-72 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SessionCardView>

export default meta

type Story = StoryObj<typeof meta>

/**
 * An idle card: the session, its project and model, its crew and its wires.
 * The body opens the conversation by click or keyboard; Hail is its own door.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const body = canvas.getByRole('button', { name: 'Open opus-mac' })
    await userEvent.click(body)
    await expect(args.onOpen).toHaveBeenCalledWith(args.card)
    await expect(body).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onOpen).toHaveBeenCalledTimes(2)
    await expect(canvas.getByLabelText(args.wireHint!.label)).toHaveTextContent(
      '2',
    )
    const hail = canvas.getByRole('button', { name: 'Hail opus-mac' })
    await expect(hail).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(hail)
    await expect(args.onHail).toHaveBeenCalledWith(args.card)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Working: the card breathes in its crew's colour and says what it is doing. */
export const Busy: Story = {
  args: { card: working },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('working · reading the Loom sheets'),
    ).toBeVisible()
    const card = canvas
      .getByRole('button', { name: 'Open opus-mac' })
      .closest<HTMLElement>('[data-session-card]')!
    await expect(card).toHaveAttribute('data-breathing', 'true')
    const glare = getComputedStyle(card, '::after')
    await expect(glare.animationName).toBe('session-card-breathe')
    await expect(glare.boxShadow).not.toBe('none')
  },
}

export const BusyDark: Story = {
  ...Busy,
  globals: { theme: 'dark' },
}

/**
 * Reduced motion: the working card keeps its glare, so it still says it is
 * busy and in whose colour, but the breath stops. The breath plays
 * --motion-loops times, which tokens.css sets to 0 under the system's
 * prefers-reduced-motion and under `data-motion="reduced"` (the toolbar's
 * switch, here) alike; the still glare sits at the top of the breath.
 */
export const ReducedMotion: Story = {
  args: { card: working },
  globals: { motion: 'reduced' },
  play: async ({ canvas }) => {
    const card = canvas
      .getByRole('button', { name: 'Open opus-mac' })
      .closest<HTMLElement>('[data-session-card]')!
    await expect(card).toHaveAttribute('data-breathing', 'true')
    const glare = getComputedStyle(card, '::after')
    await expect(glare.boxShadow).not.toBe('none')
    await expect(Number(glare.opacity)).toBeGreaterThan(0)
    // The breath stands still: it plays no beats at all, so nothing on the
    // glow is running.
    await expect(glare.animationIterationCount).toBe('0')
    const breathing = card
      .getAnimations({ subtree: true })
      .filter((animation) => animation.playState === 'running')
    await expect(breathing).toHaveLength(0)
    await expect(
      canvas.getByText('working · reading the Loom sheets'),
    ).toBeVisible()
  },
}

/** The conversation on screen, with its Hail open: both marks, separately. */
export const Open: Story = {
  args: { open: true, hailOpen: true },
  play: async ({ canvas }) => {
    const card = canvas
      .getByRole('button', { name: 'Open opus-mac' })
      .closest('[data-session-card]')
    await expect(card).toHaveAttribute('aria-current', 'true')
    await expect(
      canvas.getByRole('button', { name: 'Hail opus-mac' }),
    ).toHaveAttribute('aria-expanded', 'true')
  },
}

/** Waiting on you: the attention is named on the card. */
export const Waiting: Story = {
  args: {
    card: cardOf({ status: 'idle', attention: 'needs-approval' }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Approval needed')).toBeVisible()
  },
}

/** A failed run: the card says so in its attention and its last line. */
export const Failed: Story = {
  args: {
    card: cardOf(
      { status: 'failed', attention: 'failed' },
      { activityLabel: 'failed · the provider exited' },
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('failed · the provider exited')).toBeVisible()
  },
}

export const FailedDark: Story = {
  ...Failed,
  globals: { theme: 'dark' },
}

/** The host stopped answering: the card says so instead of guessing a state. */
export const HostUnreachable: Story = {
  args: {
    card: cardOf(
      {
        status: 'running',
        attention: 'host-unreachable',
        executionHost: 'little-monster',
        executionHostLastEventAt: '2026-09-17T12:02:00.000Z',
      },
      { hostLiveness: 'little-monster · 8m silent' },
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Host unreachable')).toBeVisible()
    await expect(canvas.getByText('little-monster · 8m silent')).toBeVisible()
  },
}

/** A long name and several crews: the name is cut short, every crew named. */
export const Long: Story = {
  args: {
    card: cardOf(
      {
        name: 'opus-mac — implement Loom search across every sheet, the strip and the outside group',
      },
      {
        crews: [
          crew('crew-1', 'convergence development', crewTokens.violet, '🐎'),
          crew('crew-2', 'backpack studio', crewTokens.green),
          crew('crew-3', 'spikes', null),
        ],
      },
    ),
    wireHint: null,
  },
  play: async ({ canvas }) => {
    for (const name of [
      'convergence development',
      'backpack studio',
      'spikes',
    ]) {
      await expect(canvas.getByText(`In crew ${name}`)).toBeInTheDocument()
    }
  },
}
