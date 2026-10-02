import type { Meta, StoryObj } from '@storybook/react-vite'
import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
import { expect, fn } from 'storybook/test'
import { HarnessFactsSections } from './harness-facts.presentational'

/*
 * The harness sections of the header's Details: what Claude Code reported
 * about hooks, retries, denials, compactions, the rate limit and what it
 * loaded at start.
 */

const facts: SessionHarnessFacts = {
  turns: [],
  currentTurn: {
    turnId: 'turn-4',
    hooks: [
      {
        id: 'hook-1',
        name: 'PreToolUse:Bash',
        event: 'PreToolUse',
        status: 'ok',
        startedAt: '2026-10-01T14:02:12.000Z',
        durationMs: 17,
        output: 'allowed: npm run test:unit',
      },
      {
        id: 'hook-2',
        name: 'PostToolUse:Edit',
        event: 'PostToolUse',
        status: 'failed',
        startedAt: '2026-10-01T14:02:30.000Z',
        durationMs: 412,
        output: {
          truncated: true,
          bytes: 18_400,
          preview: 'prettier: apps/convergence/src/features/composer/…',
        },
      },
    ],
    retries: {
      attempts: 2,
      state: 'succeeded',
      last: {
        kind: 'harness.retry',
        at: '2026-10-01T14:02:40.000Z',
        phase: 'resolved',
        outcome: 'succeeded',
        attempts: 2,
        errorSubtype: null,
      },
    },
    denials: [
      {
        toolName: 'Bash',
        reasonType: 'rule',
        reason: 'git push is not in the allow list',
        at: '2026-10-01T14:02:50.000Z',
      },
    ],
  },
  compactions: [
    {
      kind: 'harness.compaction',
      at: '2026-10-01T13:40:00.000Z',
      sequence: 18,
      trigger: 'auto',
      preTokens: 167_400,
      postTokens: 12_300,
      durationMs: 8_200,
    },
  ],
  rateLimit: {
    kind: 'harness.rateLimit',
    at: '2026-10-01T14:02:00.000Z',
    status: 'allowed_warning',
    type: 'five_hour',
    utilization: 0.82,
    resetsAt: null,
    overageStatus: null,
    overageResetsAt: null,
    overageDisabledReason: null,
    isUsingOverage: false,
    overageInUse: null,
    surpassedThreshold: 0.8,
  },
  init: {
    kind: 'harness.init',
    at: '2026-10-01T13:00:00.000Z',
    claudeCodeVersion: '2.4.1',
    model: 'claude-opus-4-1',
    permissionMode: 'default',
    mcpServers: {
      total: 4,
      connected: 3,
      connectedNames: ['linear', 'figma', 'context7'],
      others: [{ name: 'sentry', status: 'needs-auth' }],
      omitted: 0,
      omittedAlerts: 0,
    },
    plugins: { count: 2, names: ['figma', 'agent-skills'], omitted: 0 },
    capabilities: { values: ['hooks', 'subagents'], omitted: 0 },
    tools: { count: 38 },
    skills: { count: 12 },
    slashCommands: { count: 21 },
  },
}

const meta = {
  title: 'Widgets/SessionView/HarnessFacts',
  component: HarnessFactsSections,
  args: {
    facts,
    error: null,
    loading: false,
    onRetry: fn(),
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-96 max-w-full rounded-md border border-line bg-raised p-3 text-xs text-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HarnessFactsSections>

export default meta

type Story = StoryObj<typeof meta>

/** Every section a busy turn reports, one region each. */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    for (const name of [
      'Hooks',
      'Retries',
      'Denials',
      'Compactions',
      'Rate limit',
      'Harness',
    ]) {
      await expect(canvas.getByRole('region', { name })).toBeVisible()
    }
    await expect(canvas.getByText('ok · 17 ms')).toBeVisible()
    await expect(canvas.getByText('2 attempts · succeeded')).toBeVisible()
    await expect(canvas.getByText('Utilization: 82%')).toBeVisible()
    await expect(canvas.getByText('Claude Code 2.4.1')).toBeVisible()
    await expect(
      canvas.getByText('Connected: linear, figma, context7'),
    ).toBeVisible()
    // A hook's output stays folded until asked for.
    const preview = canvas.getByText(/prettier: apps\/convergence/)
    await expect(preview).not.toBeVisible()
    await userEvent.click(canvas.getByText('Output · truncated'))
    await expect(preview).toBeVisible()
    await expect(canvas.getByText('18400 bytes reported')).toBeVisible()
  },
}

/** Nothing reported yet. */
export const Empty: Story = {
  args: {
    facts: {
      turns: [],
      currentTurn: null,
      compactions: [],
      rateLimit: null,
      init: null,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No harness facts yet')).toBeVisible()
    await expect(canvas.queryByRole('region')).toBeNull()
  },
}

/** Reading the facts. */
export const Busy: Story = {
  args: { facts: null, loading: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Loading harness facts…')).toBeVisible()
  },
}

/** The read failed: say why, and offer to try again. */
export const Failed: Story = {
  args: {
    facts: null,
    error: 'Could not read harness facts: the session database is locked.',
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'the session database is locked',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }))
    await expect(args.onRetry).toHaveBeenCalledOnce()
  },
}

const mcpStatusFacts: SessionHarnessFacts = {
  ...facts,
  currentTurn: null,
  compactions: [],
  rateLimit: null,
  mcpStatus: {
    kind: 'harness.mcpStatus',
    at: '2026-10-01T14:00:00.000Z',
    connected: 2,
    omitted: 0,
    omittedAlerts: 0,
    servers: [
      {
        name: 'linear',
        status: 'connected',
        scope: 'user',
        origin: 'https://mcp.linear.app',
      },
      {
        name: 'claude.ai Figma',
        status: 'needs-auth',
        scope: 'claudeai',
        origin: 'https://mcp.figma.com',
      },
      {
        name: 'sentry',
        status: 'failed',
        scope: 'project',
        origin: null,
      },
      {
        name: 'context7',
        status: 'connected',
        scope: 'user',
        origin: 'https://mcp.context7.com',
      },
    ],
    pluginServers: [
      {
        plugin: 'figma',
        server: 'figma',
        origin: 'https://mcp.figma.com',
        loaded: false,
      },
    ],
  },
}

/**
 * The running process's MCP status: servers that failed or need sign-in can
 * be reconnected from here, and a connector hiding a plugin's server says so.
 */
export const McpStatus: Story = {
  name: 'MCP status',
  args: {
    facts: mcpStatusFacts,
    mcp: {
      unavailable: null,
      pending: null,
      error: null,
      onReconnect: fn(),
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole('note')).toHaveTextContent(
      "claude.ai Figma needs sign-in and is hiding the Figma plugin's server",
    )
    await expect(
      canvas.queryByRole('button', { name: 'Reconnect linear' }),
    ).toBeNull()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Reconnect sentry' }),
    )
    await expect(args.mcp?.onReconnect).toHaveBeenCalledWith('sentry')
  },
}

/** A reconnect under way: every Reconnect waits for it. */
export const McpReconnecting: Story = {
  name: 'MCP reconnecting',
  args: {
    facts: mcpStatusFacts,
    mcp: {
      unavailable: null,
      pending: 'sentry',
      error: null,
      onReconnect: fn(),
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Reconnect sentry' }),
    ).toHaveTextContent('Reconnecting…')
    await expect(
      canvas.getByRole('button', { name: 'Reconnect claude.ai Figma' }),
    ).toBeDisabled()
  },
}

/** A reconnect failed: the error stays while the server is still failing. */
export const McpReconnectFailed: Story = {
  name: 'MCP reconnect failed',
  args: {
    facts: mcpStatusFacts,
    mcp: {
      unavailable: null,
      pending: null,
      error: { server: 'sentry', message: 'spawn sentry-mcp ENOENT' },
      onReconnect: fn(),
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      "Couldn't reconnect sentry: spawn sentry-mcp ENOENT",
    )
  },
}

/** No process runs: Reconnect is there but cannot be pressed, and says why. */
export const Disabled: Story = {
  args: {
    facts: mcpStatusFacts,
    mcp: {
      unavailable:
        'no process is running; the next message starts one and reads its connectors afresh',
      pending: null,
      error: null,
      onReconnect: fn(),
    },
  },
  play: async ({ canvas }) => {
    const reconnect = canvas.getByRole('button', { name: 'Reconnect sentry' })
    // Unavailable with a reason (R2, MAR-3616): focusable, the reason its
    // tooltip and its description, never a native title.
    await expect(reconnect).toHaveAttribute('aria-disabled', 'true')
    await expect(reconnect).toHaveAttribute(
      'data-tooltip',
      'no process is running; the next message starts one and reads its connectors afresh',
    )
    await expect(reconnect).toHaveAccessibleDescription(
      'no process is running; the next message starts one and reads its connectors afresh',
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

export const McpStatusDark: Story = {
  ...McpStatus,
  name: 'MCP status, dark',
  globals: { theme: 'dark' },
}
