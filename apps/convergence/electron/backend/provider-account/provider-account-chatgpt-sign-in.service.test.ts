import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CodexServerHostRegistry } from '../provider/codex/codex-server-host'
import {
  CONFIGURED_SERVER_STARTUP_WAIT_MS,
  CHATGPT_SIGN_IN_PROBE_CONCURRENCY,
  CHATGPT_SIGN_IN_PROBE_TIMEOUT_MS,
  ProviderAccountMcpService,
} from './provider-account-mcp.service'
import type { ProviderAccountRepository } from './provider-account.repository'

type Call = { method: string; params: unknown }

function appTool(
  name: string,
  app: string,
  { readOnly = true, owner = null as { email?: string } | null } = {},
) {
  return {
    name,
    annotations: { readOnlyHint: readOnly },
    inputSchema: { required: [] },
    _meta: { connector_id: app, link_owner_profile: owner },
  }
}

const FIGMA_REAUTH = {
  content: [],
  isError: true,
  structuredContent: {
    error: 'This app connection requires reauthentication.',
    error_code: 'UNAUTHORIZED',
    error_data: { action: 'TRIGGER_REAUTHENTICATION' },
  },
}

type InstalledApp = {
  id: string
  runtimeName: string
  enabled: boolean
  callable: boolean
}

function bench(
  toolCall: (tool: string) => Promise<unknown> = async (tool) =>
    tool === 'figma.whoami'
      ? FIGMA_REAUTH
      : tool === 'github.get_profile'
        ? { structuredContent: { name: 'Marcin', email: 'm@icloud.com' } }
        : { content: [{ type: 'text', text: '[]' }] },
  overrides: {
    installed?: (forceRefresh: boolean) => InstalledApp[]
    tools?: ReturnType<typeof appTool>[]
    /** Configured servers per read; `threadId` set once the thread exists. */
    configured?: (threadId: string | null) => Array<Record<string, unknown>>
  } = {},
) {
  const calls: Call[] = []
  const defaultInstalled: InstalledApp[] = [
    { id: 'figma', runtimeName: 'Figma', enabled: true, callable: true },
    { id: 'github', runtimeName: 'GitHub', enabled: true, callable: true },
    {
      id: 'connector_openai_hotline',
      runtimeName: 'Hotline',
      enabled: true,
      callable: true,
    },
    { id: 'off', runtimeName: 'Off app', enabled: false, callable: false },
    { id: 'writer', runtimeName: 'Writer', enabled: true, callable: true },
  ]
  const defaultTools = [
    appTool('figma.whoami', 'figma', { owner: { email: 'me@ef.com' } }),
    appTool('figma.delete', 'figma', { readOnly: false }),
    appTool('github.get_profile', 'github'),
    appTool('hotline.ping', 'connector_openai_hotline'),
    appTool('off.whoami', 'off'),
    appTool('writer.save', 'writer', { readOnly: false }),
  ]
  const tools = overrides.tools ?? defaultTools
  const request = vi.fn(
    async (method: string, params?: unknown): Promise<unknown> => {
      calls.push({ method, params })
      if (method === 'account/read') return { account: { type: 'chatgpt' } }
      if (method === 'app/installed')
        return {
          apps: overrides.installed
            ? overrides.installed(
                (params as { forceRefresh: boolean }).forceRefresh,
              )
            : defaultInstalled,
        }
      if (method === 'mcpServerStatus/list')
        return {
          data: [
            ...(overrides.configured?.(
              (params as { threadId?: string }).threadId ?? null,
            ) ?? []),
            {
              name: 'codex_apps',
              tools: Object.fromEntries(tools.map((t) => [t.name, t])),
            },
          ],
          nextCursor: null,
        }
      if (method === 'thread/start') return { thread: { id: 'thread-1' } }
      if (method === 'thread/unsubscribe') return { status: 'unsubscribed' }
      if (method === 'mcpServer/tool/call')
        return toolCall((params as { tool: string }).tool)
      throw new Error(`Unexpected RPC ${method}`)
    },
  )
  const serverRequestHandlers: Array<
    (method: string, params: unknown, id: number) => void
  > = []
  const onServerRequest = vi.fn(
    (handler: (method: string, params: unknown, id: number) => void) => {
      serverRequestHandlers.push(handler)
    },
  )
  const respondError = vi.fn()
  const get = vi.fn(() => ({
    run: async (
      work: (rpc: {
        request: typeof request
        onServerRequest: typeof onServerRequest
        respondError: typeof respondError
      }) => Promise<unknown>,
    ) => work({ request, onServerRequest, respondError }),
  }))
  const service = new ProviderAccountMcpService({
    repository: {
      get: (id: string) =>
        id === 'a'
          ? {
              id,
              providerId: 'codex',
              configDir: '/fixture/a',
              executionHostId: 'local',
              status: 'connected',
              label: id,
            }
          : null,
    } as unknown as ProviderAccountRepository,
    codexServerHosts: { get } as unknown as CodexServerHostRegistry,
    runInteractiveCommand: vi.fn(),
  })
  const toolCalls = () =>
    calls
      .filter((call) => call.method === 'mcpServer/tool/call')
      .map((call) => (call.params as { tool: string }).tool)
  return {
    service,
    request,
    calls,
    toolCalls,
    serverRequestHandlers,
    respondError,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('MAR-3470 checking each ChatGPT app by using it', () => {
  it('one row per installed app, each from what a call observed or why none was made', async () => {
    const b = bench()
    const result = await b.service.checkChatGptAppSignIns('a')
    expect(result.error).toBeNull()
    expect(result.checkedAt).toEqual(expect.any(String))
    expect(result.signIns).toEqual([
      {
        appId: 'figma',
        status: 'needs-sign-in',
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
      { appId: 'writer', status: 'unchecked', account: null, reason: null },
    ])
    expect(b.toolCalls().sort()).toEqual(['figma.whoami', 'github.get_profile'])
  })
  it('the calls ride one ephemeral thread on codex_apps, released afterwards', async () => {
    const b = bench()
    await b.service.checkChatGptAppSignIns('a')
    const start = b.calls.find((call) => call.method === 'thread/start')
    expect(start?.params).toMatchObject({ ephemeral: true })
    expect(
      b.calls.filter((call) => call.method === 'thread/start'),
    ).toHaveLength(1)
    for (const call of b.calls.filter(
      (entry) => entry.method === 'mcpServer/tool/call',
    ))
      expect(call.params).toMatchObject({
        threadId: 'thread-1',
        server: 'codex_apps',
        arguments: {},
      })
    expect(b.calls.at(-1)).toEqual({
      method: 'thread/unsubscribe',
      params: { threadId: 'thread-1' },
    })
    expect(b.calls.map((call) => call.method)).not.toContain('turn/start')
  })
  it('a call that throws is "couldn\'t check" for that app only, and the thread is still released', async () => {
    const b = bench(async (tool) => {
      if (tool === 'figma.whoami') throw new Error('socket hang up')
      return { structuredContent: { name: 'Marcin' } }
    })
    const { signIns, error } = await b.service.checkChatGptAppSignIns('a')
    expect(error).toBeNull()
    expect(signIns.find((entry) => entry.appId === 'figma')).toEqual({
      appId: 'figma',
      status: 'failed',
      account: 'me@ef.com',
      reason: 'socket hang up',
    })
    expect(signIns.find((entry) => entry.appId === 'github')?.status).toBe(
      'signed-in',
    )
    expect(b.calls.at(-1)?.method).toBe('thread/unsubscribe')
  })
  it(`an app that does not answer within ${CHATGPT_SIGN_IN_PROBE_TIMEOUT_MS / 1000} s does not hold the others`, async () => {
    vi.useFakeTimers()
    const b = bench(async (tool) =>
      tool === 'figma.whoami'
        ? new Promise(() => {})
        : { structuredContent: { name: 'Marcin' } },
    )
    const checking = b.service.checkChatGptAppSignIns('a')
    await vi.advanceTimersByTimeAsync(CHATGPT_SIGN_IN_PROBE_TIMEOUT_MS)
    const { signIns } = await checking
    expect(signIns.find((entry) => entry.appId === 'figma')).toMatchObject({
      status: 'failed',
      reason: `No answer within ${CHATGPT_SIGN_IN_PROBE_TIMEOUT_MS / 1000} s.`,
    })
    expect(signIns.find((entry) => entry.appId === 'github')?.status).toBe(
      'signed-in',
    )
    expect(b.calls.at(-1)?.method).toBe('thread/unsubscribe')
  })
  it('answers every question Codex asks on the check with a refusal', async () => {
    const b = bench()
    await b.service.checkChatGptAppSignIns('a')
    expect(b.serverRequestHandlers).toHaveLength(1)
    b.serverRequestHandlers[0]('mcpServer/elicitation/request', {}, 41)
    expect(b.respondError).toHaveBeenCalledExactlyOnceWith(
      41,
      -32601,
      'The ChatGPT sign-in check answers no interactions',
    )
  })
  it(`at most ${CHATGPT_SIGN_IN_PROBE_CONCURRENCY} calls at once on the shared server`, async () => {
    let running = 0
    let peak = 0
    const apps = Array.from({ length: 7 }, (_, i) => `app${i}`)
    const b = bench(
      async () => {
        running++
        peak = Math.max(peak, running)
        await new Promise((resolve) => setTimeout(resolve, 5))
        running--
        return { structuredContent: { name: 'Me' } }
      },
      {
        installed: () =>
          apps.map((id) => ({
            id,
            runtimeName: id,
            enabled: true,
            callable: true,
          })),
        tools: apps.map((id) => appTool(`${id}.whoami`, id)),
      },
    )
    const { signIns } = await b.service.checkChatGptAppSignIns('a')
    expect(signIns.map((entry) => entry.status)).toEqual(
      apps.map(() => 'signed-in'),
    )
    expect(b.toolCalls()).toHaveLength(7)
    expect(peak).toBe(CHATGPT_SIGN_IN_PROBE_CONCURRENCY)
  })
  it('no app to call starts no thread, and still says what each app is', async () => {
    const b = bench(undefined, {
      installed: () => [
        {
          id: 'connector_openai_hotline',
          runtimeName: 'Hotline',
          enabled: true,
          callable: true,
        },
        { id: 'writer', runtimeName: 'Writer', enabled: true, callable: true },
      ],
    })
    const result = await b.service.checkChatGptAppSignIns('a')
    expect(result.signIns.map((entry) => entry.status)).toEqual([
      'built-in',
      'unchecked',
    ])
    expect(result.checkedAt).toEqual(expect.any(String))
    expect(b.calls.map((call) => call.method)).not.toContain('thread/start')
  })
  it('an app listed twice is checked once', async () => {
    const figma = {
      id: 'figma',
      runtimeName: 'Figma',
      enabled: true,
      callable: true,
    }
    const b = bench(undefined, { installed: () => [figma, figma] })
    const { signIns } = await b.service.checkChatGptAppSignIns('a')
    expect(signIns).toHaveLength(1)
    expect(b.toolCalls()).toEqual(['figma.whoami'])
  })
  it('an empty unforced installed list is asked once more, forced', async () => {
    const b = bench(undefined, {
      installed: (forceRefresh) =>
        forceRefresh
          ? [
              {
                id: 'figma',
                runtimeName: 'Figma',
                enabled: true,
                callable: true,
              },
            ]
          : [],
    })
    const { signIns } = await b.service.checkChatGptAppSignIns('a')
    expect(signIns.map((entry) => entry.appId)).toEqual(['figma'])
    expect(
      b.calls
        .filter((call) => call.method === 'app/installed')
        .map((call) => call.params),
    ).toEqual([{ forceRefresh: false }, { forceRefresh: true }])
  })
  it('an API-key account starts no thread and checks nothing', async () => {
    const b = bench()
    b.request.mockResolvedValueOnce({ account: { type: 'apiKey' } })
    expect(await b.service.checkChatGptAppSignIns('a')).toEqual({
      providerAccountId: 'a',
      checkedAt: null,
      signIns: [],
      servers: [],
      error: null,
    })
    expect(b.request.mock.calls.map(([method]) => method)).toEqual([
      'account/read',
    ])
  })
  it('a thread without an id is an error in one sentence, and no tool is called', async () => {
    const b = bench()
    const inner = b.request.getMockImplementation()!
    b.request.mockImplementation(async (method, params) =>
      method === 'thread/start' ? {} : inner(method, params),
    )
    const result = await b.service.checkChatGptAppSignIns('a')
    expect(result.error).toBe(
      'Could not check sign-ins: Codex started no thread for the sign-in check.',
    )
    expect(b.toolCalls()).toEqual([])
  })
  it('reads every page of the MCP status list', async () => {
    const b = bench()
    const inner = b.request.getMockImplementation()!
    b.request.mockImplementation(async (method, params) => {
      if (method !== 'mcpServerStatus/list') return inner(method, params)
      const cursor = (params as { cursor: string | null }).cursor
      return cursor
        ? {
            data: [
              {
                name: 'codex_apps',
                tools: {
                  'github.get_profile': appTool('github.get_profile', 'github'),
                },
              },
            ],
            nextCursor: null,
          }
        : {
            data: [
              {
                name: 'codex_apps',
                tools: {
                  'figma.whoami': appTool('figma.whoami', 'figma'),
                },
              },
            ],
            nextCursor: 'second',
          }
    })
    await b.service.checkChatGptAppSignIns('a')
    expect(b.toolCalls().sort()).toEqual(['figma.whoami', 'github.get_profile'])
  })
  describe('servers configured on this Mac', () => {
    const linearTools = {
      list_issues: { name: 'list_issues', annotations: { readOnlyHint: true } },
      get_user: {
        name: 'get_user',
        annotations: { readOnlyHint: true },
        inputSchema: { required: ['query'] },
      },
    }
    it('a connected Linear is asked who you are on its own server; Codex saying sign-in is needed takes no call', async () => {
      const b = bench(
        async (tool) =>
          tool === 'get_user'
            ? {
                content: [
                  {
                    type: 'text',
                    text: '{"name":"marckraw@icloud.com","email":"marckraw@icloud.com"}',
                  },
                ],
              }
            : { structuredContent: { name: 'Me' } },
        {
          installed: () => [],
          configured: (threadId) => [
            {
              name: 'linear',
              runtimeStatus: threadId ? 'connected' : null,
              authStatus: 'oAuth',
              tools: linearTools,
            },
            {
              name: 'figma',
              runtimeStatus: threadId ? 'authenticationRequired' : null,
              authStatus: 'oAuth',
              tools: {},
            },
          ],
        },
      )
      const result = await b.service.checkChatGptAppSignIns('a')
      expect(result.servers).toEqual([
        {
          server: 'linear',
          status: 'signed-in',
          account: 'marckraw@icloud.com',
          reason: null,
        },
        {
          server: 'figma',
          status: 'needs-sign-in',
          account: null,
          reason: null,
        },
      ])
      const serverCalls = b.calls
        .filter((call) => call.method === 'mcpServer/tool/call')
        .map((call) => call.params)
      expect(serverCalls).toEqual([
        {
          threadId: 'thread-1',
          server: 'linear',
          tool: 'get_user',
          arguments: { query: 'me' },
        },
      ])
      expect(b.calls.at(-1)?.method).toBe('thread/unsubscribe')
    })
    it('waits for a server that is still starting, then checks it', async () => {
      let reads = 0
      const b = bench(
        async () => ({ structuredContent: { name: 'Me', email: 'me@x.io' } }),
        {
          installed: () => [],
          configured: (threadId) => {
            if (threadId) reads++
            return [
              {
                name: 'linear',
                runtimeStatus: !threadId
                  ? null
                  : reads < 2
                    ? 'starting'
                    : 'connected',
                authStatus: 'oAuth',
                tools: linearTools,
              },
            ]
          },
        },
      )
      const { servers } = await b.service.checkChatGptAppSignIns('a')
      expect(servers).toEqual([
        {
          server: 'linear',
          status: 'signed-in',
          account: 'Me (me@x.io)',
          reason: null,
        },
      ])
      expect(reads).toBe(2)
    })
    it(`a server still starting after ${CONFIGURED_SERVER_STARTUP_WAIT_MS / 1000} s says so and is not called`, async () => {
      vi.useFakeTimers()
      const b = bench(undefined, {
        installed: () => [],
        configured: (threadId) => [
          {
            name: 'linear',
            runtimeStatus: threadId ? 'starting' : null,
            authStatus: 'oAuth',
            tools: linearTools,
          },
        ],
      })
      const checking = b.service.checkChatGptAppSignIns('a')
      await vi.advanceTimersByTimeAsync(
        CONFIGURED_SERVER_STARTUP_WAIT_MS + 1_000,
      )
      const { servers } = await checking
      expect(servers).toEqual([
        {
          server: 'linear',
          status: 'failed',
          account: null,
          reason: 'The server did not finish starting.',
        },
      ])
      expect(b.toolCalls()).toEqual([])
    })
  })
  it('refuses a missing account without touching any host', async () => {
    const b = bench()
    const result = await b.service.checkChatGptAppSignIns('unknown')
    expect(result.error).toMatch(/^Could not check sign-ins:/)
    expect(b.calls).toEqual([])
  })
})

describe('MAR-3526 a narrowed check calls only the apps and servers it was asked about', () => {
  it('Figma alone: no who-am-I for GitHub, no Linear server call', async () => {
    const b = bench(undefined, {
      configured: (threadId) => [
        {
          name: 'linear',
          runtimeStatus: threadId ? 'connected' : null,
          authStatus: 'oAuth',
          tools: {},
        },
        {
          name: 'figma',
          runtimeStatus: threadId ? 'authenticationRequired' : null,
          authStatus: 'oAuth',
          tools: {},
        },
      ],
    })
    const result = await b.service.checkChatGptAppSignIns('a', {
      appIds: ['figma'],
      servers: /\bfigma\b/i,
    })
    expect(b.toolCalls()).toEqual(['figma.whoami'])
    expect(result.signIns.map((entry) => entry.appId)).toEqual(['figma'])
    expect(result.servers.map((entry) => entry.server)).toEqual(['figma'])
  })
  it('asked about nothing in particular, it checks everything as before', async () => {
    const b = bench()
    await b.service.checkChatGptAppSignIns('a')
    expect(b.toolCalls()).toEqual(['figma.whoami', 'github.get_profile'])
  })
})
