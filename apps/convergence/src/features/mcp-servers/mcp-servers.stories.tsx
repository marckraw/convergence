import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { Button } from '@convergence/ui'
import type {
  McpServerSummary,
  ProjectMcpVisibility,
} from '@/shared/types/mcp.types'
import { McpServersDialog } from './mcp-servers.presentational'

const server = (
  fields: Pick<McpServerSummary, 'name' | 'providerId' | 'scope' | 'status'> &
    Partial<McpServerSummary>,
): McpServerSummary => ({
  providerName: fields.providerId === 'codex' ? 'Codex' : 'Claude Code',
  scopeLabel: fields.scope === 'project' ? '.mcp.json' : '~/.claude.json',
  statusLabel: fields.status,
  transportType: 'stdio',
  description: `npx -y @modelcontextprotocol/server-${fields.name}`,
  enabled: true,
  ...fields,
})

const snapshot: ProjectMcpVisibility = {
  projectId: 'project-convergence',
  projectName: 'convergence',
  providers: [
    {
      providerId: 'claude-code',
      providerName: 'Claude Code',
      projectServers: [
        server({
          name: 'chrome-devtools',
          providerId: 'claude-code',
          scope: 'project',
          status: 'ready',
          statusLabel: 'Connected',
        }),
      ],
      globalServers: [
        server({
          name: 'figma',
          providerId: 'claude-code',
          scope: 'global',
          status: 'needs-auth',
          statusLabel: 'Needs auth',
          transportType: 'streamable_http',
          description: 'https://mcp.figma.com/mcp',
        }),
        server({
          name: 'linear',
          providerId: 'claude-code',
          scope: 'global',
          status: 'failed',
          statusLabel: 'Failed',
          transportType: 'sse',
          description: 'https://mcp.linear.app/sse',
        }),
      ],
      error: null,
    },
    {
      providerId: 'codex',
      providerName: 'Codex',
      projectServers: [],
      globalServers: [
        server({
          name: 'github',
          providerId: 'codex',
          scope: 'global',
          status: 'disabled',
          statusLabel: 'Disabled',
          enabled: false,
        }),
      ],
      error: null,
      note: 'Codex reads ~/.codex/config.toml; per-project servers are not supported.',
    },
    {
      providerId: 'pi',
      providerName: 'Pi',
      projectServers: [],
      globalServers: [],
      error: 'pi-mcp-adapter is not installed.',
    },
  ],
}

const openDialog = async () => {
  const dialog = await screen.findByRole('dialog', { name: 'MCP servers' })
  await waitFor(() =>
    expect(dialog).toContainElement(document.activeElement as HTMLElement),
  )
  // Rests once its pop-in has finished, so what is checked is what is seen.
  await waitFor(() =>
    expect(
      dialog.getAnimations().filter((a) => a.playState === 'running'),
    ).toHaveLength(0),
  )
  return dialog
}

const meta = {
  title: 'Features/McpServers/McpServersDialog',
  component: McpServersDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    trigger: <Button variant="ghost">MCP</Button>,
    projectName: 'convergence',
    snapshot,
    isLoading: false,
    error: null,
    onRefresh: fn(),
  },
} satisfies Meta<typeof McpServersDialog>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Each provider's servers, project first then global, with their transport
 * and status; Pi's section explains how to set it up. Refresh reads again.
 */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(dialog).toHaveAccessibleDescription(
      'Available in convergence, grouped by provider and scope.',
    )
    await expect(within(dialog).getByText('chrome-devtools')).toBeVisible()
    await expect(within(dialog).getByText('Needs auth')).toBeVisible()
    // An empty list says so on EmptyState (DLG-18): Codex and Pi have no
    // project servers.
    for (const empty of within(dialog).getAllByText('No project servers yet')) {
      await expect(empty).toBeVisible()
    }
    await expect(
      within(dialog).getByText('pi-mcp-adapter is not installed.'),
    ).toBeVisible()
    await expect(
      within(dialog).getByRole('button', { name: 'Pi MCP setup instructions' }),
    ).toBeVisible()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Refresh' }),
    )
    await expect(args.onRefresh).toHaveBeenCalledOnce()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

/** Busy, the first read: nothing to show yet, and Refresh says it is at it. */
export const Busy: Story = {
  args: { snapshot: null, isLoading: true },
  play: async () => {
    const dialog = await openDialog()
    // It fades in once the read has taken 300 ms.
    await waitFor(() =>
      expect(
        within(dialog).getByText('Checking provider MCP servers…'),
      ).toBeVisible(),
    )
    await expect(
      within(dialog).getByRole('button', { name: 'Refresh' }),
    ).toHaveAttribute('aria-busy', 'true')
  },
}

/** Failed: the read failed before anything came back. */
export const Failed: Story = {
  args: {
    snapshot: null,
    error: 'Could not read ~/.claude.json: unexpected token } at line 41.',
  },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /unexpected token/,
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Try again' }),
    )
    await expect(args.onRefresh).toHaveBeenCalledOnce()
  },
}

/** Empty: no provider that speaks MCP is available. */
export const Empty: Story = {
  args: {
    snapshot: { ...snapshot, providers: [] },
  },
  play: async () => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByText('No MCP-capable providers'),
    ).toBeVisible()
  },
}

/** Disabled: no project open, so there is nothing to inspect or refresh. */
export const Disabled: Story = {
  args: { projectName: null, snapshot: null },
  play: async () => {
    const dialog = await openDialog()
    await expect(dialog).toHaveAccessibleDescription(
      'Select a project to inspect provider-backed MCP availability.',
    )
    const refresh = within(dialog).getByRole('button', { name: 'Refresh' })
    await expect(refresh).toHaveAttribute('aria-disabled', 'true')
    await expect(refresh).toHaveAccessibleDescription('Open a project first.')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
