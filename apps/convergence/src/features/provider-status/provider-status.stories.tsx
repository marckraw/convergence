import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import { Button } from '@convergence/ui'
import type { ProviderAccount } from '@/entities/provider-account'
import type { ProviderStatusInfo } from '@/entities/session'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { ProviderStatusDialog } from './provider-status.presentational'

const claudeCode: ProviderStatusInfo = {
  id: 'claude-code',
  name: 'Claude Code',
  vendorLabel: 'Anthropic',
  availability: 'available',
  statusLabel: 'Ready',
  binaryPath: '/Users/me/.nvm/versions/node/v24.15.0/bin/claude',
  install: {
    manager: 'npm',
    realBinaryPath:
      '/Users/me/.nvm/versions/node/v24.15.0/lib/node_modules/@anthropic-ai/claude-code/cli.js',
    packageName: '@anthropic-ai/claude-code',
    packageDirectory:
      '/Users/me/.nvm/versions/node/v24.15.0/lib/node_modules/@anthropic-ai/claude-code',
    prefixDirectory: '/Users/me/.nvm/versions/node/v24.15.0',
    npmPath: '/Users/me/.nvm/versions/node/v24.15.0/bin/npm',
    nodePath: '/Users/me/.nvm/versions/node/v24.15.0/bin/node',
    nodeVersion: 'v24.15.0',
    brewPrefix: null,
    formulaName: null,
  },
  version: '2.4.1',
  reason: null,
  update: {
    currentVersion: '2.4.1',
    latestVersion: '2.5.0',
    status: 'outdated',
    packageName: '@anthropic-ai/claude-code',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    updateCommand: 'npm install -g @anthropic-ai/claude-code@latest',
    manualUpdateCommand: 'npm install -g @anthropic-ai/claude-code@latest',
    automaticUpdateCommand: 'npm install -g @anthropic-ai/claude-code@latest',
    updateCapability: 'automatic',
    updateStrategy: 'npm-global',
    checkError: null,
  },
}

const codex: ProviderStatusInfo = {
  id: 'codex',
  name: 'Codex',
  vendorLabel: 'OpenAI',
  availability: 'available',
  statusLabel: 'Ready',
  binaryPath: '/opt/homebrew/bin/codex',
  install: {
    manager: 'homebrew',
    realBinaryPath: '/opt/homebrew/Cellar/codex/0.147.0/bin/codex',
    packageName: null,
    packageDirectory: null,
    prefixDirectory: null,
    npmPath: null,
    nodePath: null,
    nodeVersion: null,
    brewPrefix: '/opt/homebrew',
    formulaName: 'codex',
  },
  version: '0.147.0',
  reason: null,
  update: {
    currentVersion: '0.147.0',
    latestVersion: '0.147.0',
    status: 'current',
    packageName: null,
    installCommand: 'brew install codex',
    updateCommand: 'brew upgrade codex',
    manualUpdateCommand: 'brew upgrade codex',
    automaticUpdateCommand: 'brew upgrade codex',
    updateCapability: 'automatic',
    updateStrategy: 'brew-upgrade',
    checkError: null,
  },
}

const pi: ProviderStatusInfo = {
  id: 'pi',
  name: 'Pi',
  vendorLabel: 'Pi',
  availability: 'unavailable',
  statusLabel: 'Not installed',
  binaryPath: null,
  install: null,
  version: null,
  reason: 'pi was not found on your shell PATH.',
  update: {
    currentVersion: null,
    latestVersion: '1.8.2',
    status: 'unknown',
    packageName: '@mariozechner/pi',
    installCommand: 'npm install -g @mariozechner/pi',
    updateCommand: 'npm install -g @mariozechner/pi@latest',
    manualUpdateCommand: 'npm install -g @mariozechner/pi@latest',
    automaticUpdateCommand: null,
    updateCapability: 'manual',
    updateStrategy: null,
    checkError: null,
  },
}

const accounts: ProviderAccount[] = [
  {
    id: 'account-personal',
    providerId: 'claude-code',
    label: 'Personal',
    authKind: 'subscription-oauth',
    email: 'me@example.com',
    orgId: null,
    plan: 'max',
    configDir: '/Users/me/.claude',
    credentialDir: '/Users/me/.claude',
    executionHostId: 'local',
    isDefault: true,
    status: 'connected',
    lastValidatedAt: '2026-10-01T13:00:00.000Z',
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-10-01T13:00:00.000Z',
  },
  {
    id: 'account-work',
    providerId: 'claude-code',
    label: 'Work',
    authKind: 'setup-token',
    email: 'me@work.example',
    orgId: 'org-7f2c',
    plan: 'team',
    configDir: '/Users/me/.claude-work',
    credentialDir: '/Users/me/.claude-work',
    executionHostId: 'local',
    isDefault: false,
    status: 'expired',
    lastValidatedAt: '2026-09-20T13:00:00.000Z',
    createdAt: '2026-08-02T09:00:00.000Z',
    updatedAt: '2026-09-20T13:00:00.000Z',
  },
]

/** The dialog with its open state held the way the status bar holds it. */
function HeldDialog(props: ComponentProps<typeof ProviderStatusDialog>) {
  const [open, setOpen] = useState(props.open)
  return (
    <ProviderStatusDialog
      {...props}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        props.onOpenChange(next)
      }}
    />
  )
}

/** The dialog, once it has finished opening. */
const openedDialog = async () => {
  const dialog = await screen.findByRole('dialog', { name: 'Providers' })
  await waitFor(() => expect(dialog).toBeVisible())
  return dialog
}

const meta = {
  title: 'Features/ProviderStatus/ProviderStatus',
  component: ProviderStatusDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    trigger: (
      <Button type="button" variant="outline" size="sm">
        Providers
      </Button>
    ),
    statuses: [claudeCode, codex, pi],
    runtimeInfo: {
      appNodeVersion: '22.20.0',
      electronVersion: '39.2.1',
      appVersion: '0.98.0',
      isPackaged: true,
      platform: 'darwin',
      arch: 'arm64',
    },
    providerAccounts: accounts,
    providerAccountHealth: {
      checkedAt: '2026-10-01T13:00:00.000Z',
      claudeVersion: '2.4.1',
      accounts: [
        {
          accountId: 'account-work',
          label: 'Work',
          email: 'me@work.example',
          outcome: 'identity-unknown',
          status: 'expired',
          detail: 'The setup token expired on 20 September.',
          unknownEntries: ['statsig', 'todos.bak'],
          missingLinks: [],
        },
      ],
      settingsWarnings: [],
    },
    isLoading: false,
    updatingProviderId: null,
    error: null,
    message: null,
    onRefresh: fn(),
    onUpdateProvider: fn(),
  },
  render: (args) => <HeldDialog {...args} />,
} satisfies Meta<typeof ProviderStatusDialog>

export default meta

type Story = StoryObj<typeof meta>

/** Every provider CLI, its version and install, and the Claude accounts. */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openedDialog()
    await expect(
      within(dialog).getByText('2 of 3 providers available'),
    ).toBeVisible()
    await expect(within(dialog).getByText('2 Claude accounts')).toBeVisible()
    await expect(
      within(dialog).getByText('npm install -g @mariozechner/pi'),
    ).toBeVisible()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Update' }),
    )
    await expect(args.onUpdateProvider).toHaveBeenCalledWith('claude-code')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Refresh' }),
    )
    await expect(args.onRefresh).toHaveBeenCalledOnce()
  },
}

/** Closed: the trigger opens it. */
export const Closed: Story = {
  args: { open: false },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Providers' }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(true)
    await openedDialog()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/** Checking for the first time: nothing to list yet, Refresh waits. */
export const Busy: Story = {
  args: { statuses: [], isLoading: true },
  play: async () => {
    const dialog = await openedDialog()
    await expect(
      within(dialog).getByText('Checking installed providers…'),
    ).toBeVisible()
    await expect(
      within(dialog).getByRole('button', { name: 'Refresh' }),
    ).toBeDisabled()
  },
}

/** Updating one CLI: every Update waits for it. */
export const Updating: Story = {
  args: { updatingProviderId: 'claude-code' },
  parameters: {
    a11y: {
      config: {
        rules: [
          // a11y-known: with every Update waiting, the dialog's scrolling body holds nothing focusable and is not focusable itself, so a keyboard cannot scroll it — fixed by the sweep (DS4)
          { id: 'scrollable-region-focusable', enabled: false },
        ],
      },
    },
  },
  play: async () => {
    const dialog = await openedDialog()
    await expect(
      within(dialog).getByRole('button', { name: 'Updating' }),
    ).toBeDisabled()
  },
}

/** The check failed. */
export const Failed: Story = {
  args: {
    statuses: [],
    error: 'Could not read your shell PATH: zsh exited with code 127.',
  },
  play: async () => {
    const dialog = await openedDialog()
    await expect(
      within(dialog).getByText(/zsh exited with code 127/),
    ).toBeVisible()
  },
}

/** No providers and no accounts. */
export const Empty: Story = {
  args: {
    statuses: [],
    providerAccounts: [],
    providerAccountHealth: null,
    runtimeInfo: null,
  },
  play: async () => {
    const dialog = await openedDialog()
    await expect(
      within(dialog).getByText('0 of 0 providers available'),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

export const ReducedMotion: Story = {
  ...Closed,
  globals: { motion: 'reduced' },
}
