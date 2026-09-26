import { describe, expect, it, vi } from 'vitest'
import type { CodexServerHostRegistry } from '../provider/codex/codex-server-host'
import { ProviderAccountMcpService } from './provider-account-mcp.service'
import type { ProviderAccountRepository } from './provider-account.repository'

function bench() {
  const pages: Record<string, { name: string; installUrl: string | null }> = {
    figma: { name: 'Figma', installUrl: 'https://chatgpt.com/apps/figma' },
    'installed-only': { name: 'Another app', installUrl: null },
  }
  let installed = [
    {
      id: 'figma',
      runtimeName: 'figma-runtime',
      enabled: true,
      callable: true,
    },
    {
      id: 'installed-only',
      runtimeName: 'Another app',
      enabled: true,
      callable: false,
    },
  ]
  const request = vi.fn(
    async (method: string, params: unknown): Promise<unknown> => {
      if (method === 'account/read') return { account: { type: 'chatgpt' } }
      if (method === 'app/installed') return { apps: installed }
      if (method === 'app/read') {
        const ids = (params as { appIds: string[] }).appIds
        return {
          apps: ids
            .filter((id) => pages[id])
            .map((id) => ({ id, ...pages[id], description: null })),
          missingAppIds: ids.filter((id) => !pages[id]),
        }
      }
      // The directory is ~4,570 apps behind ChatGPT's bot check; no read of
      // this panel may touch it (MAR-3485).
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
  return {
    service,
    request,
    get,
    pages,
    setInstalled: (next: typeof installed) => {
      installed = next
    },
  }
}

const methods = (request: ReturnType<typeof bench>['request']) =>
  request.mock.calls.map(([method]) => method)

describe('MAR-3458/MAR-3485 account-scoped ChatGPT apps', () => {
  it('R1 reads each account host: installed snapshot + app/read names, never the directory', async () => {
    const b = bench()
    expect(await b.service.listChatGptApps('a', true)).toEqual({
      providerAccountId: 'a',
      requiresChatGpt: false,
      error: null,
      apps: [
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
    expect(b.request).toHaveBeenCalledWith('app/installed', {
      forceRefresh: true,
    })
    expect(b.request).toHaveBeenCalledWith('app/read', {
      appIds: ['figma', 'installed-only'],
    })
    expect(methods(b.request)).not.toContain('app/list')
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
    expect(methods(b.request)).not.toContain('app/list')
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
  it('MAR-3485 a Cloudflare challenge page arrives as one sentence, never as HTML', async () => {
    const b = bench()
    b.request.mockRejectedValueOnce(
      new Error(
        'failed to list apps: Request failed with status 403 Forbidden: <html><head></head><body><script>window._cf_chl_opt={}</script></body></html>',
      ),
    )
    const { error } = await b.service.listChatGptApps('a', true)
    expect(error).toBe(
      "Could not read ChatGPT apps: ChatGPT's bot check refused the request (403). The apps themselves may still work in conversations. Try Refresh in a minute.",
    )
  })
  it('MAR-3485 a refused name read keeps every installed row under its runtime name', async () => {
    const b = bench()
    const inner = b.request.getMockImplementation()!
    b.request.mockImplementation(async (method, params) => {
      if (method === 'app/read') throw new Error('403 Forbidden')
      return inner(method, params)
    })
    expect(await b.service.listChatGptApps('a')).toEqual({
      providerAccountId: 'a',
      requiresChatGpt: false,
      error: null,
      apps: [
        { id: 'installed-only', name: 'Another app', state: 'unavailable' },
        { id: 'figma', name: 'figma-runtime', state: 'available' },
      ],
    })
  })
  it('MAR-3485 more than a hundred installed apps are named in hundred-id requests', async () => {
    const b = bench()
    b.setInstalled(
      Array.from({ length: 150 }, (_, i) => ({
        id: `app-${i}`,
        runtimeName: `App ${i}`,
        enabled: true,
        callable: true,
      })),
    )
    const { apps } = await b.service.listChatGptApps('a')
    expect(apps).toHaveLength(150)
    const reads = b.request.mock.calls.filter(
      ([method]) => method === 'app/read',
    )
    expect(
      reads.map(([, params]) => (params as { appIds: string[] }).appIds.length),
    ).toEqual([100, 50])
  })
  it('MAR-3485 a host with no published snapshot yet is asked once more, forced', async () => {
    const b = bench()
    const inner = b.request.getMockImplementation()!
    b.request.mockImplementation(async (method, params) => {
      if (
        method === 'app/installed' &&
        !(params as { forceRefresh: boolean }).forceRefresh
      )
        return { apps: [] }
      return inner(method, params)
    })
    const { apps, error } = await b.service.listChatGptApps('a')
    expect(error).toBeNull()
    expect(apps.map((app) => app.id)).toEqual(['installed-only', 'figma'])
    expect(
      b.request.mock.calls
        .filter(([method]) => method === 'app/installed')
        .map(([, params]) => params),
    ).toEqual([{ forceRefresh: false }, { forceRefresh: true }])
  })
  it('MAR-3485 an account with no apps is asked forced once, then shows none', async () => {
    const b = bench()
    b.setInstalled([])
    expect(await b.service.listChatGptApps('a')).toMatchObject({
      apps: [],
      error: null,
    })
    expect(
      b.request.mock.calls.filter(([method]) => method === 'app/installed'),
    ).toHaveLength(2)
    b.request.mockClear()
    await b.service.listChatGptApps('a', true)
    expect(
      b.request.mock.calls.filter(([method]) => method === 'app/installed'),
    ).toHaveLength(1)
  })
  it('MAR-3485 one refused name batch keeps the names the other batches found', async () => {
    const b = bench()
    b.setInstalled(
      Array.from({ length: 150 }, (_, i) => ({
        id: `app-${i}`,
        runtimeName: `runtime ${i}`,
        enabled: true,
        callable: true,
      })),
    )
    b.request.mockImplementation(async (method, params) => {
      if (method === 'account/read') return { account: { type: 'chatgpt' } }
      if (method === 'app/installed')
        return {
          apps: Array.from({ length: 150 }, (_, i) => ({
            id: `app-${i}`,
            runtimeName: `runtime ${i}`,
            enabled: true,
            callable: true,
          })),
        }
      if (method === 'app/read') {
        const ids = (params as { appIds: string[] }).appIds
        if (ids.includes('app-0')) throw new Error('403 Forbidden')
        return {
          apps: ids.map((id) => ({
            id,
            name: `Named ${id}`,
            installUrl: null,
          })),
          missingAppIds: [],
        }
      }
      throw new Error(`Unexpected RPC ${method}`)
    })
    const { apps, error } = await b.service.listChatGptApps('a')
    expect(error).toBeNull()
    const names = new Map(apps.map((app) => [app.id, app.name]))
    expect(names.get('app-0')).toBe('runtime 0')
    expect(names.get('app-149')).toBe('Named app-149')
  })
  it('MAR-3485 an app/read answer without apps (a changed shape) keeps the runtime names', async () => {
    const b = bench()
    const inner = b.request.getMockImplementation()!
    b.request.mockImplementation(async (method, params) =>
      method === 'app/read' ? {} : inner(method, params),
    )
    const { apps, error } = await b.service.listChatGptApps('a')
    expect(error).toBeNull()
    expect(apps.find((app) => app.id === 'figma')?.name).toBe('figma-runtime')
  })
  it('refuses missing accounts without falling back to the ambient host', async () => {
    const b = bench()
    expect((await b.service.listChatGptApps('unknown')).error).toBeTruthy()
    expect(b.get).not.toHaveBeenCalled()
  })
  it('MAR-3485 Manage passes a refused lookup on as itself, never as "no ChatGPT page"', async () => {
    const b = bench()
    const inner = b.request.getMockImplementation()!
    b.request.mockImplementation(async (method, params) => {
      if (method === 'app/read') throw new Error('403 Forbidden from app/read')
      return inner(method, params)
    })
    await expect(b.service.chatGptAppUrl('a', 'figma')).rejects.toThrow(
      '403 Forbidden from app/read',
    )
  })
  it('R3 resolves the page with app/read for that one app, fresh each time, never the directory', async () => {
    const b = bench()
    await expect(b.service.chatGptAppUrl('a', 'figma')).resolves.toBe(
      'https://chatgpt.com/apps/figma',
    )
    expect(b.request).toHaveBeenLastCalledWith('app/read', {
      appIds: ['figma'],
    })
    b.pages.figma.installUrl = 'https://chatgpt.com/apps/updated'
    await expect(b.service.chatGptAppUrl('a', 'figma')).resolves.toBe(
      'https://chatgpt.com/apps/updated',
    )
    await expect(b.service.chatGptAppUrl('a', 'unknown')).rejects.toThrow(
      'no ChatGPT page',
    )
    await expect(
      b.service.chatGptAppUrl('a', 'installed-only'),
    ).rejects.toThrow('no ChatGPT page')
    for (const url of [
      'http://chatgpt.com/apps/figma',
      'file:///tmp/fixture',
      'javascript:alert(1)',
    ]) {
      b.pages.figma.installUrl = url
      await expect(b.service.chatGptAppUrl('a', 'figma')).rejects.toThrow(
        'HTTPS',
      )
    }
    expect(methods(b.request)).not.toContain('app/list')
  })
})
