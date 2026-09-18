import { beforeEach, expect, it, vi } from 'vitest'
import { registerProviderAccountIpcHandlers } from './provider-account.ipc'

const handlers = vi.hoisted(
  () => new Map<string, (...args: unknown[]) => unknown>(),
)
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(name, handler),
  },
}))

beforeEach(() => handlers.clear())

function setup(providerId = 'codex', listError: string | null = null) {
  const error = new Error(
    'This Codex account is in use. Wait for its active work to finish.',
  )
  const current = {
    providerAccountId: 'account',
    connectors: [
      {
        name: 'linear',
        status: 'unknown',
        statusLabel: 'Unknown',
        description: '',
        needsAuthorization: true,
      },
    ],
    error: listError,
  }
  const mcp = {
    connectLinear: vi.fn().mockRejectedValue(error),
    authorizeConnector: vi.fn().mockRejectedValue(error),
    listConnectors: vi.fn().mockResolvedValue(current),
  }
  registerProviderAccountIpcHandlers({
    repository: { get: () => ({ providerId }) },
    mcp,
  } as unknown as Parameters<typeof registerProviderAccountIpcHandlers>[0])
  return { error, current, mcp }
}

it.each(['connectLinear', 'authorizeConnector'])(
  'retains connectors and the exact refusal through %s IPC',
  async (action) => {
    const b = setup()
    const result = await handlers.get(`providerAccounts:${action}`)!(
      null,
      action === 'connectLinear'
        ? 'account'
        : { accountId: 'account', serverName: 'linear' },
    )
    expect(result).toEqual({ ...b.current, error: b.error.message })
    expect(b.mcp.listConnectors).toHaveBeenCalledWith('account')
  },
)

it.each(['connectLinear', 'authorizeConnector'])(
  'lets a list failure win over the %s refusal',
  async (action) => {
    const b = setup('codex', 'Codex list unavailable')
    expect(
      await handlers.get(`providerAccounts:${action}`)!(
        null,
        action === 'connectLinear'
          ? 'account'
          : { accountId: 'account', serverName: 'linear' },
      ),
    ).toEqual(b.current)
  },
)

it('still rethrows Claude authorization failures', async () => {
  const b = setup('claude-code')
  await expect(
    handlers.get('providerAccounts:authorizeConnector')!(null, {
      accountId: 'account',
      serverName: 'linear',
    }),
  ).rejects.toBe(b.error)
  expect(b.mcp.listConnectors).not.toHaveBeenCalled()
})
