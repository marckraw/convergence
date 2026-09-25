import { describe, expect, it, vi } from 'vitest'
import type { CodexServerHostRegistry } from '../provider/codex/codex-server-host'
import { ProviderAccountMcpService } from './provider-account-mcp.service'
import type { ProviderAccountRepository } from './provider-account.repository'

function bench() {
  const directory = [
    {
      id: 'figma',
      name: 'Figma',
      isEnabled: true,
      isAccessible: true,
      installUrl: 'https://chatgpt.com/apps/figma',
    },
    {
      id: 'directory',
      name: 'Directory only',
      isEnabled: true,
      isAccessible: false,
      installUrl: 'https://chatgpt.com/apps/directory',
    },
  ]
  const request = vi.fn(
    async (method: string, params: unknown): Promise<unknown> => {
      if (method === 'account/read') return { account: { type: 'chatgpt' } }
      if (method === 'app/installed')
        return {
          apps: [
            {
              id: 'figma',
              runtimeName: 'Figma',
              enabled: true,
              callable: true,
            },
            {
              id: 'installed-only',
              runtimeName: 'Another app',
              enabled: true,
              callable: false,
            },
          ],
        }
      if (method === 'app/list')
        return (params as { cursor: string | null }).cursor
          ? {
              data: [
                {
                  ...directory[0],
                  id: 'accessible-only',
                  name: 'Accessible only',
                },
              ],
              nextCursor: null,
            }
          : { data: directory, nextCursor: 'second' }
      throw new Error(`Unexpected RPC ${method}`)
    },
  )
  const get = vi.fn(() => ({
    run: async (work: (rpc: { request: typeof request }) => Promise<unknown>) =>
      work({ request }),
  }))
  const repository = {
    get: (id: string) =>
      id === 'a' || id === 'b'
        ? {
            id,
            providerId: 'codex',
            configDir: `/fixture/${id}`,
            executionHostId: 'local',
            status: 'connected',
            label: id,
          }
        : null,
  }
  const service = new ProviderAccountMcpService({
    repository: repository as unknown as ProviderAccountRepository,
    codexServerHosts: { get } as unknown as CodexServerHostRegistry,
    runInteractiveCommand: vi.fn(),
  })
  return { service, request, get, directory }
}

describe('MAR-3458 account-scoped ChatGPT apps', () => {
  it('R1 uses each account host and returns the paginated installed/accessibility union', async () => {
    const b = bench()
    expect(await b.service.listChatGptApps('a', true)).toEqual({
      providerAccountId: 'a',
      requiresChatGpt: false,
      error: null,
      apps: [
        {
          id: 'accessible-only',
          name: 'Accessible only',
          state: 'unavailable',
        },
        { id: 'installed-only', name: 'Another app', state: 'unavailable' },
        { id: 'figma', name: 'Figma', state: 'available' },
      ],
    })
    expect(b.get).toHaveBeenCalledWith({
      account: {
        configDir: '/fixture/a',
        executionHostId: 'local',
        label: 'a',
      },
      executionHostId: 'local',
    })
    expect(b.request).toHaveBeenCalledWith('app/list', {
      forceRefetch: true,
      limit: 100,
      cursor: null,
    })
    expect(b.request).toHaveBeenCalledWith('app/list', {
      forceRefetch: true,
      limit: 100,
      cursor: 'second',
    })
    expect(b.request).toHaveBeenCalledWith('app/installed', {
      forceRefresh: true,
    })
    await b.service.listChatGptApps('b')
    expect(b.get).toHaveBeenLastCalledWith({
      account: {
        configDir: '/fixture/b',
        executionHostId: 'local',
        label: 'b',
      },
      executionHostId: 'local',
    })
    expect(b.request).toHaveBeenCalledWith('app/installed', {
      forceRefresh: false,
    })
  })
  it('R1 API-key accounts get the ChatGPT requirement without querying apps', async () => {
    const b = bench()
    b.request.mockResolvedValueOnce({ account: { type: 'apiKey' } })
    expect(await b.service.listChatGptApps('a')).toMatchObject({
      apps: [],
      requiresChatGpt: true,
      error: null,
    })
    expect(b.request).toHaveBeenCalledTimes(1)
  })
  it('R5 returns its own error when the RPC fails', async () => {
    const b = bench()
    b.request.mockRejectedValueOnce(new Error('fixture failure'))
    expect(await b.service.listChatGptApps('a')).toMatchObject({
      apps: [],
      error: 'Could not read ChatGPT apps: fixture failure',
    })
  })
  it('refuses missing accounts without falling back to the ambient host', async () => {
    const b = bench()
    expect((await b.service.listChatGptApps('unknown')).error).toBeTruthy()
    expect(b.get).not.toHaveBeenCalled()
  })
  it('R3 resolves fresh backend metadata and rejects unknown IDs and unsafe schemes', async () => {
    const b = bench()
    await expect(b.service.chatGptAppUrl('a', 'figma')).resolves.toBe(
      'https://chatgpt.com/apps/figma',
    )
    b.directory[0].installUrl = 'https://chatgpt.com/apps/updated'
    await expect(b.service.chatGptAppUrl('a', 'figma')).resolves.toBe(
      'https://chatgpt.com/apps/updated',
    )
    await expect(b.service.chatGptAppUrl('a', 'unknown')).rejects.toThrow(
      'no ChatGPT page',
    )
    for (const url of [
      'http://chatgpt.com/apps/figma',
      'file:///tmp/fixture',
      'javascript:alert(1)',
    ]) {
      b.directory[0].installUrl = url
      await expect(b.service.chatGptAppUrl('a', 'figma')).rejects.toThrow(
        'HTTPS',
      )
    }
  })
})
