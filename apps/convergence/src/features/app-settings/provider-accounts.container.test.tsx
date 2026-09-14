import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProviderAccount,
  ProviderAccountHealth,
} from '@/entities/provider-account'
import { useDialogStore } from '@/entities/dialog'
import { ProviderAccountsContainer } from './provider-accounts.container'

function account(overrides: Partial<ProviderAccount> = {}): ProviderAccount {
  return {
    id: 'acct-a',
    providerId: 'claude-code',
    label: 'Personal Max',
    authKind: 'subscription-oauth',
    email: 'a@example.com',
    orgId: 'org-a',
    plan: 'max',
    configDir: '/config',
    credentialDir: '/credentials',
    executionHostId: 'local',
    isDefault: false,
    status: 'connected',
    lastValidatedAt: null,
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    ...overrides,
  }
}

function health(
  overrides: Partial<ProviderAccountHealth> = {},
): ProviderAccountHealth {
  return {
    checkedAt: '2026-08-04T01:00:00.000Z',
    claudeVersion: '2.1.220',
    accounts: [],
    settingsWarnings: [],
    ...overrides,
  }
}

const providerAccounts = {
  list: vi.fn(),
  enrol: vi.fn(),
  reconnect: vi.fn(),
  remove: vi.fn(),
  setDefault: vi.fn(),
  rename: vi.fn(),
  sweepOrphans: vi.fn(),
  scanSharedSettings: vi.fn(),
  attest: vi.fn(),
  health: vi.fn(),
  listConnectors: vi.fn(),
  authorizeConnector: vi.fn(),
}

describe('ProviderAccountsContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDialogStore.getState().close()
    providerAccounts.list.mockResolvedValue([account()])
    providerAccounts.health.mockResolvedValue(health())
    providerAccounts.listConnectors.mockResolvedValue({
      providerAccountId: 'acct-a',
      connectors: [
        {
          name: 'linear',
          status: 'needs-auth',
          statusLabel: '! Needs authentication',
          description: 'https://mcp.linear.app/sse',
          needsAuthorization: true,
        },
        {
          name: 'github',
          status: 'ready',
          statusLabel: '✓ Connected',
          description: 'https://api.github.com/mcp',
          needsAuthorization: false,
        },
      ],
      error: null,
    })
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      providerAccounts,
    }
  })

  it('lists accounts by identity rather than by slot', async () => {
    render(<ProviderAccountsContainer />)

    expect(await screen.findByText('a@example.com')).toBeInTheDocument()
    expect(screen.getByText(/Personal Max/)).toBeInTheDocument()
    expect(screen.getByText(/Organization org-a/)).toBeInTheDocument()
  })

  it('separates OpenAI accounts and hides Claude-only connector actions', async () => {
    providerAccounts.list.mockResolvedValue([
      account(),
      account({
        id: 'codex-a',
        providerId: 'codex',
        email: 'openai@example.com',
        plan: 'team',
      }),
    ])
    render(<ProviderAccountsContainer />)
    await screen.findByText('a@example.com')
    expect(screen.queryByText('openai@example.com')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'OpenAI' }))
    expect(screen.getByText('openai@example.com')).toBeInTheDocument()
    expect(screen.getByText(/Workspace org-a · team/)).toBeInTheDocument()
    expect(screen.queryByText('a@example.com')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Connectors' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Account email')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OpenAI' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Anthropic' }))
    expect(
      screen.getByRole('button', { name: 'Connectors' }),
    ).toBeInTheDocument()
  })

  it('enrols OpenAI without an email hint and displays the returned identity', async () => {
    providerAccounts.enrol.mockResolvedValue({
      account: account({
        id: 'codex-a',
        providerId: 'codex',
        email: 'signed-in@example.com',
      }),
      warnings: [],
    })
    render(<ProviderAccountsContainer />)
    await screen.findByText('a@example.com')
    fireEvent.change(screen.getByLabelText('Account email'), {
      target: { value: 'claude@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'OpenAI' }))
    fireEvent.change(screen.getByLabelText('Account label (optional)'), {
      target: { value: ' Work ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Connect OpenAI' }))

    await waitFor(() =>
      expect(providerAccounts.enrol).toHaveBeenCalledWith({
        providerId: 'codex',
        email: '',
        label: 'Work',
      }),
    )
    expect(
      await screen.findByText('Enrolled signed-in@example.com.'),
    ).toBeInTheDocument()
  })

  it('keeps the provider and other credential actions locked during browser login', async () => {
    let finishLogin!: (value: unknown) => void
    providerAccounts.enrol.mockReturnValue(
      new Promise((resolve) => {
        finishLogin = resolve
      }),
    )
    providerAccounts.list.mockResolvedValue([
      account({ id: 'codex-a', providerId: 'codex' }),
    ])
    render(<ProviderAccountsContainer />)
    await screen.findByText(/No Anthropic accounts enrolled/)
    fireEvent.click(screen.getByRole('button', { name: 'OpenAI' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect OpenAI' }))

    expect(
      screen.getByRole('button', { name: 'Waiting for browser...' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Anthropic' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
    finishLogin({ account: account({ providerId: 'codex' }), warnings: [] })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Anthropic' })).toBeEnabled(),
    )
  })

  it('does not show Claude credential overrides as an OpenAI health warning', async () => {
    providerAccounts.health.mockResolvedValue(
      health({
        settingsWarnings: [
          {
            kind: 'credential-env-key',
            key: 'ANTHROPIC_API_KEY',
            message: 'Shared settings export ANTHROPIC_API_KEY.',
          },
        ],
      }),
    )
    render(<ProviderAccountsContainer />)
    await screen.findByText(/Shared settings export ANTHROPIC_API_KEY/)
    fireEvent.click(screen.getByRole('button', { name: 'OpenAI' }))
    expect(
      screen.queryByText(/Shared settings export ANTHROPIC_API_KEY/),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Claude Code 2.1.220/)).not.toBeInTheDocument()
  })

  it('shows a failed OpenAI login without claiming that an account was connected', async () => {
    providerAccounts.enrol.mockRejectedValue(
      new Error('Login completed but the Codex home reported no identity.'),
    )
    render(<ProviderAccountsContainer />)
    await screen.findByText('a@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'OpenAI' }))
    expect(
      screen.getByText(
        'No OpenAI accounts enrolled. Convergence uses the Codex login already on this Mac. Connect an account below to manage it here.',
      ),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Account label (optional)'), {
      target: { value: 'Unverified OpenAI account' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Connect OpenAI' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Codex home reported no identity',
    )
    expect(screen.getByRole('button', { name: 'Connect OpenAI' })).toBeEnabled()
    expect(screen.queryByText(/^Enrolled/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Unverified OpenAI account' }),
    ).not.toBeInTheDocument()
    expect(providerAccounts.list).toHaveBeenCalledTimes(1)
  })

  it('explains the current Codex history ownership before removing an OpenAI account', async () => {
    providerAccounts.list.mockResolvedValue([account({ providerId: 'codex' })])
    render(<ProviderAccountsContainer />)
    await screen.findByText(/No Anthropic accounts enrolled/)
    fireEvent.click(screen.getByRole('button', { name: 'OpenAI' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(
      screen.getByText(
        'This signs the account out of Codex and removes its local account directory. Shared native history and Convergence messages remain. Any history stored only in this account directory, including migration backups, is removed.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/Conversations stay — they are shared/),
    ).not.toBeInTheDocument()
    expect(providerAccounts.remove).not.toHaveBeenCalled()
  })

  it('enrols through the surface instead of the developer console', async () => {
    providerAccounts.enrol.mockResolvedValue({
      account: account({ id: 'acct-b', email: 'b@example.com' }),
      warnings: [],
    })

    render(<ProviderAccountsContainer />)
    await screen.findByText('a@example.com')

    fireEvent.change(screen.getByLabelText('Account email'), {
      target: { value: ' b@example.com ' },
    })
    fireEvent.change(screen.getByLabelText('Account label (optional)'), {
      target: { value: 'Work' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Connect Anthropic' }))

    await waitFor(() =>
      expect(providerAccounts.enrol).toHaveBeenCalledWith({
        providerId: 'claude-code',
        email: 'b@example.com',
        label: 'Work',
      }),
    )
    expect(
      await screen.findByText(/Enrolled b@example.com/),
    ).toBeInTheDocument()
  })

  it('says out loud when shared settings can outrank the account just enrolled', async () => {
    providerAccounts.enrol.mockResolvedValue({
      account: account({ id: 'acct-b', email: 'b@example.com' }),
      warnings: [
        {
          kind: 'api-key-helper',
          key: 'apiKeyHelper',
          message: 'A shared apiKeyHelper outranks subscription OAuth.',
        },
      ],
    })

    render(<ProviderAccountsContainer />)
    await screen.findByText('a@example.com')

    fireEvent.change(screen.getByLabelText('Account email'), {
      target: { value: 'b@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Connect Anthropic' }))

    expect(
      await screen.findByText(/shared settings can still outrank it/),
    ).toBeInTheDocument()
  })

  it('renames the label only, never a directory', async () => {
    providerAccounts.rename.mockResolvedValue([account({ label: 'Renamed' })])

    render(<ProviderAccountsContainer />)
    await screen.findByText('a@example.com')

    fireEvent.click(screen.getByRole('button', { name: /Rename/ }))
    fireEvent.change(screen.getByLabelText('Label for a@example.com'), {
      target: { value: 'Renamed' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save label' }))

    await waitFor(() =>
      expect(providerAccounts.rename).toHaveBeenCalledWith('acct-a', 'Renamed'),
    )
  })

  it('asks before signing an account out, because removal is a one-way door', async () => {
    providerAccounts.remove.mockResolvedValue(undefined)

    render(<ProviderAccountsContainer />)
    await screen.findByText('a@example.com')

    fireEvent.click(screen.getByRole('button', { name: /Remove/ }))
    expect(providerAccounts.remove).not.toHaveBeenCalled()
    expect(screen.getByText(/signs the account out/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sign out and remove' }))
    await waitFor(() =>
      expect(providerAccounts.remove).toHaveBeenCalledWith('acct-a'),
    )
  })

  it('reports a refused reconnect instead of pretending it worked', async () => {
    providerAccounts.reconnect.mockRejectedValue(
      new Error('Enrolled as a@example.com but now reports b@example.com.'),
    )

    render(<ProviderAccountsContainer />)
    await screen.findByText('a@example.com')

    fireEvent.click(screen.getByRole('button', { name: /Reconnect/ }))

    expect(
      await screen.findByText(/now reports b@example.com/),
    ).toBeInTheDocument()
  })

  it('shows the preserved disabled account after sign-out fails', async () => {
    providerAccounts.list
      .mockResolvedValueOnce([account()])
      .mockResolvedValue([account({ status: 'unavailable' })])
    providerAccounts.remove.mockRejectedValue(
      new Error('Claude sign-out failed. Retry reconnect or removal.'),
    )
    render(<ProviderAccountsContainer />)
    await screen.findByText('a@example.com')
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out and remove' }))
    expect(await screen.findByText('Disabled')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'sign-out failed',
    )
    expect(
      screen.queryByText('Account signed out and removed.'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('a@example.com')).toBeInTheDocument()
  })

  it.each(['connected', 'unavailable'] as const)(
    'reloads the recorded %s state after a refused OpenAI reconnect',
    async (status) => {
      const codexAccount = account({ providerId: 'codex' })
      providerAccounts.list
        .mockResolvedValueOnce([codexAccount])
        .mockResolvedValue([{ ...codexAccount, status }])
      providerAccounts.reconnect.mockRejectedValue(
        new Error(
          status === 'unavailable'
            ? 'The foreign login was discarded.'
            : 'This account still has active work.',
        ),
      )

      render(<ProviderAccountsContainer />)
      await screen.findByText(/No Anthropic accounts enrolled/)
      fireEvent.click(screen.getByRole('button', { name: 'OpenAI' }))
      expect(screen.getByText('Connected')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))

      await screen.findByRole('alert')
      await waitFor(() =>
        expect(providerAccounts.list).toHaveBeenCalledTimes(2),
      )
      expect(
        screen.getByText(status === 'unavailable' ? 'Disabled' : 'Connected'),
      ).toBeInTheDocument()
      if (status === 'unavailable') {
        expect(screen.queryByText('Connected')).not.toBeInTheDocument()
        expect(
          screen.getByRole('button', { name: 'Set default' }),
        ).toBeDisabled()
      }
      expect(screen.queryByText('Reconnected.')).not.toBeInTheDocument()
    },
  )

  it('shows the health verdicts the attestation net collects', async () => {
    providerAccounts.list.mockResolvedValue([
      account({ status: 'unavailable' }),
    ])
    providerAccounts.health.mockResolvedValue(
      health({
        accounts: [
          {
            accountId: 'acct-a',
            label: 'Personal Max',
            email: 'a@example.com',
            outcome: 'identity-mismatch',
            status: 'unavailable',
            detail: 'Enrolled as a@example.com but now reports b@example.com.',
            unknownEntries: ['credentials-v2'],
            missingLinks: [],
          },
        ],
        settingsWarnings: [
          {
            kind: 'credential-env-key',
            key: 'ANTHROPIC_API_KEY',
            message: 'Shared settings export ANTHROPIC_API_KEY.',
          },
        ],
      }),
    )

    render(<ProviderAccountsContainer />)

    expect(await screen.findByText('Disabled')).toBeInTheDocument()
    expect(screen.getByText(/now reports b@example.com/)).toBeInTheDocument()
    expect(screen.getByText(/credentials-v2/)).toBeInTheDocument()
    expect(
      screen.getByText(/Shared settings export ANTHROPIC_API_KEY/),
    ).toBeInTheDocument()
  })

  it('offers set-default only where it would change anything', async () => {
    providerAccounts.list.mockResolvedValue([account({ isDefault: true })])

    render(<ProviderAccountsContainer />)
    await screen.findByText('a@example.com')

    expect(screen.getByRole('button', { name: /Set default/ })).toBeDisabled()
  })

  it('still renders when the accounts bridge is unavailable', async () => {
    providerAccounts.list.mockRejectedValue(new Error('bridge missing'))
    providerAccounts.health.mockRejectedValue(new Error('bridge missing'))

    render(<ProviderAccountsContainer />)

    expect(await screen.findByText(/bridge missing/)).toBeInTheDocument()
    expect(
      screen.getByText(/No Anthropic accounts enrolled/),
    ).toBeInTheDocument()
  })

  describe('connectors', () => {
    it('asks this account what it can reach, not the machine', async () => {
      // MCP tokens are per credential slot, so the answer is account-shaped.
      render(<ProviderAccountsContainer />)
      await screen.findByText('a@example.com')

      fireEvent.click(screen.getByRole('button', { name: /Connectors/ }))

      await waitFor(() =>
        expect(providerAccounts.listConnectors).toHaveBeenCalledWith('acct-a'),
      )
      expect(await screen.findByText('linear')).toBeInTheDocument()
      expect(screen.getByText('github')).toBeInTheDocument()
    })

    it('offers authorize only where this account still needs it', async () => {
      render(<ProviderAccountsContainer />)
      await screen.findByText('a@example.com')
      fireEvent.click(screen.getByRole('button', { name: /Connectors/ }))
      await screen.findByText('linear')

      expect(screen.getAllByRole('button', { name: 'Authorize' })).toHaveLength(
        1,
      )
    })

    it('authorizes for the account it is showing', async () => {
      // The lying case, at the surface: authorizing must name the account whose
      // row the button lives in, never whichever one is ambient.
      providerAccounts.authorizeConnector.mockResolvedValue({
        providerAccountId: 'acct-a',
        connectors: [
          {
            name: 'linear',
            status: 'ready',
            statusLabel: '✓ Connected',
            description: 'https://mcp.linear.app/sse',
            needsAuthorization: false,
          },
        ],
        error: null,
      })

      render(<ProviderAccountsContainer />)
      await screen.findByText('a@example.com')
      fireEvent.click(screen.getByRole('button', { name: /Connectors/ }))
      await screen.findByText('linear')

      fireEvent.click(screen.getByRole('button', { name: 'Authorize' }))

      await waitFor(() =>
        expect(providerAccounts.authorizeConnector).toHaveBeenCalledWith({
          accountId: 'acct-a',
          serverName: 'linear',
        }),
      )
      // Shows what the authorization achieved, not what it attempted.
      expect(
        await screen.findByText(/linear authorized for this account/),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Authorize' }),
      ).not.toBeInTheDocument()
    })

    it('reports a failed authorization instead of pretending it worked', async () => {
      providerAccounts.authorizeConnector.mockRejectedValue(
        new Error('browser closed'),
      )

      render(<ProviderAccountsContainer />)
      await screen.findByText('a@example.com')
      fireEvent.click(screen.getByRole('button', { name: /Connectors/ }))
      await screen.findByText('linear')

      fireEvent.click(screen.getByRole('button', { name: 'Authorize' }))

      expect(await screen.findByText(/browser closed/)).toBeInTheDocument()
    })

    it('says why when the account cannot be asked', async () => {
      providerAccounts.listConnectors.mockResolvedValue({
        providerAccountId: 'acct-a',
        connectors: [],
        error: 'Claude Code is not available on PATH.',
      })

      render(<ProviderAccountsContainer />)
      await screen.findByText('a@example.com')
      fireEvent.click(screen.getByRole('button', { name: /Connectors/ }))

      expect(
        await screen.findByText(/not available on PATH/),
      ).toBeInTheDocument()
    })
  })
})

it('opens the OpenAI tab directly from the composer account action', async () => {
  providerAccounts.list.mockResolvedValue([
    account({ providerId: 'codex', email: 'openai@example.com' }),
  ])
  useDialogStore.getState().open('app-settings', {
    appSettingsSection: 'provider-accounts',
    providerAccountProviderId: 'codex',
  })
  render(<ProviderAccountsContainer />)
  expect(await screen.findByText('openai@example.com')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Connect OpenAI' }),
  ).toBeInTheDocument()
  useDialogStore.getState().close()
})
