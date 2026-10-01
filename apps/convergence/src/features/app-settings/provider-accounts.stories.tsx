import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import type {
  ProviderAccountConnectors,
  ProviderAccountSettingsRow,
} from '@/entities/provider-account'
import {
  ProviderAccountsFields,
  type ProviderAccountsFieldsProps,
} from './provider-accounts.presentational'

const row = (
  fields: Pick<ProviderAccountSettingsRow, 'id' | 'identity'> &
    Partial<ProviderAccountSettingsRow>,
): ProviderAccountSettingsRow => ({
  label: fields.identity,
  showsLabel: false,
  organization: 'Marcin Krawczyk',
  plan: 'Max',
  isDefault: false,
  status: { label: 'connected', tone: 'ok' },
  statusDetail: null,
  notes: [],
  canSetDefault: true,
  lastValidatedAt: '2026-10-01T11:00:00.000Z',
  ...fields,
})

const claudeRows: ProviderAccountSettingsRow[] = [
  row({
    id: 'acct-personal',
    identity: 'marcin@example.com',
    isDefault: true,
    canSetDefault: false,
  }),
  row({
    id: 'acct-work',
    identity: 'marcin@work.example.com',
    label: 'Work',
    showsLabel: true,
    organization: 'Example Corp',
    plan: 'Team',
    status: { label: 'expired', tone: 'warning' },
    statusDetail: 'Sign in again before this account can serve turns.',
    notes: ['2 conversations still point at this account’s old history.'],
  }),
]

const claudeConnectors: ProviderAccountConnectors = {
  providerAccountId: 'acct-personal',
  connectors: [
    {
      name: 'figma',
      status: 'needs-auth',
      statusLabel: 'Needs authorization',
      description: 'Figma Dev Mode MCP',
      needsAuthorization: true,
    },
    {
      name: 'github',
      status: 'ready',
      statusLabel: 'Connected',
      description: 'GitHub',
      needsAuthorization: false,
    },
  ],
  error: null,
  clearedNeedsAuthNotes: ['github'],
}

const base: ProviderAccountsFieldsProps = {
  loginAttempt: null,
  loginCode: '',
  onLoginCodeChange: fn(),
  onSubmitLoginCode: fn(),
  onCancelLogin: fn(),
  providerId: 'claude-code',
  rows: claudeRows,
  settingsWarnings: [],
  lastCheckedAt: '2026-10-01T11:00:00.000Z',
  claudeVersion: '2.4.1',
  isLoading: false,
  busyAccountId: null,
  isEnrolling: false,
  enrolEmail: '',
  enrolLabel: '',
  renamingAccountId: null,
  renameDraft: '',
  confirmingRemovalAccountId: null,
  removalLayout: null,
  privateDeletionAcknowledged: false,
  onPrivateDeletionAcknowledged: fn(),
  expandedConnectorsAccountId: null,
  chatGptApps: null,
  isLoadingChatGptApps: false,
  chatGptSignIns: null,
  isCheckingChatGptSignIns: false,
  chatGptLinkError: null,
  chatGptLinkCopied: false,
  onRefreshChatGptApps: fn(),
  onManageChatGptApp: fn(),
  onBrowseChatGptApps: fn(),
  connectors: null,
  isLoadingConnectors: false,
  authorizingServerName: null,
  message: null,
  error: null,
  onProviderChange: fn(),
  onEnrolEmailChange: fn(),
  onEnrolLabelChange: fn(),
  onEnrol: fn(),
  onStartRename: fn(),
  onRenameDraftChange: fn(),
  onCommitRename: fn(),
  onCancelRename: fn(),
  onSetDefault: fn(),
  onReconnect: fn(),
  onRequestRemove: fn(),
  onConfirmRemove: fn(),
  onCancelRemove: fn(),
  onCheckHealth: fn(),
  onToggleConnectors: fn(),
  onAuthorizeConnector: fn(),
  onConnectLinear: fn(),
}

/** The account card whose heading names this identity. */
const cardOf = (identity: string) => {
  const heading = screen.getByRole('heading', { name: identity })
  return heading.closest('section') as HTMLElement
}

const meta = {
  title: 'Features/AppSettings/ProviderAccounts',
  component: ProviderAccountsFields,
  args: base,
  decorators: [
    (Story) => (
      <div className="w-[720px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProviderAccountsFields>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Two Claude accounts, the default one fine and the other expired, each with
 * its actions; below them the form to connect another.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const providers = canvas.getByRole('group', { name: 'Account provider' })
    await expect(
      within(providers).getByRole('button', { name: 'Anthropic' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(
      within(providers).getByRole('button', { name: 'OpenAI' }),
    )
    await expect(args.onProviderChange).toHaveBeenCalledWith('codex')

    const personal = within(cardOf('marcin@example.com'))
    await expect(
      personal.getByRole('button', { name: 'Set default' }),
    ).toBeDisabled()
    await userEvent.click(personal.getByRole('button', { name: 'Rename' }))
    await expect(args.onStartRename).toHaveBeenCalledWith(
      'acct-personal',
      'marcin@example.com',
    )

    const work = within(cardOf('marcin@work.example.com'))
    await expect(work.getByText(/Sign in again before/)).toBeVisible()
    await userEvent.click(work.getByRole('button', { name: 'Set default' }))
    await expect(args.onSetDefault).toHaveBeenCalledWith('acct-work')
    await userEvent.click(work.getByRole('button', { name: 'Reconnect' }))
    await expect(args.onReconnect).toHaveBeenCalledWith('acct-work')
    await userEvent.click(work.getByRole('button', { name: 'Remove' }))
    await expect(args.onRequestRemove).toHaveBeenCalledWith('acct-work')
    await userEvent.click(work.getByRole('button', { name: 'Connectors' }))
    await expect(args.onToggleConnectors).toHaveBeenCalledWith('acct-work')

    await expect(
      canvas.getByRole('button', { name: 'Connect Anthropic' }),
    ).toBeDisabled()
    await userEvent.type(canvas.getByLabelText('Account email'), 'm')
    await expect(args.onEnrolEmailChange).toHaveBeenCalledWith('m')
    await userEvent.click(canvas.getByRole('button', { name: 'Check now' }))
    await expect(args.onCheckHealth).toHaveBeenCalledOnce()
  },
}

/** Connecting a Claude account: the email is in, so Connect can go. */
export const Enrol: Story = {
  args: { enrolEmail: 'marcin@studio.example.com', enrolLabel: 'Studio' },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByLabelText('Account label (optional)')).toHaveValue(
      'Studio',
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Connect Anthropic' }),
    )
    await expect(args.onEnrol).toHaveBeenCalledOnce()
  },
}

/**
 * Busy, signing in: the sign-in's progress is a status, with the page to open
 * and its link to copy, and every other action waits.
 */
export const Busy: Story = {
  args: {
    isEnrolling: true,
    enrolEmail: 'marcin@studio.example.com',
    loginAttempt: {
      id: 'login-1',
      providerId: 'claude-code',
      accountId: null,
      kind: 'enrol',
      state: 'waiting-browser',
      active: true,
      authorizationUrl: 'https://claude.ai/oauth/authorize?state=story',
      message: 'Finish signing in in your browser.',
      startedAt: '2026-10-01T12:00:00.000Z',
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    const signIn = canvas.getByRole('region', { name: 'Anthropic sign-in' })
    await expect(within(signIn).getByRole('status')).toHaveTextContent(
      'Finish signing in in your browser.',
    )
    await expect(
      within(signIn).getByRole('link', { name: 'Open sign-in page' }),
    ).toHaveAttribute('href', 'https://claude.ai/oauth/authorize?state=story')
    await expect(
      canvas.getByRole('button', { name: 'Sign-in in progress...' }),
    ).toBeDisabled()
    await expect(
      within(cardOf('marcin@example.com')).getByRole('button', {
        name: 'Rename',
      }),
    ).toBeDisabled()
    await userEvent.click(
      within(signIn).getByRole('button', { name: 'Cancel sign-in' }),
    )
    await expect(args.onCancelLogin).toHaveBeenCalledOnce()
  },
}

/** Signing in with a code: paste it, and Submit code sends it. */
export const SignInCode: Story = {
  name: 'Sign-in code',
  args: {
    loginCode: 'abc-123',
    loginAttempt: {
      id: 'login-2',
      providerId: 'claude-code',
      accountId: 'acct-work',
      kind: 'reconnect',
      state: 'waiting-code',
      active: true,
      authorizationUrl: null,
      message: 'Paste the code the browser shows.',
      startedAt: '2026-10-01T12:00:00.000Z',
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    const code = canvas.getByLabelText('Authorization code')
    await userEvent.type(code, '4')
    await expect(args.onLoginCodeChange).toHaveBeenCalledWith('abc-1234')
    await userEvent.click(canvas.getByRole('button', { name: 'Submit code' }))
    await expect(args.onSubmitLoginCode).toHaveBeenCalledOnce()
  },
}

/** Renaming: a labelled field in the card, Save label and Cancel. */
export const Rename: Story = {
  args: { renamingAccountId: 'acct-work', renameDraft: 'Work (Example)' },
  play: async ({ args, canvas, userEvent }) => {
    const field = canvas.getByRole('textbox', {
      name: 'Label for marcin@work.example.com',
    })
    await userEvent.type(field, '!')
    await expect(args.onRenameDraftChange).toHaveBeenCalledWith(
      'Work (Example)!',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Save label' }))
    await expect(args.onCommitRename).toHaveBeenCalledOnce()
    const work = within(cardOf('marcin@work.example.com'))
    await userEvent.click(work.getByRole('button', { name: 'Cancel' }))
    await expect(args.onCancelRename).toHaveBeenCalledOnce()
  },
}

/**
 * Removing an account that holds private history: the deletion waits until
 * the box that names the files is ticked.
 */
export const ConfirmRemoval: Story = {
  name: 'Confirm removal',
  args: {
    confirmingRemovalAccountId: 'acct-work',
    removalLayout: {
      entries: [],
      fullyShared: false,
      privateEntries: ['projects', 'todos'],
      unreadableEntries: [],
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    const remove = canvas.getByRole('button', {
      name: 'Sign out and delete private history',
    })
    await expect(remove).toBeDisabled()
    await userEvent.click(
      canvas.getByRole('checkbox', { name: /Delete the private files/ }),
    )
    await expect(args.onPrivateDeletionAcknowledged).toHaveBeenCalledWith(true)
    const work = within(cardOf('marcin@work.example.com'))
    await userEvent.click(work.getByRole('button', { name: 'Cancel' }))
    await expect(args.onCancelRemove).toHaveBeenCalledOnce()
  },
}

/** Acknowledged: the deletion can go, and says it deletes the history. */
export const ConfirmRemovalAcknowledged: Story = {
  name: 'Confirm removal, acknowledged',
  args: {
    ...ConfirmRemoval.args,
    privateDeletionAcknowledged: true,
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Sign out and delete private history',
      }),
    )
    await expect(args.onConfirmRemove).toHaveBeenCalledWith('acct-work', true)
  },
}

/**
 * A Claude account's connectors: one to authorize, one connected, the note
 * that a stale "needs sign-in" was cleared, and Connect Linear.
 */
export const Connectors: Story = {
  args: {
    expandedConnectorsAccountId: 'acct-personal',
    connectors: claudeConnectors,
  },
  play: async ({ args, userEvent }) => {
    const personal = within(cardOf('marcin@example.com'))
    await expect(
      personal.getByRole('button', { name: 'Connectors' }),
    ).toHaveAttribute('aria-expanded', 'true')
    await expect(personal.getByRole('status')).toHaveTextContent(
      'Cleared Claude\'s "needs sign-in" note for "github"',
    )
    await expect(personal.getByText(/Figma keeps one sign-in/)).toBeVisible()
    await userEvent.click(personal.getByRole('button', { name: 'Authorize' }))
    await expect(args.onAuthorizeConnector).toHaveBeenCalledWith(
      'acct-personal',
      'figma',
    )
    await userEvent.click(
      personal.getByRole('button', { name: 'Connect Linear' }),
    )
    await expect(args.onConnectLinear).toHaveBeenCalledWith('acct-personal')
  },
}

/** Busy, authorizing: the server's button waits for the browser. */
export const Authorizing: Story = {
  name: 'Busy, authorizing',
  args: {
    expandedConnectorsAccountId: 'acct-personal',
    connectors: claudeConnectors,
    authorizingServerName: 'figma',
  },
  play: async ({ canvas }) => {
    await expect(
      within(cardOf('marcin@example.com')).getByRole('button', {
        name: 'Waiting for browser...',
      }),
    ).toBeDisabled()
    await expect(
      canvas.getByRole('button', { name: 'Connect Anthropic' }),
    ).toBeDisabled()
  },
}

/**
 * A Codex account's connectors: its ChatGPT apps with their observed
 * sign-ins, each managed from a menu, then the servers on this Mac.
 */
export const ChatGptApps: Story = {
  name: 'ChatGPT apps',
  args: {
    providerId: 'codex',
    rows: [
      row({
        id: 'codex-pro',
        identity: 'marcin@example.com',
        organization: 'Personal',
        plan: 'Pro',
        isDefault: true,
        canSetDefault: false,
      }),
    ],
    claudeVersion: null,
    expandedConnectorsAccountId: 'codex-pro',
    chatGptApps: {
      providerAccountId: 'codex-pro',
      apps: [
        { id: 'figma', name: 'Figma', state: 'available' },
        { id: 'linear', name: 'Linear', state: 'available' },
        { id: 'gmail', name: 'Gmail', state: 'off' },
      ],
      requiresChatGpt: false,
      error: null,
    },
    chatGptSignIns: {
      providerAccountId: 'codex-pro',
      checkedAt: null,
      signIns: [
        {
          appId: 'figma',
          status: 'needs-sign-in',
          account: 'marcin@example.com',
          reason: null,
        },
        {
          appId: 'linear',
          status: 'signed-in',
          account: 'marcin@example.com',
          reason: null,
        },
      ],
      servers: [
        {
          server: 'github',
          status: 'signed-in',
          account: 'marckraw',
          reason: null,
        },
      ],
      error: null,
    },
    chatGptLinkCopied: true,
    connectors: {
      providerAccountId: 'codex-pro',
      connectors: [
        {
          name: 'github',
          status: 'ready',
          statusLabel: 'Authorized',
          description: 'GitHub',
          needsAuthorization: false,
        },
      ],
      error: null,
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    const fromChatGpt = canvas.getByRole('region', { name: 'From ChatGPT' })
    await expect(
      within(fromChatGpt).getByText(
        'Needs sign-in again on ChatGPT (linked to marcin@example.com)',
      ),
    ).toBeVisible()
    await expect(within(fromChatGpt).getByText('Turned off')).toBeVisible()
    await expect(within(fromChatGpt).getByRole('status')).toHaveTextContent(
      'Link copied.',
    )
    await userEvent.click(
      within(fromChatGpt).getByRole('button', {
        name: 'Sign in again on ChatGPT',
      }),
    )
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Open in default browser' }),
    )
    await expect(args.onManageChatGptApp).toHaveBeenCalledWith(
      'codex-pro',
      'figma',
      'open',
    )
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await userEvent.click(
      within(fromChatGpt).getByRole('button', { name: 'Refresh' }),
    )
    await expect(args.onRefreshChatGptApps).toHaveBeenCalledOnce()
    await expect(canvas.getByText('Signed in as marckraw')).toBeVisible()
    await expect(canvas.queryByLabelText('Account email')).toBeNull()
  },
}

/** Busy, loading: the accounts are still being read. */
export const Loading: Story = {
  name: 'Busy, loading',
  args: { isLoading: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Loading accounts...')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Check now' }),
    ).toBeDisabled()
  },
}

/**
 * Failed: the last action's error, and a shared setting that outranks the
 * account choice, each an alert.
 */
export const Failed: Story = {
  args: {
    error: 'Could not reach Claude Code: the CLI exited with code 1.',
    settingsWarnings: [
      {
        kind: 'api-key-helper',
        key: 'apiKeyHelper',
        message:
          '~/.claude/settings.json sets apiKeyHelper, so every account signs in with that key instead of its own.',
      },
    ],
  },
  play: async ({ canvas }) => {
    const alerts = canvas.getAllByRole('alert')
    await expect(alerts).toHaveLength(2)
    await expect(alerts[0]).toHaveTextContent(
      'Shared settings outrank account selection',
    )
    await expect(alerts[1]).toHaveTextContent('the CLI exited with code 1')
  },
}

/** Empty: no account enrolled, so the Mac's own login is used. */
export const Empty: Story = {
  args: { rows: [], message: 'Account removed.' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/No Anthropic accounts enrolled/),
    ).toBeVisible()
    await expect(canvas.getByText('Account removed.')).toBeVisible()
  },
}

export const Dark: Story = {
  ...Connectors,
  name: 'Dark',
  globals: { theme: 'dark' },
}
