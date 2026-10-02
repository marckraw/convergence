import type { Meta, StoryObj } from '@storybook/react-vite'
import { MoreHorizontal } from 'lucide-react'
import type { SessionSummary } from '@/entities/session'
import { IconButton } from '@convergence/ui'
import { expect, fn } from 'storybook/test'
import { TreeSessionRow } from './tree-session-row.presentational'

const session = (
  overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id' | 'name'>,
): SessionSummary => ({
  contextKind: 'project',
  projectId: 'convergence',
  workspaceId: null,
  providerId: 'shell',
  model: null,
  effort: null,
  status: 'running',
  attention: 'none',
  activity: null,
  contextWindow: null,
  workingDirectory: '~/Projects/Private/convergence',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'terminal',
  continuationToken: null,
  lastSequence: 3,
  createdAt: '2026-09-30T08:00:00.000Z',
  updatedAt: '2026-09-30T09:00:00.000Z',
  executionHost: 'local',
  ...overrides,
})

const terminal = session({ id: 'terminal', name: 'npm run test:stories' })

const meta = {
  title: 'Widgets/Sidebar/Tree session row',
  component: TreeSessionRow,
  args: {
    session: terminal,
    selected: false,
    onSelect: fn(),
    onRename: fn(),
    actions: (
      <IconButton label="Session actions npm run test:stories" size="xs">
        <MoreHorizontal className="h-3.5 w-3.5" />
      </IconButton>
    ),
  },
  decorators: [
    (Story) => (
      <div className="w-72 bg-background p-3 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TreeSessionRow>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A terminal in the project tree: a click opens it, a double click renames
 * it, and its ⋯ menu shows with the row and for the keyboard.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const row = canvas.getByRole('button', {
      name: /^Terminal session\s*npm run test:stories/,
    })
    await expect(row).not.toHaveAttribute('aria-current')
    await userEvent.click(row)
    await expect(args.onSelect).toHaveBeenCalledOnce()
    await userEvent.dblClick(row)
    await expect(args.onRename).toHaveBeenCalled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/**
 * The conversation on screen: the selected fill, and it says so
 * (aria-current), unlike a row that is only hovered (R7).
 */
export const Selected: Story = {
  args: { selected: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: /^Terminal session/ }),
    ).toHaveAttribute('aria-current', 'true')
  },
}

/** Running on a remote host, its name being regenerated: both say so after it. */
export const Busy: Story = {
  args: {
    session: session({
      id: 'remote',
      name: 'Release notes for 0.98',
      providerId: 'claude-code',
      executionHost: 'studio-mac',
    }),
    regeneratingName: true,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByLabelText('Runs on remote execution host'),
    ).toBeVisible()
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Regenerating name',
    )
  },
}

/** A long name is cut short to the row's one line. */
export const Long: Story = {
  args: {
    session: session({
      id: 'long',
      name: 'node --watch scripts/build-everything.mjs --package=convergence --verbose',
    }),
  },
  play: async ({ canvas }) => {
    const row = canvas.getByRole('button', { name: /node --watch/ })
    await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
  },
}
