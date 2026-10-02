import type { ProviderAccountLoginAttempt } from '@/shared/types/provider-account-login.types'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProviderAccount,
  ProviderAccountHealth,
} from '@/entities/provider-account'
import { useDialogStore } from '@/entities/dialog'
import { ProviderAccountsContainer } from './provider-accounts.container'
import { CHATGPT_APPS_FOCUS_INTERVAL_MS } from './chatgpt-apps-refresh.pure'
import { useChatGptSignInsStore } from './chatgpt-sign-ins.model'

/** Presses a ChatGPT button and picks one of its two choices (MAR-3486). */
async function chooseChatGptLink(
  trigger: HTMLElement,
  choice: 'Open in default browser' | 'Copy link',
) {
  fireEvent.click(trigger)
  fireEvent.click(await screen.findByRole('menuitem', { name: choice }))
}
import { ProviderAccountMcpService } from '../../../electron/backend/provider-account/provider-account-mcp.service'
import type { ProviderAccountRepository } from '../../../electron/backend/provider-account/provider-account.repository'
import type { CodexServerHostRegistry } from '../../../electron/backend/provider/codex/codex-server-host'

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
  loginAttempt: vi.fn(),
  onLoginChanged: vi.fn(),
  cancelLogin: vi.fn(),
  submitLoginCode: vi.fn(),
  list: vi.fn(),
  enrol: vi.fn(),
  reconnect: vi.fn(),
  remove: vi.fn(),
  inspectHistory: vi.fn(),
  setDefault: vi.fn(),
  rename: vi.fn(),
  sweepOrphans: vi.fn(),
  scanSharedSettings: vi.fn(),
  attest: vi.fn(),
  health: vi.fn(),
  listChatGptApps: vi.fn(),
  checkChatGptAppSignIns: vi.fn(),
  manageChatGptApp: vi.fn(),
  browseChatGptApps: vi.fn(),
  copyChatGptLink: vi.fn(),
  listConnectors: vi.fn(),
  authorizeConnector: vi.fn(),
  connectLinear: vi.fn(),
}

describe('ProviderAccountsContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    providerAccounts.listChatGptApps.mockResolvedValue({
      providerAccountId: 'acct-a',
      apps: [],
      requiresChatGpt: false,
      error: null,
    })
    providerAccounts.checkChatGptAppSignIns.mockResolvedValue({
      providerAccountId: 'acct-a',
      checkedAt: null,
      signIns: [],
      servers: [],
      error: null,
    })
    useChatGptSignInsStore.setState({ byAccount: {}, inFlight: {} })
    providerAccounts.loginAttempt.mockResolvedValue(null)
    providerAccounts.onLoginChanged.mockReturnValue(() => {})
    useDialogStore.getState().close()
    providerAccounts.list.mockResolvedValue([account()])
    providerAccounts.health.mockResolvedValue(health())
    providerAccounts.inspectHistory.mockResolvedValue({
      entries: [],
      fullyShared: true,
      privateEntries: [],
      unreadableEntries: [],
    })
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

  it('separates OpenAI accounts and exposes their connectors', async () => {
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

    fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }))
    expect(screen.getByText('openai@example.com')).toBeInTheDocument()
    expect(screen.getByText(/Workspace org-a · team/)).toBeInTheDocument()
    expect(screen.queryByText('a@example.com')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Connectors' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Account email')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'OpenAI' })).toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: 'Anthropic' }))
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
    fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }))
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
    fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect OpenAI' }))

    expect(
      screen.getByRole('button', { name: 'Sign-in in progress…' }),
    ).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Anthropic' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
    finishLogin({ account: account({ providerId: 'codex' }), warnings: [] })
    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: 'Anthropic' }),
      ).not.toHaveAttribute('aria-disabled', 'true'),
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
    fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }))
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
    fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }))
    expect(screen.getByText('No OpenAI accounts enrolled')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Convergence uses the Codex login already on this Mac. Connect an account below to manage it here.',
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
    fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }))
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
    expect(await screen.findByText(/signs the account out/)).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Sign out and remove' }),
    )
    await waitFor(() =>
      expect(providerAccounts.remove).toHaveBeenCalledWith('acct-a'),
    )
  })

  it('names private history and sends the deletion flag only after the explicit destructive choice', async () => {
    providerAccounts.inspectHistory.mockResolvedValue({
      entries: [
        { name: 'projects', status: 'real-directory', hasPrivateContent: true },
      ],
      fullyShared: false,
      privateEntries: ['projects'],
      unreadableEntries: [],
    })
    providerAccounts.remove.mockResolvedValue(undefined)
    render(<ProviderAccountsContainer />)
    await screen.findByText('a@example.com')
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }))
    expect(
      await screen.findByText(/permanently delete those copies/),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/Native conversations stay/),
    ).not.toBeInTheDocument()
    expect(providerAccounts.remove).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', {
        name: 'Sign out and delete private history',
      }),
    ).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Sign out and delete private history',
      }),
    )
    expect(providerAccounts.remove).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Delete the private files/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await screen.findByRole('checkbox', { name: /Delete the private files/ })
    expect(
      screen.getByRole('checkbox', { name: /Delete the private files/ }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('button', {
        name: 'Sign out and delete private history',
      }),
    ).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Delete the private files/ }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Sign out and delete private history',
      }),
    )
    await waitFor(() =>
      expect(providerAccounts.remove).toHaveBeenCalledWith('acct-a', {
        deletePrivateHistory: true,
      }),
    )
  })

  it('refuses removal when the layout cannot be inspected', async () => {
    providerAccounts.inspectHistory.mockResolvedValue({
      entries: [],
      fullyShared: false,
      privateEntries: [],
      unreadableEntries: ['projects'],
    })
    render(<ProviderAccountsContainer />)
    await screen.findByText('a@example.com')
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not be inspected/,
    )
    expect(
      screen.queryByRole('button', { name: 'Sign out and remove' }),
    ).not.toBeInTheDocument()
    expect(providerAccounts.remove).not.toHaveBeenCalled()
  })

  it('rejoins the backend login after remount, exposes fallback controls and never starts a second login', async () => {
    const attempt: ProviderAccountLoginAttempt = {
      id: 'login-fixture',
      providerId: 'claude-code',
      accountId: null,
      kind: 'enrol',
      state: 'waiting-code',
      active: true,
      authorizationUrl: 'https://claude.com/cai/oauth/authorize?state=fixture',
      message: 'Paste the code from the browser.',
      startedAt: '2026-09-14T10:00:00Z',
    }
    providerAccounts.loginAttempt.mockResolvedValue(attempt)
    const unsubscribe = vi.fn()
    providerAccounts.onLoginChanged.mockReturnValue(unsubscribe)
    const first = render(<ProviderAccountsContainer />)
    await screen.findByLabelText('Authorization code')
    expect(
      screen.getByRole('button', { name: 'Sign-in in progress…' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('link', { name: /^Open sign-in page/ }),
    ).toHaveAttribute('href', attempt.authorizationUrl)
    first.unmount()
    expect(unsubscribe).toHaveBeenCalled()
    render(<ProviderAccountsContainer />)
    fireEvent.change(await screen.findByLabelText('Authorization code'), {
      target: { value: 'fixture-code' },
    })
    providerAccounts.submitLoginCode.mockResolvedValue(undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Submit code' }))
    await waitFor(() =>
      expect(providerAccounts.submitLoginCode).toHaveBeenCalledWith(
        'login-fixture',
        'fixture-code',
      ),
    )
    expect(screen.getByLabelText('Authorization code')).toHaveValue('')
    providerAccounts.cancelLogin.mockResolvedValue({
      ...attempt,
      state: 'cancelling',
      authorizationUrl: null,
      message: 'Stopping sign-in…',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }))
    await screen.findByText('Stopping sign-in…')
    expect(
      screen.queryByRole('link', { name: /^Open sign-in page/ }),
    ).not.toBeInTheDocument()
    expect(providerAccounts.enrol).not.toHaveBeenCalled()
  })

  it('does not overwrite a newer login event with an older initial snapshot', async () => {
    let snapshot!: (attempt: ProviderAccountLoginAttempt | null) => void
    providerAccounts.loginAttempt.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          snapshot = resolve
        }),
    )
    let event!: (attempt: ProviderAccountLoginAttempt) => void
    providerAccounts.onLoginChanged.mockImplementationOnce((callback) => {
      event = callback
      return () => {}
    })
    render(<ProviderAccountsContainer />)
    await screen.findByText('a@example.com')
    const attempt: ProviderAccountLoginAttempt = {
      id: 'new',
      providerId: 'codex',
      accountId: null,
      kind: 'enrol',
      state: 'waiting-browser',
      active: true,
      authorizationUrl: null,
      message: 'Complete the OpenAI sign-in.',
      startedAt: '2026-09-14T10:00:00Z',
    }
    await act(async () => {
      event(attempt)
      snapshot(null)
    })
    expect(screen.getByText('Complete the OpenAI sign-in.')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Sign-in in progress…' }),
    ).toBeDisabled()
  })

  it('drops the old credential-health note after a successful reconnect', async () => {
    providerAccounts.health
      .mockResolvedValueOnce(
        health({
          accounts: [
            {
              accountId: 'acct-a',
              label: 'Work',
              email: 'a@example.com',
              outcome: 'verified',
              status: 'expired',
              detail: null,
              unknownEntries: [],
              missingLinks: [],
              credentialHealth: 'absent',
            },
          ],
        }),
      )
      .mockResolvedValue(health())
    providerAccounts.reconnect.mockResolvedValue(account())
    render(<ProviderAccountsContainer />)
    await screen.findByText(/Claude did not find a local sign-in/)
    fireEvent.click(screen.getByRole('button', { name: /Reconnect/ }))
    await screen.findByText('Reconnected.')
    expect(
      screen.queryByText(/Claude did not find a local sign-in/),
    ).not.toBeInTheDocument()
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
    fireEvent.click(
      await screen.findByRole('button', { name: 'Sign out and remove' }),
    )
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
      fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }))
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
    async function openCodex(
      connectors: unknown[] = [],
      error: string | null = null,
    ) {
      providerAccounts.list.mockResolvedValue([
        account({ providerId: 'codex' }),
      ])
      providerAccounts.listConnectors.mockResolvedValue({
        providerAccountId: 'acct-a',
        connectors,
        error,
      })
      render(<ProviderAccountsContainer />)
      await screen.findByText(/No Anthropic accounts enrolled/)
      fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }))
      fireEvent.click(screen.getByRole('button', { name: 'Connectors' }))
      await waitFor(() =>
        expect(providerAccounts.listConnectors).toHaveBeenCalledWith('acct-a'),
      )
    }

    it('connects missing Linear for this Codex account and displays the read-back status', async () => {
      providerAccounts.connectLinear.mockResolvedValue({
        providerAccountId: 'acct-a',
        connectors: [
          {
            name: 'linear',
            status: 'unknown',
            statusLabel: 'Unknown — press Authorize to find out',
            needsAuthorization: true,
          },
        ],
        error: null,
      })
      await openCodex()
      fireEvent.click(
        await screen.findByRole('button', { name: 'Connect Linear' }),
      )
      expect(
        await screen.findByText('Unknown — press Authorize to find out'),
      ).toBeInTheDocument()
      expect(providerAccounts.connectLinear).toHaveBeenCalledWith('acct-a')
      expect(
        screen.queryByRole('button', { name: 'Connect Linear' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByText(/linear authorized for this account/),
      ).not.toBeInTheDocument()
    })

    it('offers reauthorization but no Connect Linear for an existing Codex connector', async () => {
      await openCodex([
        {
          name: 'linear',
          status: 'ready',
          statusLabel: 'Authorized',
          needsAuthorization: false,
        },
      ])
      await screen.findByText('Authorized')
      // A stored sign-in is signed in again, not authorized anew (MAR-3516).
      expect(
        screen.getByRole('button', { name: 'Sign in again' }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Authorize' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Connect Linear' }),
      ).not.toBeInTheDocument()
    })

    it('shows a Codex list error without hiding Connect Linear or claiming an empty list', async () => {
      await openCodex([], 'Codex could not list connectors.')
      expect(
        await screen.findByText('Codex could not list connectors.'),
      ).toBeInTheDocument()
      expect(
        screen.queryByText('No MCP servers are configured.'),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Connect Linear' }),
      ).toBeInTheDocument()
    })

    it('keeps Connect Linear available beside a maintenance refusal', async () => {
      const message =
        'This Codex account is in use. Wait for its active work to finish.'
      providerAccounts.connectLinear.mockResolvedValue({
        providerAccountId: 'acct-a',
        connectors: [],
        error: message,
      })
      await openCodex()
      fireEvent.click(
        await screen.findByRole('button', { name: 'Connect Linear' }),
      )
      expect(await screen.findByText(message)).toBeInTheDocument()
      const retry = screen.getByRole('button', { name: 'Connect Linear' })
      expect(retry).toBeEnabled()
      fireEvent.click(retry)
      await waitFor(() =>
        expect(providerAccounts.connectLinear).toHaveBeenCalledTimes(2),
      )
      expect(screen.getByText(message)).toBeInTheDocument()
    })

    it('surfaces Codex maintenance refusal verbatim', async () => {
      const message =
        'This Codex account is in use. Wait for its active work to finish.'
      providerAccounts.authorizeConnector.mockResolvedValue({
        providerAccountId: 'acct-a',
        connectors: [
          {
            name: 'linear',
            status: 'unknown',
            statusLabel: 'Unknown',
            needsAuthorization: true,
          },
        ],
        error: message,
      })
      await openCodex([
        {
          name: 'linear',
          status: 'unknown',
          statusLabel: 'Unknown',
          needsAuthorization: true,
        },
      ])
      fireEvent.click(await screen.findByRole('button', { name: 'Authorize' }))
      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(screen.getByText('linear')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Authorize' }),
      ).toBeInTheDocument()
    })
    it('MAR-3185 R5 offers Connect Linear on a Claude account without linear, and shows the read-back', async () => {
      providerAccounts.listConnectors.mockResolvedValue({
        providerAccountId: 'acct-a',
        connectors: [],
        error: null,
      })
      providerAccounts.connectLinear.mockResolvedValue({
        providerAccountId: 'acct-a',
        connectors: [
          {
            name: 'linear',
            status: 'ready',
            statusLabel: '✔ Connected',
            description: 'https://mcp.linear.app/mcp (HTTP)',
            needsAuthorization: false,
          },
        ],
        error: null,
      })
      render(<ProviderAccountsContainer />)
      await screen.findByText('a@example.com')
      fireEvent.click(screen.getByRole('button', { name: /Connectors/ }))

      fireEvent.click(
        await screen.findByRole('button', { name: 'Connect Linear' }),
      )

      expect(await screen.findByText('✔ Connected')).toBeInTheDocument()
      expect(providerAccounts.connectLinear).toHaveBeenCalledWith('acct-a')
      expect(
        screen.queryByRole('button', { name: 'Connect Linear' }),
      ).not.toBeInTheDocument()
      // The row is the read-back; the message claims nothing beyond it.
      expect(
        screen.getByText('Connector status refreshed.'),
      ).toBeInTheDocument()
      expect(
        screen.queryByText(/linear authorized for this account/),
      ).not.toBeInTheDocument()
    })

    it('MAR-3516 a Claude Figma that needs signing in says why Figma drops, and the list promises only what holds', async () => {
      providerAccounts.listConnectors.mockResolvedValue({
        providerAccountId: 'acct-a',
        connectors: [
          {
            name: 'claude.ai Figma',
            status: 'needs-auth',
            statusLabel: '! Needs authentication',
            description: 'https://mcp.figma.com/mcp',
            needsAuthorization: true,
          },
          {
            name: 'linear',
            status: 'needs-auth',
            statusLabel: '! Needs authentication',
            description: 'https://mcp.linear.app/mcp',
            needsAuthorization: true,
          },
        ],
        error: null,
      })
      render(<ProviderAccountsContainer />)
      await screen.findByText('a@example.com')
      fireEvent.click(screen.getByRole('button', { name: /Connectors/ }))
      const figma = (await screen.findByText('claude.ai Figma')).parentElement!
      expect(figma.textContent).toContain(
        'Figma keeps one sign-in per app for each Figma user',
      )
      expect(
        screen.getByText('linear').parentElement!.textContent,
      ).not.toContain('keeps one sign-in')
      expect(
        screen.getByText(
          /Some services, like Figma, keep one sign-in per app for each of their users/,
        ),
      ).toBeInTheDocument()
      expect(screen.queryByText(/authorizes a connector once/)).toBeNull()
      // Nothing is stored here, so it is still Authorize.
      expect(screen.getAllByRole('button', { name: 'Authorize' })).toHaveLength(
        2,
      )
    })

    it('MAR-3517 a Claude read that cleared a stale skip-note says so; one that cleared nothing is quiet', async () => {
      providerAccounts.listConnectors.mockResolvedValue({
        providerAccountId: 'acct-a',
        connectors: [
          {
            name: 'claude.ai Figma',
            status: 'ready',
            statusLabel: '✔ Connected',
            description: 'https://mcp.figma.com/mcp',
            needsAuthorization: false,
          },
        ],
        error: null,
        clearedNeedsAuthNotes: ['claude.ai Figma'],
      })
      render(<ProviderAccountsContainer />)
      await screen.findByText('a@example.com')
      fireEvent.click(screen.getByRole('button', { name: /Connectors/ }))
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Cleared Claude\'s "needs sign-in" note for "claude.ai Figma": it\'s connected, so new conversations on this account will try it again.',
      )
      cleanup()
      providerAccounts.listConnectors.mockResolvedValue({
        providerAccountId: 'acct-a',
        connectors: [],
        error: null,
        clearedNeedsAuthNotes: [],
      })
      render(<ProviderAccountsContainer />)
      await screen.findByText('a@example.com')
      fireEvent.click(screen.getByRole('button', { name: /Connectors/ }))
      await screen.findByText('No MCP servers are configured.')
      expect(screen.queryByText(/needs sign-in" note/)).toBeNull()
    })

    it('MAR-3185 R5 a Claude account whose linear needs authentication gets Authorize, not Connect Linear', async () => {
      render(<ProviderAccountsContainer />)
      await screen.findByText('a@example.com')
      fireEvent.click(screen.getByRole('button', { name: /Connectors/ }))
      await screen.findByText('! Needs authentication')

      expect(
        screen.getByRole('button', { name: 'Authorize' }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Connect Linear' }),
      ).not.toBeInTheDocument()
    })

    it('MAR-3185 R5 names the two homes for a Claude account, beside the CLI-view sentence, and not for Codex', async () => {
      const homes =
        'Linear is added for every Claude account on this Mac; authorization is per account.'
      render(<ProviderAccountsContainer />)
      await screen.findByText('a@example.com')
      fireEvent.click(screen.getByRole('button', { name: /Connectors/ }))

      expect(await screen.findByText(homes)).toBeInTheDocument()
      expect(
        screen.getByText(
          /This is what the Claude CLI reports for this account/,
        ),
      ).toBeInTheDocument()

      cleanup()
      await openCodex()
      await screen.findByRole('button', { name: 'Connect Linear' })
      expect(screen.queryByText(homes)).not.toBeInTheDocument()
    })

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

// -- MAR-3213 R3: the panel says whose truth it shows --

const CLAUDE_CONNECTORS_SENTENCE =
  "This is what the Claude CLI reports for this account — what a terminal sees. A running conversation loads its own list when it starts and can differ; open that conversation's Harness details to see it. Restart the app after authorizing a claude.ai connector so running conversations pick it up."

it('MAR-3213 R3 the Connectors list says it is the CLI\u2019s view for a Claude account only — mutation show it for Codex too turns red', async () => {
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

  // The Claude account's Connectors list carries the sentence.
  fireEvent.click(
    (await screen.findAllByRole('button', { name: 'Connectors' }))[0]!,
  )
  expect(
    await screen.findByText(CLAUDE_CONNECTORS_SENTENCE),
  ).toBeInTheDocument()

  // The Codex account's does not: its list is already per-account server
  // state, not a terminal's one-shot view.
  fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }))
  await screen.findByText('openai@example.com')
  fireEvent.click(screen.getByRole('button', { name: 'Connectors' }))
  expect(screen.queryByText(CLAUDE_CONNECTORS_SENTENCE)).not.toBeInTheDocument()
})

describe('MAR-3458 ChatGPT apps', () => {
  const snapshot = {
    providerAccountId: 'acct-a',
    requiresChatGpt: false,
    error: null,
    apps: [
      { id: 'figma', name: 'Figma', state: 'available' },
      { id: 'hidden', name: 'Hidden app', state: 'unavailable' },
      { id: 'off', name: 'Disabled app', state: 'off' },
    ],
  }
  beforeEach(() => {
    vi.clearAllMocks()
    useDialogStore.getState().close()
    providerAccounts.loginAttempt.mockResolvedValue(null)
    providerAccounts.onLoginChanged.mockReturnValue(() => {})
    providerAccounts.list.mockResolvedValue([account({ providerId: 'codex' })])
    providerAccounts.health.mockResolvedValue(health())
    providerAccounts.listConnectors.mockResolvedValue({
      providerAccountId: 'acct-a',
      connectors: [
        {
          name: 'linear',
          status: 'ready',
          statusLabel: 'Connected',
          description: '',
          needsAuthorization: false,
        },
      ],
      error: null,
    })
    providerAccounts.listChatGptApps.mockResolvedValue(snapshot)
    providerAccounts.checkChatGptAppSignIns.mockResolvedValue({
      providerAccountId: 'acct-a',
      checkedAt: null,
      signIns: [],
      servers: [],
      error: null,
    })
    useChatGptSignInsStore.setState({ byAccount: {}, inFlight: {} })
    providerAccounts.manageChatGptApp.mockResolvedValue(undefined)
    providerAccounts.browseChatGptApps.mockResolvedValue(undefined)
    providerAccounts.copyChatGptLink.mockResolvedValue(undefined)
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      providerAccounts,
    }
  })
  async function open() {
    render(<ProviderAccountsContainer />)
    fireEvent.click(await screen.findByRole('radio', { name: 'OpenAI' }))
    await screen.findByText('a@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Connectors' }))
    return screen.findByRole('region', { name: 'From ChatGPT' })
  }
  function stubChatGptHost(run: ReturnType<typeof vi.fn>) {
    const service = new ProviderAccountMcpService({
      repository: {
        get: () => account({ providerId: 'codex' }),
      } as unknown as ProviderAccountRepository,
      codexServerHosts: {
        get: () => ({ run }),
      } as unknown as CodexServerHostRegistry,
      runCommand: vi.fn(),
      runInteractiveCommand: vi.fn(),
    })
    providerAccounts.listChatGptApps.mockImplementation(
      ({ accountId, forceRefetch }) =>
        service.listChatGptApps(accountId, forceRefetch),
    )
  }
  it('R6/MAR-3485 an installed app Codex cannot use says so, under its app/read name', async () => {
    const request = vi.fn(async (method: string) => {
      if (method === 'account/read') return { account: { type: 'chatgpt' } }
      if (method === 'app/installed')
        return {
          apps: [
            {
              id: 'hidden',
              runtimeName: 'hidden-runtime',
              enabled: true,
              callable: false,
            },
          ],
        }
      if (method === 'app/read')
        return {
          apps: [{ id: 'hidden', name: 'Hidden app', installUrl: null }],
          missingAppIds: [],
        }
      throw new Error(`Unexpected RPC ${method}`)
    })
    stubChatGptHost(vi.fn(async (work) => work({ request })))
    const group = await open()
    const name = await within(group).findByText('Hidden app')
    expect(name.nextElementSibling?.textContent).toBe(
      'Tools not available to Codex here',
    )
    expect(request.mock.calls.map(([method]) => method)).not.toContain(
      'app/list',
    )
  })
  it('MAR-3485 a Cloudflare challenge page never reaches the screen', async () => {
    stubChatGptHost(
      vi
        .fn()
        .mockRejectedValue(
          new Error(
            'failed to list apps: Request failed with status 403 Forbidden: <html><head><style>body{}</style></head><body><script>window._cf_chl_opt={}</script></body></html>',
          ),
        ),
    )
    const group = await open()
    const alert = await within(group).findByRole('alert')
    expect(alert).toHaveTextContent(
      "Could not read ChatGPT apps: ChatGPT's bot check refused the request (403). The apps themselves may still work in conversations. Try Refresh in a minute.",
    )
    expect(alert.textContent).not.toMatch(/[<>{}]|_cf_chl/)
  })
  it('R7 renders the host rejection reason and retains configured servers', async () => {
    const message =
      'This Codex account is running a turn. Try again when it finishes.'
    const run = vi.fn().mockRejectedValue(new Error(message))
    stubChatGptHost(run)
    const group = await open()
    expect(await within(group).findByRole('alert')).toHaveTextContent(
      `Could not read ChatGPT apps: ${message}`,
    )
    expect(run).toHaveBeenCalledOnce()
    expect(screen.getByText('Configured on this Mac')).toBeInTheDocument()
    expect(screen.getByText('linear')).toBeInTheDocument()
  })
  it('R2/R5 shows ordered groups, honest states and one Manage action per app', async () => {
    const group = await open()
    await within(group).findByText('Figma')
    expect(within(group).getByText('Tools available')).toBeInTheDocument()
    expect(
      within(group).getByText('Tools not available to Codex here'),
    ).toBeInTheDocument()
    expect(within(group).getByText('Turned off')).toBeInTheDocument()
    // MAR-3470: sign-in words now come only from an observed check; with no
    // check answer there is no per-app sign-in claim at all.
    await waitFor(() =>
      expect(within(group).queryByText('Checking sign-in…')).toBeNull(),
    )
    expect(group.textContent).not.toMatch(
      /ready|authorized|needs sign-in|signed in/i,
    )
    const local = screen.getByText('Configured on this Mac')
    expect(
      group.compareDocumentPosition(local) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText('linear')).toBeInTheDocument()
    const buttons = within(group).getAllByRole('button', {
      name: 'Manage on ChatGPT',
    })
    expect(buttons).toHaveLength(3)
    await chooseChatGptLink(buttons[0], 'Open in default browser')
    expect(providerAccounts.manageChatGptApp).toHaveBeenCalledWith({
      accountId: 'acct-a',
      appId: 'figma',
    })
    await chooseChatGptLink(
      within(group).getByRole('button', { name: 'Browse apps on ChatGPT' }),
      'Open in default browser',
    )
    expect(providerAccounts.browseChatGptApps).toHaveBeenCalledExactlyOnceWith()
    expect(providerAccounts.copyChatGptLink).not.toHaveBeenCalled()
  })
  it('MAR-3486 Copy link copies the link for another browser profile and names the login', async () => {
    const group = await open()
    await within(group).findByText('Figma')
    await waitFor(() =>
      expect(
        within(group).getByRole('button', { name: 'Refresh' }),
      ).not.toBeDisabled(),
    )
    providerAccounts.listChatGptApps.mockClear()
    await chooseChatGptLink(
      within(group).getAllByRole('button', { name: 'Manage on ChatGPT' })[0],
      'Copy link',
    )
    expect(providerAccounts.copyChatGptLink).toHaveBeenCalledExactlyOnceWith({
      accountId: 'acct-a',
      appId: 'figma',
    })
    expect(providerAccounts.manageChatGptApp).not.toHaveBeenCalled()
    expect(await within(group).findByRole('status')).toHaveTextContent(
      'Link copied. Paste it into the browser profile where ChatGPT is signed in as a@example.com; coming back here checks again.',
    )
    // Coming back from the other browser checks again at once, as after Open.
    fireEvent.focus(window)
    expect(providerAccounts.listChatGptApps).toHaveBeenCalledExactlyOnceWith({
      accountId: 'acct-a',
      forceRefetch: true,
    })
    await chooseChatGptLink(
      within(group).getByRole('button', { name: 'Browse apps on ChatGPT' }),
      'Copy link',
    )
    expect(providerAccounts.copyChatGptLink).toHaveBeenLastCalledWith({
      accountId: 'acct-a',
      appId: null,
    })
    expect(providerAccounts.browseChatGptApps).not.toHaveBeenCalled()
    // Closing and reopening the section forgets the copy.
    fireEvent.click(screen.getByRole('button', { name: 'Connectors' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connectors' }))
    const reopened = await screen.findByRole('region', { name: 'From ChatGPT' })
    await within(reopened).findByText('Figma')
    expect(within(reopened).queryByText(/Link copied/)).toBeNull()
    await chooseChatGptLink(
      within(reopened).getByRole('button', { name: 'Browse apps on ChatGPT' }),
      'Copy link',
    )
    expect(await within(reopened).findByRole('status')).toHaveTextContent(
      /^Link copied/,
    )
    // The next choice starts clean: an Open says nothing about a copy.
    await chooseChatGptLink(
      within(reopened).getByRole('button', { name: 'Browse apps on ChatGPT' }),
      'Open in default browser',
    )
    expect(within(reopened).queryByText(/Link copied/)).toBeNull()
  })
  it('MAR-3486 a copy that failed says so and claims no copied link', async () => {
    const group = await open()
    await within(group).findByText('Figma')
    providerAccounts.copyChatGptLink.mockRejectedValue(
      new Error('This app has no ChatGPT page available. Try Refresh.'),
    )
    await chooseChatGptLink(
      within(group).getAllByRole('button', { name: 'Manage on ChatGPT' })[0],
      'Copy link',
    )
    expect(await within(group).findByRole('alert')).toHaveTextContent(
      'Couldn’t copy the ChatGPT link. Try Refresh, then Copy link again.',
    )
    expect(within(group).queryByText(/Link copied/)).toBeNull()
  })
  it('R4/MAR-3485 focus re-reads at most once per interval, Refresh always does, a closed section never', async () => {
    const realNow = Date.now.bind(Date)
    let skew = 0
    const clock = vi
      .spyOn(Date, 'now')
      .mockImplementation(() => realNow() + skew)
    try {
      fireEvent.focus(window)
      expect(providerAccounts.listChatGptApps).not.toHaveBeenCalled()
      const group = await open()
      await within(group).findByText('Figma')
      expect(providerAccounts.listChatGptApps).toHaveBeenCalledExactlyOnceWith({
        accountId: 'acct-a',
        forceRefetch: false,
      })
      providerAccounts.listChatGptApps.mockClear()
      fireEvent.focus(window)
      expect(providerAccounts.listChatGptApps).not.toHaveBeenCalled()
      skew += CHATGPT_APPS_FOCUS_INTERVAL_MS
      fireEvent.focus(window)
      await waitFor(() =>
        expect(
          providerAccounts.listChatGptApps,
        ).toHaveBeenCalledExactlyOnceWith({
          accountId: 'acct-a',
          forceRefetch: true,
        }),
      )
      fireEvent.focus(window)
      await waitFor(() =>
        expect(
          within(group).getByRole('button', { name: 'Refresh' }),
        ).not.toBeDisabled(),
      )
      expect(providerAccounts.listChatGptApps).toHaveBeenCalledTimes(1)
      fireEvent.click(within(group).getByRole('button', { name: 'Refresh' }))
      await waitFor(() =>
        expect(providerAccounts.listChatGptApps).toHaveBeenCalledTimes(2),
      )
      expect(providerAccounts.listChatGptApps).toHaveBeenLastCalledWith({
        accountId: 'acct-a',
        forceRefetch: true,
      })
      await waitFor(() =>
        expect(
          within(group).getByRole('button', { name: 'Refresh' }),
        ).not.toBeDisabled(),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Connectors' }))
      providerAccounts.listChatGptApps.mockClear()
      skew += CHATGPT_APPS_FOCUS_INTERVAL_MS
      fireEvent.focus(window)
      expect(providerAccounts.listChatGptApps).not.toHaveBeenCalled()
    } finally {
      clock.mockRestore()
    }
  })
  it('MAR-3485 coming back from Manage on ChatGPT re-reads at once, inside the interval', async () => {
    const group = await open()
    await within(group).findByText('Figma')
    await waitFor(() =>
      expect(
        within(group).getByRole('button', { name: 'Refresh' }),
      ).not.toBeDisabled(),
    )
    providerAccounts.listChatGptApps.mockClear()
    fireEvent.focus(window)
    expect(providerAccounts.listChatGptApps).not.toHaveBeenCalled()
    await chooseChatGptLink(
      within(group).getAllByRole('button', { name: 'Manage on ChatGPT' })[0],
      'Open in default browser',
    )
    fireEvent.focus(window)
    expect(providerAccounts.listChatGptApps).toHaveBeenCalledExactlyOnceWith({
      accountId: 'acct-a',
      forceRefetch: true,
    })
    await waitFor(() =>
      expect(
        within(group).getByRole('button', { name: 'Refresh' }),
      ).not.toBeDisabled(),
    )
    fireEvent.focus(window)
    expect(providerAccounts.listChatGptApps).toHaveBeenCalledTimes(1)
  })
  it('MAR-3485 a failed refresh keeps the rows it had and says the refresh failed', async () => {
    const group = await open()
    await within(group).findByText('Figma')
    await waitFor(() =>
      expect(
        within(group).getByRole('button', { name: 'Refresh' }),
      ).not.toBeDisabled(),
    )
    providerAccounts.listChatGptApps.mockResolvedValueOnce({
      ...snapshot,
      apps: [],
      error: 'Could not read ChatGPT apps: fixture',
    })
    fireEvent.click(within(group).getByRole('button', { name: 'Refresh' }))
    expect(await within(group).findByRole('alert')).toHaveTextContent(
      'Could not read ChatGPT apps: fixture. The list below is from the last read that worked.',
    )
    expect(within(group).getByText('Figma')).toBeInTheDocument()
    expect(within(group).getByText('Disabled app')).toBeInTheDocument()
  })
  it('MAR-3485 a read in flight shows Reading alone, not the previous error beside it', async () => {
    providerAccounts.listChatGptApps.mockResolvedValueOnce({
      ...snapshot,
      apps: [],
      error: 'Could not read ChatGPT apps: first',
    })
    const group = await open()
    expect(await within(group).findByRole('alert')).toHaveTextContent('first')
    let finish!: (value: unknown) => void
    providerAccounts.listChatGptApps.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    fireEvent.click(within(group).getByRole('button', { name: 'Refresh' }))
    expect(
      await within(group).findByText('Reading ChatGPT apps…'),
    ).toBeInTheDocument()
    expect(within(group).queryByRole('alert')).not.toBeInTheDocument()
    await act(async () => finish(snapshot))
    expect(await within(group).findByText('Figma')).toBeInTheDocument()
    expect(within(group).queryByRole('alert')).not.toBeInTheDocument()
  })
  it('R5 app-list failures retain both groups and configured servers', async () => {
    providerAccounts.listChatGptApps.mockRejectedValue(new Error('fixture'))
    const group = await open()
    expect(await within(group).findByRole('alert')).toHaveTextContent(
      'Couldn’t read ChatGPT apps',
    )
    expect(screen.getByText('Configured on this Mac')).toBeInTheDocument()
    expect(screen.getByText('linear')).toBeInTheDocument()
  })
  it('R1 API-key account explains the ChatGPT requirement', async () => {
    providerAccounts.listChatGptApps.mockResolvedValue({
      ...snapshot,
      apps: [],
      requiresChatGpt: true,
    })
    const group = await open()
    expect(
      await within(group).findByText('ChatGPT apps need a ChatGPT sign-in'),
    ).toBeInTheDocument()
  })
  it('ignores a late app response after switching accounts', async () => {
    let finish!: (value: unknown) => void
    providerAccounts.list.mockResolvedValue([
      account({ providerId: 'codex' }),
      account({ id: 'acct-b', providerId: 'codex', email: 'b@example.com' }),
    ])
    providerAccounts.listChatGptApps
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValue({
        ...snapshot,
        providerAccountId: 'acct-b',
        apps: [{ id: 'b', name: 'Account B app', state: 'available' }],
      })
    render(<ProviderAccountsContainer />)
    await screen.findByRole('radio', { name: 'OpenAI' })
    fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }))
    await screen.findByText('b@example.com')
    fireEvent.click(screen.getAllByRole('button', { name: 'Connectors' })[0])
    await waitFor(() =>
      expect(providerAccounts.listChatGptApps).toHaveBeenCalledTimes(1),
    )
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Connectors' })[1],
      ).not.toBeDisabled(),
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Connectors' })[1])
    await screen.findByText('Account B app')
    await act(async () => finish(snapshot))
    expect(screen.queryByText('Figma')).not.toBeInTheDocument()
    expect(screen.getByText('Account B app')).toBeInTheDocument()
  })
  describe('MAR-3470 each app says whether its sign-in works', () => {
    const apps = {
      ...snapshot,
      apps: [
        { id: 'figma', name: 'Figma', state: 'available' },
        { id: 'github', name: 'GitHub', state: 'available' },
        { id: 'connector_openai_hotline', name: 'Hotline', state: 'available' },
        { id: 'off', name: 'Disabled app', state: 'off' },
      ],
    }
    // A check answered at the moment it is built: the five-minute memory is
    // measured against the clock, so a fixed stamp is a test that expires
    // (MAR-3486 found these red once 27 Sep 00:57Z passed).
    const observed = (accountId = 'acct-a', figmaStatus = 'needs-sign-in') => ({
      providerAccountId: accountId,
      checkedAt: new Date(Date.now()).toISOString(),
      error: null,
      signIns: [
        {
          appId: 'figma',
          status: figmaStatus,
          account: 'me@ef.com',
          reason: null,
        },
        {
          appId: 'github',
          status: 'signed-in',
          account: 'Marcin (m@icloud.com)',
          reason: null,
        },
        {
          appId: 'connector_openai_hotline',
          status: 'built-in',
          account: null,
          reason: null,
        },
        { appId: 'off', status: 'unchecked', account: null, reason: null },
      ],
      servers: [
        {
          server: 'linear',
          status: figmaStatus === 'signed-in' ? 'signed-in' : 'needs-sign-in',
          account: figmaStatus === 'signed-in' ? 'marckraw@icloud.com' : null,
          reason: null,
        },
      ],
    })
    beforeEach(() => {
      providerAccounts.listChatGptApps.mockResolvedValue(apps)
      providerAccounts.checkChatGptAppSignIns.mockResolvedValue(observed())
    })
    const lineOf = (group: HTMLElement, name: string) =>
      within(group).getByText(name).parentElement?.textContent ?? ''

    it('opening checks once and shows what each call observed', async () => {
      const group = await open()
      await within(group).findByText('Signed in as Marcin (m@icloud.com)')
      expect(
        providerAccounts.checkChatGptAppSignIns,
      ).toHaveBeenCalledExactlyOnceWith({ accountId: 'acct-a' })
      expect(lineOf(group, 'Figma')).toContain(
        'Needs sign-in again on ChatGPT (linked to me@ef.com)',
      )
      // MAR-3516: why a Figma link drops, under the Figma row only.
      expect(lineOf(group, 'Figma')).toContain(
        'Figma keeps one sign-in per app for each Figma user',
      )
      expect(lineOf(group, 'Hotline')).toContain(
        'Built into ChatGPT, no sign-in needed',
      )
      expect(lineOf(group, 'Hotline')).not.toContain('keeps one sign-in')
      expect(lineOf(group, 'Disabled app')).not.toMatch(/sign/i)
      expect(
        within(group).getByRole('button', { name: 'Sign in again on ChatGPT' }),
      ).toBeInTheDocument()
      expect(
        within(group).getAllByRole('button', { name: 'Manage on ChatGPT' }),
      ).toHaveLength(3)
      expect(
        within(group).getByText(/^Sign-ins checked at /),
      ).toBeInTheDocument()
    })
    it('rows with tools say Checking while the check runs', async () => {
      let finish!: (value: unknown) => void
      providerAccounts.checkChatGptAppSignIns.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      const group = await open()
      await waitFor(() =>
        expect(within(group).getAllByText('Checking sign-in…')).toHaveLength(3),
      )
      await act(async () => finish(observed()))
      expect(within(group).queryByText('Checking sign-in…')).toBeNull()
      expect(
        within(group).getByText('Signed in as Marcin (m@icloud.com)'),
      ).toBeInTheDocument()
    })
    it('Refresh and the return from ChatGPT check again; a focus inside five minutes does not', async () => {
      const realNow = Date.now.bind(Date)
      let skew = 0
      const clock = vi
        .spyOn(Date, 'now')
        .mockImplementation(() => realNow() + skew)
      try {
        const group = await open()
        await within(group).findByText('Signed in as Marcin (m@icloud.com)')
        const refreshed = () =>
          waitFor(() =>
            expect(
              within(group).getByRole('button', { name: 'Refresh' }),
            ).not.toBeDisabled(),
          )
        skew += CHATGPT_APPS_FOCUS_INTERVAL_MS
        fireEvent.focus(window)
        await waitFor(() =>
          expect(providerAccounts.listChatGptApps).toHaveBeenCalledTimes(2),
        )
        await refreshed()
        expect(providerAccounts.checkChatGptAppSignIns).toHaveBeenCalledTimes(1)
        fireEvent.click(within(group).getByRole('button', { name: 'Refresh' }))
        await waitFor(() =>
          expect(providerAccounts.checkChatGptAppSignIns).toHaveBeenCalledTimes(
            2,
          ),
        )
        await refreshed()
        providerAccounts.checkChatGptAppSignIns.mockResolvedValue(
          observed('acct-a', 'signed-in'),
        )
        await chooseChatGptLink(
          within(group).getByRole('button', {
            name: 'Sign in again on ChatGPT',
          }),
          'Open in default browser',
        )
        fireEvent.focus(window)
        await waitFor(() =>
          expect(providerAccounts.checkChatGptAppSignIns).toHaveBeenCalledTimes(
            3,
          ),
        )
        await waitFor(() =>
          expect(lineOf(group, 'Figma')).toContain('Signed in as me@ef.com'),
        )
      } finally {
        clock.mockRestore()
      }
    })
    it('an older check never replaces a newer one', async () => {
      const pending: Array<(value: unknown) => void> = []
      providerAccounts.checkChatGptAppSignIns.mockImplementation(
        () =>
          new Promise((resolve) => {
            pending.push(resolve)
          }),
      )
      const group = await open()
      await waitFor(() => expect(pending).toHaveLength(1))
      await waitFor(() =>
        expect(
          within(group).getByRole('button', { name: 'Refresh' }),
        ).not.toBeDisabled(),
      )
      fireEvent.click(within(group).getByRole('button', { name: 'Refresh' }))
      await waitFor(() => expect(pending).toHaveLength(2))
      await act(async () => pending[1](observed('acct-a', 'signed-in')))
      await act(async () => pending[0](observed('acct-a', 'needs-sign-in')))
      expect(lineOf(group, 'Figma')).toContain('Signed in as me@ef.com')
    })
    it('a check that failed is tried again at the next opening', async () => {
      providerAccounts.checkChatGptAppSignIns.mockResolvedValueOnce({
        providerAccountId: 'acct-a',
        checkedAt: null,
        signIns: [],
        servers: [],
        error: 'Could not check sign-ins: fixture.',
      })
      const group = await open()
      await within(group).findByRole('alert')
      fireEvent.click(screen.getByRole('button', { name: 'Connectors' }))
      fireEvent.click(screen.getByRole('button', { name: 'Connectors' }))
      const reopened = await screen.findByRole('region', {
        name: 'From ChatGPT',
      })
      await within(reopened).findByText('Signed in as Marcin (m@icloud.com)')
      expect(providerAccounts.checkChatGptAppSignIns).toHaveBeenCalledTimes(2)
    })
    it('the five-minute memory outlives the panel', async () => {
      const first = render(<ProviderAccountsContainer />)
      fireEvent.click(await screen.findByRole('radio', { name: 'OpenAI' }))
      await screen.findByText('a@example.com')
      fireEvent.click(screen.getByRole('button', { name: 'Connectors' }))
      await screen.findByText('Signed in as Marcin (m@icloud.com)')
      first.unmount()
      await open()
      await screen.findByText('Signed in as Marcin (m@icloud.com)')
      expect(providerAccounts.checkChatGptAppSignIns).toHaveBeenCalledTimes(1)
    })
    it('a list that failed checks nothing', async () => {
      providerAccounts.listChatGptApps.mockResolvedValue({
        ...snapshot,
        apps: [],
        error: 'Could not read ChatGPT apps: fixture',
      })
      const group = await open()
      await within(group).findByRole('alert')
      expect(providerAccounts.checkChatGptAppSignIns).not.toHaveBeenCalled()
    })
    it("a configured server's live answer replaces its saved label", async () => {
      providerAccounts.checkChatGptAppSignIns.mockResolvedValue(
        observed('acct-a', 'signed-in'),
      )
      await open()
      const linear = screen.getByText('linear').parentElement!
      await waitFor(() =>
        expect(linear.textContent).toContain(
          'Signed in as marckraw@icloud.com',
        ),
      )
      expect(linear.textContent).not.toContain('Connected')
      // Signed in: the button offers signing in again, quietly (MAR-3516).
      const row = linear.parentElement!
      expect(
        within(row).getByRole('button', { name: 'Sign in again' }),
      ).toBeInTheDocument()
      expect(
        within(row).queryByRole('button', { name: 'Authorize' }),
      ).toBeNull()
    })
    it('a configured server whose sign-in stopped working says so instead of its saved label', async () => {
      await open()
      const linear = screen.getByText('linear').parentElement!
      await waitFor(() =>
        expect(linear.textContent).toContain(
          'Needs sign-in again: press "Sign in again"',
        ),
      )
      expect(linear.textContent).not.toContain('Connected')
    })
    it('a failed check says so once and leaves the rows as read', async () => {
      providerAccounts.checkChatGptAppSignIns.mockResolvedValue({
        providerAccountId: 'acct-a',
        checkedAt: null,
        signIns: [],
        servers: [],
        error: 'Could not check sign-ins: Codex started no thread.',
      })
      const group = await open()
      expect(await within(group).findByRole('alert')).toHaveTextContent(
        'Could not check sign-ins: Codex started no thread.',
      )
      expect(lineOf(group, 'Figma')).toContain('Tools available')
      expect(lineOf(group, 'Figma')).not.toMatch(/sign/i)
    })
    it("each account keeps its own sign-ins; another account's never shows", async () => {
      providerAccounts.list.mockResolvedValue([
        account({ providerId: 'codex' }),
        account({ id: 'acct-b', providerId: 'codex', email: 'b@example.com' }),
      ])
      providerAccounts.listChatGptApps.mockImplementation(({ accountId }) =>
        Promise.resolve({ ...apps, providerAccountId: accountId }),
      )
      providerAccounts.checkChatGptAppSignIns.mockImplementation(
        ({ accountId }) =>
          Promise.resolve(
            observed(
              accountId,
              accountId === 'acct-b' ? 'signed-in' : 'needs-sign-in',
            ),
          ),
      )
      render(<ProviderAccountsContainer />)
      fireEvent.click(await screen.findByRole('radio', { name: 'OpenAI' }))
      await screen.findByText('b@example.com')
      fireEvent.click(screen.getAllByRole('button', { name: 'Connectors' })[0])
      let group = await screen.findByRole('region', { name: 'From ChatGPT' })
      await waitFor(() =>
        expect(lineOf(group, 'Figma')).toContain('Needs sign-in again'),
      )
      fireEvent.click(screen.getAllByRole('button', { name: 'Connectors' })[1])
      group = await screen.findByRole('region', { name: 'From ChatGPT' })
      await waitFor(() =>
        expect(lineOf(group, 'Figma')).toContain('Signed in as me@ef.com'),
      )
      fireEvent.click(screen.getAllByRole('button', { name: 'Connectors' })[0])
      group = await screen.findByRole('region', { name: 'From ChatGPT' })
      await waitFor(() =>
        expect(lineOf(group, 'Figma')).toContain('Needs sign-in again'),
      )
      expect(
        providerAccounts.checkChatGptAppSignIns.mock.calls.map(
          ([input]) => input.accountId,
        ),
      ).toEqual(['acct-a', 'acct-b'])
    })
  })
  it('keeps Claude accounts unchanged and never reads ChatGPT apps for them', async () => {
    providerAccounts.list.mockResolvedValue([account()])
    render(<ProviderAccountsContainer />)
    fireEvent.click(await screen.findByRole('button', { name: 'Connectors' }))
    await screen.findByText('linear')
    fireEvent.focus(window)
    expect(providerAccounts.listChatGptApps).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('region', { name: 'From ChatGPT' }),
    ).not.toBeInTheDocument()
  })
})
