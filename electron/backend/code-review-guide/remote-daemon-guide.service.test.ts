import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettingsService } from '../app-settings/app-settings.service'
import type { GuidedReviewDaemonCredentialsService } from '../credentials/guided-review-daemon-credentials.service'
import { RemoteCodeReviewGuideDaemonClient } from './remote-daemon-guide.service'

describe('RemoteCodeReviewGuideDaemonClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
  })

  it('tests a daemon connection through health and authenticated metadata', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(makeHealth()))
      .mockResolvedValueOnce(jsonResponse(makeMeta()))

    const client = makeClient({ fetchMock })
    const result = await client.testConnection()

    expect(result).toMatchObject({
      ok: true,
      state: 'connected',
      baseUrl: 'https://daemon.example.com/root',
      message: 'Connected to agents-daemon.',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://daemon.example.com/root/health',
      expect.objectContaining({
        method: 'GET',
        headers: {},
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://daemon.example.com/root/v0/meta',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Authorization: 'Bearer daemon-token',
        },
      }),
    )
  })

  it('reports a missing daemon base URL without making a request', async () => {
    const client = makeClient({ baseUrl: null, fetchMock })

    await expect(client.testConnection()).resolves.toMatchObject({
      ok: false,
      state: 'missing-base-url',
      message: 'Remote daemon base URL is not configured.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a missing daemon token after health succeeds', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(makeHealth()))
    const client = makeClient({ token: null, fetchMock })

    await expect(client.testConnection()).resolves.toMatchObject({
      ok: false,
      state: 'missing-token',
      health: expect.objectContaining({ status: 'ok' }),
      message: 'Remote daemon API token is not configured.',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports daemon auth failures from authenticated metadata', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(makeHealth()))
      .mockResolvedValueOnce(
        jsonResponse({ error: 'Invalid API token' }, { status: 401 }),
      )
    const client = makeClient({ fetchMock })

    await expect(client.testConnection()).resolves.toMatchObject({
      ok: false,
      state: 'auth-failed',
      message: 'Invalid API token',
    })
  })

  it('reports network failures as unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    const client = makeClient({ fetchMock })

    await expect(client.testConnection()).resolves.toMatchObject({
      ok: false,
      state: 'unreachable',
      message: 'Remote daemon is unreachable: connect ECONNREFUSED',
    })
  })

  it('reports malformed daemon metadata responses', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(makeHealth()))
      .mockResolvedValueOnce(jsonResponse({ name: 123 }))
    const client = makeClient({ fetchMock })

    await expect(client.testConnection()).resolves.toMatchObject({
      ok: false,
      state: 'invalid-response',
      message: expect.stringContaining(
        'Remote daemon returned an invalid response:',
      ),
    })
  })

  it('posts guide generation requests with bearer auth and parses the result', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(makeGuideResult()))
    const client = makeClient({ fetchMock })

    const result = await client.generateGuide({
      repository: 'https://github.com/org/repo',
      pullRequestNumber: 42,
      provider: 'codex',
      model: 'gpt-5.3-codex',
      effort: 'high',
      force: true,
    })

    expect(result.guideDraft).toMatchObject({
      overview: 'Review backend boundary first.',
      generatedBy: 'agent',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://daemon.example.com/root/v0/code-review-guides/generate',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer daemon-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: {
            repository: 'https://github.com/org/repo',
            pullRequest: { number: 42 },
          },
          provider: 'codex',
          model: 'gpt-5.3-codex',
          effort: 'high',
          force: true,
        }),
      }),
    )
  })

  it('resolves generation models against authenticated daemon metadata', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        makeMeta({
          providers: [
            {
              id: 'codex',
              available: true,
              authenticated: true,
              models: [
                { slug: 'gpt-5.4', label: 'GPT-5.4' },
                { slug: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
              ],
            },
          ],
        }),
      ),
    )
    const client = makeClient({ fetchMock })

    await expect(
      client.resolveGenerationModel({
        provider: 'codex',
        preferredModel: 'gpt-5.5',
      }),
    ).resolves.toBe('gpt-5.4')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://daemon.example.com/root/v0/meta',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Authorization: 'Bearer daemon-token',
        },
      }),
    )
  })

  it('fails model resolution when the daemon provider is unavailable', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        makeMeta({
          providers: [
            {
              id: 'cursor',
              available: false,
              authenticated: false,
              models: [],
            },
          ],
        }),
      ),
    )
    const client = makeClient({ fetchMock })

    await expect(
      client.resolveGenerationModel({
        provider: 'cursor',
        preferredModel: 'auto',
      }),
    ).rejects.toMatchObject({
      kind: 'configuration',
      message: 'Remote daemon provider cursor is unavailable.',
    })
  })

  it('does not double-prefix stored Bearer tokens', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(makeHealth()))
      .mockResolvedValueOnce(jsonResponse(makeMeta()))
    const client = makeClient({ token: 'Bearer pasted-token', fetchMock })

    await client.testConnection()

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer pasted-token',
        },
      }),
    )
  })

  it('rejects guide generation when the daemon token is missing', async () => {
    const client = makeClient({ token: null, fetchMock })

    await expect(
      client.generateGuide({
        repository: 'https://github.com/org/repo',
        pullRequestNumber: 42,
        provider: 'codex',
        model: 'gpt-5.3-codex',
      }),
    ).rejects.toMatchObject({
      kind: 'configuration',
      message: 'Remote daemon API token is not configured.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects malformed daemon guide responses', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ guide: { status: 'ready' } }),
    )
    const client = makeClient({ fetchMock })

    await expect(
      client.generateGuide({
        repository: 'https://github.com/org/repo',
        pullRequestNumber: 42,
        provider: 'codex',
        model: 'gpt-5.3-codex',
      }),
    ).rejects.toMatchObject({
      kind: 'malformed',
    })
  })
})

function makeClient(input: {
  baseUrl?: string | null
  token?: string | null
  fetchMock: ReturnType<typeof vi.fn>
}): RemoteCodeReviewGuideDaemonClient {
  const appSettings = {
    getAppSettings: vi.fn(async () => ({
      guidedReviewRemoteBaseUrl:
        input.baseUrl === undefined
          ? 'https://daemon.example.com/root/'
          : input.baseUrl,
    })),
  } as unknown as AppSettingsService
  const credentials = {
    resolveToken: vi.fn(async () =>
      input.token === undefined ? 'daemon-token' : input.token,
    ),
  } as unknown as GuidedReviewDaemonCredentialsService

  return new RemoteCodeReviewGuideDaemonClient({
    appSettings,
    credentials,
    fetch: input.fetchMock as unknown as typeof fetch,
  })
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeHealth() {
  return {
    status: 'ok',
    version: '1.0.0',
    apiVersion: 'v0',
    uptime: 60,
    activeSessions: 0,
    providers: {
      codex: true,
      claude: true,
      cursor: false,
      gemini: false,
    },
  }
}

function makeMeta(input: { providers?: unknown[] } = {}) {
  return {
    name: 'agents-daemon',
    version: '1.0.0',
    apiVersion: 'v0',
    deployment: {
      mode: 'self_hosted',
      sharedAcrossTeams: true,
    },
    providers: input.providers ?? [],
    mcp: {
      clients: [],
      servers: [],
    },
    git: {
      githubAuthenticated: true,
      identity: null,
    },
    runtime: {
      activeSessions: 0,
      maxConcurrentAgents: 2,
      uptimeSeconds: 60,
      dataDir: '/data',
      host: '0.0.0.0',
      port: 7800,
    },
  }
}

function makeGuideResult() {
  const cacheIdentity = {
    comparisonRef: 'refs/remotes/origin/main',
    comparisonPoint: 'abc123',
    workingTreeVersionToken: 'pr-42:abc123',
  }
  const pullRequest = {
    provider: 'github',
    repositoryOwner: 'org',
    repositoryName: 'repo',
    number: 42,
    title: 'Add remote review',
    url: 'https://github.com/org/repo/pull/42',
    state: 'open',
    baseBranch: 'main',
    headBranch: 'feature',
    headRepositoryOwner: null,
    headRepositoryName: null,
  }
  const summary = {
    cacheIdentity,
    files: [{ file: 'electron/main/ipc.ts', status: 'M' }],
  }
  const guide = {
    id: 'guide-1',
    repository: 'https://github.com/org/repo',
    pullRequestNumber: 42,
    targetId: 'github:org/repo#42',
    mode: 'pull-request',
    cacheIdentity,
    provider: 'codex',
    model: 'gpt-5.3-codex',
    effort: 'high',
    status: 'ready',
    overview: 'Review backend boundary first.',
    generatedBy: 'agent',
    sections: [
      {
        id: 'runtime',
        title: 'Runtime Boundary',
        summary: 'IPC and daemon client changes.',
        narrative: 'Start with the backend contract.',
        riskLevel: 'high',
        riskRationale: 'IPC affects renderer/backend trust boundaries.',
        checklist: ['Confirm auth token stays in the backend.'],
        files: [
          {
            path: 'electron/main/ipc.ts',
            status: 'M',
            reason: 'Registers the connection test.',
            hunkHints: ['IPC registration'],
          },
        ],
      },
    ],
    error: null,
    pullRequest,
    summary,
    createdAt: '2026-06-04T10:00:00.000Z',
    updatedAt: '2026-06-04T10:00:00.000Z',
  }

  return {
    pullRequest,
    summary,
    guide,
  }
}
