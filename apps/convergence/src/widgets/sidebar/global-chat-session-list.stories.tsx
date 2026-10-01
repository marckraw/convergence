import type { Meta, StoryObj } from '@storybook/react-vite'
import type { SessionSummary } from '@/entities/session'
import { TooltipProvider } from '@convergence/ui'
import { expect, fn, screen, waitFor } from 'storybook/test'
import {
  GlobalChatSessionList,
  type ChatSidebarSpace,
} from './global-chat-session-list.presentational'

const session = (
  overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id' | 'name'>,
): SessionSummary => ({
  contextKind: 'global',
  projectId: null,
  workspaceId: null,
  providerId: 'claude-code',
  model: 'claude-opus-4-5',
  effort: null,
  status: 'idle',
  attention: 'none',
  activity: null,
  contextWindow: null,
  workingDirectory: '~',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 8,
  createdAt: '2026-09-30T08:00:00.000Z',
  updatedAt: '2026-09-30T09:00:00.000Z',
  executionHost: 'local',
  ...overrides,
})

const tokens = session({
  id: 'tokens',
  name: 'Name the color tokens',
  attention: 'finished',
})
const motion = session({
  id: 'motion',
  name: 'Reduced motion everywhere',
  status: 'running',
  activity: 'streaming',
})
const sessions: SessionSummary[] = [
  session({ id: 'trip', name: 'Plan the Lisbon trip', attention: 'finished' }),
  session({
    id: 'recipe',
    name: 'Sourdough timings',
    attention: 'needs-input',
  }),
  session({
    id: 'old',
    name: 'Last year’s tax questions',
    archivedAt: '2026-04-30T10:00:00.000Z',
  }),
]

const spaces: ChatSidebarSpace[] = [
  {
    id: 'design-system',
    title: 'Design system',
    archivedAt: null,
    attempts: [
      {
        attemptId: 'a-tokens',
        sessionId: tokens.id,
        sessionName: tokens.name,
        role: 'exploration',
        session: tokens,
      },
      {
        attemptId: 'a-motion',
        sessionId: motion.id,
        sessionName: motion.name,
        role: 'implementation',
        session: motion,
      },
    ],
  },
  { id: 'reading', title: 'Reading list', archivedAt: null, attempts: [] },
  {
    id: 'garden',
    title: 'Garden 2025',
    archivedAt: '2026-01-10T10:00:00.000Z',
    attempts: [],
  },
]

const meta = {
  title: 'Widgets/Sidebar/Global chat session list',
  component: GlobalChatSessionList,
  args: {
    spaces,
    sessions,
    activeSessionId: 'trip',
    selectedSpaceId: null,
    expandedSpaceIds: new Set(['design-system']),
    archivedSpacesExpanded: false,
    onNewSession: fn(),
    onNewSpace: fn(),
    onSelectSpace: fn(),
    onToggleSpace: fn(),
    onToggleArchivedSpaces: fn(),
    onArchiveSpace: fn(),
    onUnarchiveSpace: fn(),
    onSelectSpaceAttempt: fn(),
    onSelectSession: fn(),
    onManageSessionSpaces: fn(),
    onDetachSpaceAttempt: fn(),
    onArchiveSession: fn(),
    onUnarchiveSession: fn(),
    onDeleteSession: fn(),
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="w-72 bg-background py-3 text-foreground">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof GlobalChatSessionList>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The chat sidebar: new chat and new Space, the Spaces with their attempts,
 * the chats in no Space, and the archived ones.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'New chat' }))
    await expect(args.onNewSession).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'New Space' }))
    await expect(args.onNewSpace).toHaveBeenCalledOnce()

    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Open Space attempt Name the color tokens',
      }),
    )
    await expect(args.onSelectSpaceAttempt).toHaveBeenCalledWith('tokens')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Expand Space Reading list' }),
    )
    await expect(args.onToggleSpace).toHaveBeenCalledWith('reading')
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Open chat session Sourdough timings',
      }),
    )
    await expect(args.onSelectSession).toHaveBeenCalledWith('recipe')

    // A chat's actions, from its own menu.
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Chat session actions Plan the Lisbon trip',
      }),
    )
    await screen.findByRole('menu')
    await expect(
      screen.getByRole('menuitem', { name: 'Add to Space…' }),
    ).toBeInTheDocument()
    await expect(
      screen.getByRole('menuitem', { name: 'Delete session…' }),
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Archive session' }),
    )
    await expect(args.onArchiveSession).toHaveBeenCalledWith('trip')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** An attempt's menu reaches its Space: manage, archive, detach, delete. */
export const AttemptActions: Story = {
  name: 'Attempt actions',
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Space attempt actions Reduced motion everywhere',
      }),
    )
    await screen.findByRole('menu')
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Detach from Space' }),
    )
    await expect(args.onDetachSpaceAttempt).toHaveBeenCalledWith(
      'a-motion',
      'design-system',
      'motion',
    )
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

/** Archived Spaces open below the live ones, each one restorable. */
export const ArchivedSpaces: Story = {
  name: 'Archived Spaces',
  args: { archivedSpacesExpanded: true },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('button', { name: 'Collapse archived Spaces' }),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Open archived Space Garden 2025' }),
    )
    await expect(args.onSelectSpace).toHaveBeenCalledWith('garden')
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Archived Space actions Garden 2025',
      }),
    )
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Unarchive Space' }),
    )
    await expect(args.onUnarchiveSpace).toHaveBeenCalledWith('garden')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

/** A name search narrows Spaces and chats, and hides the new buttons. */
export const Searching: Story = {
  args: { nameSearchQuery: 'motion' },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: 'New chat' })).toBeNull()
    await expect(
      canvas.getByRole('button', {
        name: 'Open Space attempt Reduced motion everywhere',
      }),
    ).toBeVisible()
    await expect(
      canvas.queryByRole('button', {
        name: 'Open Space attempt Name the color tokens',
      }),
    ).toBeNull()
    await expect(
      canvas.queryByRole('button', { name: /^Open chat session/ }),
    ).toBeNull()
  },
}

/** A search that matches nothing says so, as a status. */
export const NoMatch: Story = {
  name: 'No match',
  args: { nameSearchQuery: 'zeppelin' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'No conversation matches "zeppelin"',
    )
  },
}

/** Nothing yet: the two new buttons, and a line for each empty list. */
export const Empty: Story = {
  args: { spaces: [], sessions: [], expandedSpaceIds: new Set() },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No Spaces yet')).toBeVisible()
    await expect(canvas.getByText('No chats yet')).toBeVisible()
  },
}

/** Many chats with long names: each row stays one line, cut short. */
export const Long: Story = {
  args: {
    sessions: Array.from({ length: 16 }, (_, index) =>
      session({
        id: `long-${index}`,
        name: `A long conversation about planning the whole autumn, chapter ${index + 1}`,
        attention: index % 3 ? 'finished' : 'none',
      }),
    ),
  },
  play: async ({ canvas }) => {
    const rows = canvas.getAllByRole('button', { name: /^Open chat session/ })
    await expect(rows).toHaveLength(16)
    for (const row of rows) {
      await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
    }
  },
}
