import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { ExecutionHostFields } from './execution-host-fields.presentational'

const meta = {
  title: 'Features/AppSettings/ExecutionHostFields',
  component: ExecutionHostFields,
  args: {
    endpointId: 'kuba-vps',
    displayName: 'kuba-vps',
    labelDraft: 'kuba-vps',
    remoteBaseUrlDraft: 'https://daemon.kuba.example.com',
    remoteBaseUrlError: null,
    actionBlocks: { token: null, connection: null },
    removalBlock: null,
    credentialStatus: {
      providerId: 'execution-host-daemon',
      configured: true,
      source: 'keychain',
      storage: 'keychain',
      account: 'kuba-vps',
      service: 'convergence.execution-host-daemon',
      error: null,
    },
    daemonTokenDraft: '',
    showDaemonToken: false,
    isCredentialSaving: false,
    isConnectionTesting: false,
    credentialMessage: null,
    credentialError: null,
    connectionResult: null,
    removalWarning: null,
    isRemovalPending: false,
    onLabelChange: fn(),
    onRemoteBaseUrlChange: fn(),
    onDaemonTokenChange: fn(),
    onToggleDaemonTokenVisibility: fn(),
    onSaveDaemonToken: fn(),
    onDeleteDaemonToken: fn(),
    onTestDaemonConnection: fn(),
    onRequestRemove: fn(),
    onConfirmRemove: fn(),
    onCancelRemove: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ExecutionHostFields>

export default meta

type Story = StoryObj<typeof meta>

/**
 * One saved Endpoint: its name, its address, its token in the Keychain, and
 * every button named for the Endpoint it acts on.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByText('Configured in Keychain, token hidden'),
    ).toBeVisible()
    await userEvent.type(canvas.getByLabelText('Endpoint name'), '2')
    await expect(args.onLabelChange).toHaveBeenCalledWith('kuba-vps2')
    await userEvent.type(canvas.getByLabelText('Execution host token'), 't')
    await expect(args.onDaemonTokenChange).toHaveBeenCalledWith('t')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Show token for kuba-vps' }),
    )
    await expect(args.onToggleDaemonTokenVisibility).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Test connection for kuba-vps' }),
    )
    await expect(args.onTestDaemonConnection).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove token for kuba-vps' }),
    )
    await expect(args.onDeleteDaemonToken).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove endpoint kuba-vps' }),
    )
    await expect(args.onRequestRemove).toHaveBeenCalledOnce()
  },
}

/** A new token typed in: Replace token saves it. */
export const ReplaceToken: Story = {
  name: 'Replace token',
  args: { daemonTokenDraft: 'cvg_secret', showDaemonToken: true },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByLabelText('Execution host token')).toHaveValue(
      'cvg_secret',
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Save token for kuba-vps' }),
    )
    await expect(args.onSaveDaemonToken).toHaveBeenCalledOnce()
  },
}

/** Connected: what the daemon says about itself and its providers. */
export const Connected: Story = {
  args: {
    credentialMessage: 'Token saved to the Keychain.',
    connectionResult: {
      ok: true,
      state: 'connected',
      baseUrl: 'https://daemon.kuba.example.com',
      message: 'Connected to kuba-vps.',
      providers: [
        {
          providerId: 'claude-code',
          name: 'Claude Code',
          available: true,
          authenticated: true,
          supportsContinuation: true,
          models: [],
        },
        {
          providerId: 'codex',
          name: 'Codex',
          available: true,
          authenticated: false,
          supportsContinuation: true,
          models: [],
        },
      ],
      daemon: {
        version: '0.41.0',
        apiVersion: '3',
        protocolCapabilities: ['sessions', 'turns', 'approvals'],
      },
    },
  },
  play: async ({ canvas }) => {
    const result = canvas.getByRole('status')
    await expect(result).toHaveTextContent('Connected to kuba-vps.')
    await expect(result).toHaveTextContent('agents-daemon 0.41.0 · API 3')
    await expect(result).toHaveTextContent(
      'Providers: Claude Code, Codex (unavailable)',
    )
  },
}

/** Failed: a bad address is marked invalid, and the test's refusal is an alert. */
export const Failed: Story = {
  args: {
    remoteBaseUrlDraft: 'daemon.kuba',
    remoteBaseUrlError: 'Use a full URL, starting with https://.',
    credentialError: 'The Keychain refused the token: user canceled.',
    connectionResult: {
      ok: false,
      state: 'auth-failed',
      baseUrl: 'https://daemon.kuba.example.com',
      message: 'The daemon refused the token (401).',
      providers: null,
      daemon: null,
    },
  },
  play: async ({ canvas }) => {
    const url = canvas.getByLabelText('Execution host URL')
    await expect(url).toHaveAttribute('aria-invalid', 'true')
    await expect(url).toHaveAccessibleDescription(
      'Use a full URL, starting with https://.',
    )
    await expect(canvas.getAllByRole('alert')).toHaveLength(3)
  },
}

/** Busy: testing the connection, and saving the token. */
export const Busy: Story = {
  args: { isConnectionTesting: true, isCredentialSaving: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Test connection for kuba-vps' }),
    ).toHaveTextContent('Testing...')
    await expect(
      canvas.getByRole('button', { name: 'Test connection for kuba-vps' }),
    ).toBeDisabled()
    await expect(canvas.getByLabelText('Execution host token')).toBeDisabled()
  },
}

/**
 * Disabled: a row not saved yet has no token or connection to act on, and
 * says why; Remove waits while sessions still use it.
 */
export const Disabled: Story = {
  args: {
    credentialStatus: null,
    actionBlocks: {
      token: 'Save settings first — this endpoint does not exist yet.',
      connection: 'Save settings first — this endpoint does not exist yet.',
    },
    removalBlock: '3 sessions still run on this endpoint.',
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        'Save settings first — this endpoint does not exist yet.',
      ),
    ).toBeVisible()
    // Remove and Test connection are unavailable with a reason (R2,
    // MAR-3616): focusable, and each says why.
    const remove = canvas.getByRole('button', {
      name: 'Remove endpoint kuba-vps',
    })
    await expect(remove).toHaveAttribute('aria-disabled', 'true')
    await expect(remove).toHaveAccessibleDescription(
      '3 sessions still run on this endpoint.',
    )
    await expect(
      canvas.getByRole('button', { name: 'Test connection for kuba-vps' }),
    ).toHaveAccessibleDescription(
      'Save settings first — this endpoint does not exist yet.',
    )
    await expect(
      canvas.getByRole('button', { name: 'Save token for kuba-vps' }),
    ).toBeDisabled()
  },
}

/** Removing: the warning, then Remove anyway or Keep it. */
export const ConfirmRemoval: Story = {
  name: 'Confirm removal',
  args: {
    isRemovalPending: true,
    removalWarning:
      'Removing kuba-vps also forgets its token. Sessions that ran there keep their history.',
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'also forgets its token',
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Keep endpoint kuba-vps' }),
    )
    await expect(args.onCancelRemove).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Confirm removing endpoint kuba-vps',
      }),
    )
    await expect(args.onConfirmRemove).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Connected,
  name: 'Dark',
  globals: { theme: 'dark' },
}
