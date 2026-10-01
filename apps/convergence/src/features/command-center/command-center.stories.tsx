import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { CommandCenterPalette } from './command-center.presentational'
import type {
  CuratedSection,
  DialogPaletteItem,
  NewSessionPaletteItem,
  ProjectPaletteItem,
  SessionPaletteItem,
} from './command-center.types'

const waiting: SessionPaletteItem = {
  kind: 'session',
  id: 'session:overflow',
  sessionId: 'overflow',
  contextKind: 'project',
  projectId: 'convergence',
  workspaceId: 'w-sidebar',
  sessionName: 'Fix the sidebar overflow',
  projectName: 'convergence',
  branchName: 'fix/sidebar-overflow',
  providerId: 'claude-code',
  attention: 'needs-approval',
  compacting: false,
  updatedAt: '2026-09-30T09:28:00.000Z',
  search: { sessionName: 'Fix the sidebar overflow' },
}

const recent: SessionPaletteItem = {
  ...waiting,
  id: 'session:stories',
  sessionId: 'stories',
  sessionName: 'Safety-net stories',
  branchName: null,
  attention: 'none',
  search: { sessionName: 'Safety-net stories' },
}

const project: ProjectPaletteItem = {
  kind: 'project',
  id: 'project:emergence',
  projectId: 'emergence',
  projectName: 'emergence',
  repositoryPath: '~/Projects/Private/emergence',
  search: { projectName: 'emergence' },
}

const providers: DialogPaletteItem = {
  kind: 'dialog',
  id: 'dialog:providers',
  dialogKind: 'providers',
  title: 'Providers',
  description: 'Configure provider credentials',
  search: { title: 'Providers' },
}

const newSession: NewSessionPaletteItem = {
  kind: 'new-session',
  id: 'new-session:w-sidebar',
  workspaceId: 'w-sidebar',
  projectId: 'convergence',
  branchName: 'fix/sidebar-overflow',
  projectName: 'convergence',
  title: 'New session in fix/sidebar-overflow',
  search: { title: 'New session' },
}

const sections: CuratedSection[] = [
  { id: 'waiting-on-you', title: 'Waiting on you', items: [waiting] },
  { id: 'session-actions', title: 'This session', items: [newSession] },
  { id: 'recent-sessions', title: 'Recent sessions', items: [recent] },
  { id: 'projects', title: 'Projects', items: [project] },
  { id: 'dialogs', title: 'Dialogs', items: [providers] },
  { id: 'workspaces', title: 'Workspaces', items: [] },
]

const meta = {
  title: 'Features/Command center/Command palette',
  component: CommandCenterPalette,
  args: {
    open: true,
    query: '',
    view: { mode: 'sections', sections },
    selectedValue: 'session:overflow',
    onOpenChange: fn(),
    onQueryChange: fn(),
    onSelectedValueChange: fn(),
    onSelect: fn(),
  },
} satisfies Meta<typeof CommandCenterPalette>

export default meta

type Story = StoryObj<typeof meta>

/**
 * ⌘K with nothing typed: what waits on you first, then this session's
 * actions, recents, projects and dialogs, each row named by its kind.
 */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Command palette',
    })
    await waitFor(() => expect(dialog).toBeVisible())
    const search = within(dialog).getByRole('combobox')
    await waitFor(() => expect(search).toHaveFocus())

    const options = within(dialog).getAllByRole('option')
    await expect(
      options.map((option) => option.getAttribute('aria-label')),
    ).toEqual([
      'Session: Fix the sidebar overflow — convergence · fix/sidebar-overflow',
      'New session: New session in fix/sidebar-overflow — convergence',
      'Session: Safety-net stories — convergence',
      'Project: emergence — ~/Projects/Private/emergence',
      'Dialog: Providers — Configure provider credentials',
    ])
    // An empty section is left out.
    await expect(within(dialog).queryByText('Workspaces')).toBeNull()

    await userEvent.keyboard('p')
    await expect(args.onQueryChange).toHaveBeenCalledWith('p')
    // The highlighted row is the container's to keep; the arrows ask to move it.
    await expect(options[0]).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowDown}')
    await expect(args.onSelectedValueChange).toHaveBeenCalledWith(
      'new-session:w-sidebar',
    )

    await userEvent.click(
      within(dialog).getByRole('option', { name: /^Dialog: Providers/ }),
    )
    await expect(args.onSelect).toHaveBeenCalledWith(providers)

    await userEvent.keyboard('{Escape}')
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** With a query, one ranked list, best match first. */
export const Ranked: Story = {
  args: {
    query: 'sidebar',
    view: {
      mode: 'ranked',
      items: [
        { item: waiting, score: 0.02 },
        { item: newSession, score: 0.2 },
      ],
    },
  },
  play: async () => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Command palette',
    })
    await expect(within(dialog).getByRole('combobox')).toHaveValue('sidebar')
    const options = within(dialog).getAllByRole('option')
    await expect(options).toHaveLength(2)
    await expect(options[0]).toHaveAccessibleName(
      'Session: Fix the sidebar overflow — convergence · fix/sidebar-overflow',
    )
  },
}

/**
 * Narrowed to cmdk's list, which holds only the message when nothing
 * matches; every other element in these stories is still checked.
 */
const emptyListGap = {
  a11y: {
    config: {
      rules: [
        // a11y-known: with nothing to show, the list (role="listbox") holds
        // only its message, a listbox without options — fixed by the sweep
        // (DS4)
        {
          id: 'aria-required-children',
          selector: '[role]:not([cmdk-list])',
        },
      ],
    },
  },
}

/** A query that matches nothing says what to try. */
export const NoResults: Story = {
  name: 'No results',
  parameters: emptyListGap,
  args: { query: 'zeppelin', view: { mode: 'ranked', items: [] } },
  play: async () => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Command palette',
    })
    await expect(
      await within(dialog).findByText(
        'No results. Try a session name, branch, or project.',
      ),
    ).toBeInTheDocument()
    await expect(within(dialog).queryAllByRole('option')).toHaveLength(0)
  },
}

/** Nothing recent yet: the palette says how to fill it. */
export const Empty: Story = {
  parameters: emptyListGap,
  args: { view: { mode: 'sections', sections: [] } },
  play: async () => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Command palette',
    })
    await expect(
      await within(dialog).findByText(
        'No recents yet. Start a session to see it here.',
      ),
    ).toBeInTheDocument()
  },
}

/** Closed, nothing is drawn. */
export const Closed: Story = {
  args: { open: false },
  play: async () => {
    await expect(screen.queryByRole('dialog')).toBeNull()
  },
}

/** Many long rows scroll inside the palette, which stays on screen. */
export const Long: Story = {
  args: {
    query: 'design',
    view: {
      mode: 'ranked',
      items: Array.from({ length: 30 }, (_, index) => ({
        item: {
          ...recent,
          id: `session:long-${index}`,
          sessionId: `long-${index}`,
          sessionName: `Design system sweep, part ${index + 1}: moving every screen onto the shared parts`,
          branchName: `ds/sweep-part-${index + 1}-with-a-long-branch-name`,
        },
        score: index / 30,
      })),
    },
  },
  play: async () => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Command palette',
    })
    const list = within(dialog).getByRole('listbox')
    await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)
    await waitFor(() =>
      expect(dialog.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        window.innerHeight,
      ),
    )
  },
}
