import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type ProviderAccount,
  useConnectionsOverviewStore,
} from '@/entities/provider-account'
import { ConnectionsOverviewContainer } from './connections-overview.container'
import { useChatGptSignInsStore } from './chatgpt-sign-ins.model'

function account(overrides: Partial<ProviderAccount>): ProviderAccount {
  return {
    id: 'acct',
    providerId: 'claude-code',
    label: 'Account',
    authKind: 'subscription-oauth',
    email: 'a@example.com',
    orgId: null,
    plan: null,
    configDir: '/config',
    credentialDir: '/credentials',
    executionHostId: 'local',
    isDefault: false,
    status: 'connected',
    lastValidatedAt: null,
    createdAt: '2026-09-28T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z',
    ...overrides,
  }
}

const providerAccounts = {
  list: vi.fn(),
  listChatGptApps: vi.fn(),
  checkChatGptAppSignIns: vi.fn(),
  listConnectors: vi.fn(),
}

const ACCOUNTS = [
  account({ id: 'openai-ef', providerId: 'codex', email: 'marcin@ef.design' }),
  account({ id: 'claude-proton', email: 'marckraw@proton.me' }),
  account({
    id: 'claude-away',
    email: 'away@example.com',
    status: 'unavailable',
  }),
  account({
    id: 'claude-remote',
    email: 'remote@example.com',
    executionHostId: 'lm',
  }),
]

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  useConnectionsOverviewStore.setState({
    rows: [],
    checkedAt: null,
    running: null,
  })
  useChatGptSignInsStore.setState({ byAccount: {}, inFlight: {} })
  providerAccounts.list.mockResolvedValue(ACCOUNTS)
  providerAccounts.listChatGptApps.mockResolvedValue({
    providerAccountId: 'openai-ef',
    apps: [
      { id: 'figma', name: 'Figma', state: 'available' },
      { id: 'github', name: 'GitHub', state: 'available' },
    ],
    requiresChatGpt: false,
    error: null,
  })
  providerAccounts.checkChatGptAppSignIns.mockResolvedValue({
    providerAccountId: 'openai-ef',
    checkedAt: '2026-09-28T08:00:00.000Z',
    error: null,
    signIns: [
      {
        appId: 'figma',
        status: 'signed-in',
        account: 'Marcin (m@ef.com)',
        reason: null,
      },
      { appId: 'github', status: 'needs-sign-in', account: null, reason: null },
    ],
    servers: [
      {
        server: 'linear',
        status: 'signed-in',
        account: 'm@icloud.com',
        reason: null,
      },
    ],
  })
  providerAccounts.listConnectors.mockImplementation(
    async (accountId: string) =>
      accountId === 'openai-ef'
        ? {
            providerAccountId: accountId,
            connectors: [
              {
                name: 'linear',
                status: 'ready',
                statusLabel: 'Authorized',
                description: '',
                needsAuthorization: false,
              },
            ],
            error: null,
          }
        : {
            providerAccountId: accountId,
            connectors: [
              {
                name: 'claude.ai Figma',
                status: 'ready',
                statusLabel: '✔ Connected',
                description: '',
                needsAuthorization: false,
              },
              {
                name: 'linear',
                status: 'needs-auth',
                statusLabel: '! Needs authentication',
                description: '',
                needsAuthorization: true,
              },
            ],
            error: null,
            clearedNeedsAuthNotes: [],
          },
  )
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    providerAccounts,
  }
})

const rowOf = (identity: string) =>
  screen.getByRole('rowheader', { name: new RegExp(identity) }).closest('tr')!

describe('MAR-3518 Check all accounts', () => {
  it('checks nothing until asked', () => {
    render(<ConnectionsOverviewContainer />)
    expect(providerAccounts.list).not.toHaveBeenCalled()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows every local account with each service through each app, as each check saw it', async () => {
    render(<ConnectionsOverviewContainer />)
    fireEvent.click(screen.getByRole('button', { name: 'Check all accounts' }))
    await screen.findByText(/^Checked at /)

    const openai = rowOf('marcin@ef.design')
    const cells = within(openai).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent(
      'Signed in as Marcin (m@ef.com) · ChatGPT app',
    )
    expect(cells[1]).toHaveTextContent(
      'Signed in as m@icloud.com · Codex on this Mac',
    )
    expect(cells[2]).toHaveTextContent('Needs sign-in again · ChatGPT app')

    const claude = rowOf('marckraw@proton.me')
    const claudeCells = within(claude).getAllByRole('cell')
    expect(claudeCells[0]).toHaveTextContent('Connected · claude.ai')
    expect(claudeCells[1]).toHaveTextContent(
      'Needs sign-in again · Claude on this Mac',
    )
    expect(claudeCells[2]).toHaveTextContent('—')

    // An account that isn't connected is listed but never checked; another
    // machine's account isn't this Mac's to check.
    expect(rowOf('away@example.com')).toHaveTextContent(
      'Account not connected, so not checked',
    )
    expect(screen.queryByText('remote@example.com')).toBeNull()
    expect(
      providerAccounts.listConnectors.mock.calls.map(([id]) => id),
    ).toEqual(['openai-ef', 'claude-proton'])
    expect(
      providerAccounts.checkChatGptAppSignIns,
    ).toHaveBeenCalledExactlyOnceWith({
      accountId: 'openai-ef',
    })
  })

  it("the OpenAI check lands in the panel's sign-in memory too", async () => {
    render(<ConnectionsOverviewContainer />)
    fireEvent.click(screen.getByRole('button', { name: 'Check all accounts' }))
    await screen.findByText(/^Checked at /)
    expect(
      useChatGptSignInsStore.getState().byAccount['openai-ef']?.signIns,
    ).toHaveLength(2)
  })

  it('one account failing still checks the rest, and says why', async () => {
    providerAccounts.listChatGptApps.mockRejectedValue(
      new Error('Codex is not available'),
    )
    render(<ConnectionsOverviewContainer />)
    fireEvent.click(screen.getByRole('button', { name: 'Check all accounts' }))
    await screen.findByText(/^Checked at /)
    expect(rowOf('marcin@ef.design')).toHaveTextContent(
      "Couldn't check: Codex is not available",
    )
    expect(
      within(rowOf('marckraw@proton.me')).getAllByRole('cell')[0],
    ).toHaveTextContent('Connected · claude.ai')
  })

  it("a sign-in check that throws still settles the panel's memory, and nothing reads as connected", async () => {
    providerAccounts.checkChatGptAppSignIns.mockRejectedValue(
      new Error('ipc gone'),
    )
    render(<ConnectionsOverviewContainer />)
    fireEvent.click(screen.getByRole('button', { name: 'Check all accounts' }))
    await screen.findByText(/^Checked at /)
    // In flight forever would stop the account's own panel from checking.
    expect(useChatGptSignInsStore.getState().inFlight['openai-ef']).toBeNull()
    const openai = rowOf('marcin@ef.design')
    expect(openai).toHaveTextContent('Could not check sign-ins. Try Refresh.')
    const cells = within(openai).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('Sign-in not checked · ChatGPT app')
    expect(cells[1]).toHaveTextContent(
      'Sign-in not checked · Codex on this Mac',
    )
    expect(openai.textContent).not.toMatch(/Connected|Signed in/)
  })

  it('the answer outlives the section until the next check', async () => {
    const first = render(<ConnectionsOverviewContainer />)
    fireEvent.click(screen.getByRole('button', { name: 'Check all accounts' }))
    await screen.findByText(/^Checked at /)
    first.unmount()
    render(<ConnectionsOverviewContainer />)
    expect(screen.getByText(/^Checked at /)).toBeInTheDocument()
    expect(rowOf('marckraw@proton.me')).toBeInTheDocument()
    expect(providerAccounts.list).toHaveBeenCalledTimes(1)
  })

  it('says it is checking while it checks, and cannot be started twice', async () => {
    let release!: () => void
    providerAccounts.listConnectors.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              providerAccountId: 'openai-ef',
              connectors: [],
              error: null,
            })
        }),
    )
    render(<ConnectionsOverviewContainer />)
    fireEvent.click(screen.getByRole('button', { name: 'Check all accounts' }))
    const busy = await screen.findByRole('button', {
      name: 'Checking all accounts…',
    })
    expect(busy).toBeDisabled()
    expect(rowOf('marckraw@proton.me')).toHaveTextContent('Checking…')
    release()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Check all accounts' }),
      ).not.toBeDisabled(),
    )
  })
})
