import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import type { ConnectionsOverviewRow } from '@/entities/provider-account'
import { ConnectionsOverview } from './connections-overview.presentational'

const rows: ConnectionsOverviewRow[] = [
  {
    accountId: 'codex-pro',
    provider: 'OpenAI',
    identity: 'marcin@example.com',
    state: 'checked',
    paths: [
      {
        service: 'figma',
        via: 'ChatGPT app',
        state: 'needs-sign-in',
        account: 'marcin@example.com',
      },
      {
        service: 'linear',
        via: 'ChatGPT app',
        state: 'works',
        account: 'marcin@example.com',
      },
      {
        service: 'github',
        via: 'server on this Mac',
        state: 'unchecked',
        account: null,
      },
    ],
    error: null,
  },
  {
    accountId: 'claude-max',
    provider: 'Claude',
    identity: 'marcin@work.example.com',
    state: 'checked',
    paths: [
      {
        service: 'figma',
        via: 'claude.ai connector',
        state: 'works',
        account: 'marcin@work.example.com',
      },
    ],
    error: 'The Claude Code plugin list could not be read.',
  },
  {
    accountId: 'claude-old',
    provider: 'Claude',
    identity: 'old@example.com',
    state: 'not-connected',
    paths: [],
    error: null,
  },
]

const meta = {
  title: 'Features/AppSettings/ConnectionsOverview',
  component: ConnectionsOverview,
  args: {
    rows,
    checkedAt: null,
    isChecking: false,
    onCheckAll: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[720px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConnectionsOverview>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A table: one row per account, one column per service, each cell the paths
 * that reach it and what their checks saw.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const region = canvas.getByRole('region', {
      name: 'Who can reach Figma, Linear and GitHub',
    })
    const table = within(region).getByRole('table')
    await expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Account', 'Figma', 'Linear', 'GitHub'])
    const codex = within(table).getByRole('row', { name: /marcin@example.com/ })
    await expect(
      within(codex).getByText('Needs sign-in again · ChatGPT app'),
    ).toBeVisible()
    await expect(
      within(table).getByText('Account not connected, so not checked'),
    ).toBeVisible()
    await userEvent.click(
      within(region).getByRole('button', { name: 'Check all accounts' }),
    )
    await expect(args.onCheckAll).toHaveBeenCalledOnce()
  },
}

/** Busy: every row is being checked, and the button says so. */
export const Busy: Story = {
  args: {
    isChecking: true,
    rows: rows.map((row) => ({ ...row, state: 'checking', paths: [] })),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Checking all accounts…' }),
    ).toBeDisabled()
    await expect(canvas.getAllByText('Checking…')).toHaveLength(3)
  },
}

/** Failed: a check that could not run says why. */
export const Failed: Story = {
  args: {
    rows: [
      {
        accountId: 'codex-pro',
        provider: 'OpenAI',
        identity: 'marcin@example.com',
        state: 'failed',
        paths: [],
        error: 'Codex did not answer within 20 seconds.',
      },
    ],
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "Couldn't check: Codex did not answer within 20 seconds.",
      ),
    ).toBeVisible()
  },
}

/** Empty: nothing checked yet, so no table. */
export const Empty: Story = {
  args: { rows: [] },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('table')).toBeNull()
    await expect(
      canvas.getByRole('button', { name: 'Check all accounts' }),
    ).toBeEnabled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
