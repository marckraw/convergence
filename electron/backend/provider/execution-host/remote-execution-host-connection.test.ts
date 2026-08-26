import { describe, expect, it } from 'vitest'
import type { AppSettings } from '../../app-settings/app-settings.types'
import { DAEMON_HEALTH_FIXTURE_0_26_1 } from './execution-host-health.fixture'
import { RemoteExecutionHost } from './remote-execution-host'
import {
  AppSettingsRemoteExecutionHostConnectionResolver,
  testRemoteExecutionHostConnection,
} from './remote-execution-host-connection'

function resolverWith(input: {
  baseUrl: string | null
  token: string | null
}): AppSettingsRemoteExecutionHostConnectionResolver {
  return new AppSettingsRemoteExecutionHostConnectionResolver({
    appSettings: {
      getAppSettings: async () =>
        ({
          executionHostEndpoints: input.baseUrl
            ? [
                {
                  id: 'default',
                  label: 'Remote daemon',
                  baseUrl: input.baseUrl,
                  position: 0,
                  createdAt: '2026-01-01',
                  updatedAt: '2026-01-01',
                },
              ]
            : [],
        }) as AppSettings,
    },
    // The token is keyed by endpoint id (MAR-2620): a resolver that asked for
    // the wrong machine's token would still get one, so the fixture refuses
    // any id but the one endpoint it was built with.
    credentials: {
      resolveToken: async (endpointId: string) =>
        endpointId === 'default' ? input.token : null,
    },
  })
}

const META_RESPONSE = {
  providers: [
    {
      id: 'claude',
      label: 'Claude Code',
      available: true,
      authenticated: true,
      models: [{ slug: 'sonnet', label: 'Claude Sonnet' }],
      features: { resume: true },
    },
  ],
}

function hostWith(
  resolver: AppSettingsRemoteExecutionHostConnectionResolver,
  fetchFn: typeof fetch,
): RemoteExecutionHost {
  return new RemoteExecutionHost({ connection: resolver, fetch: fetchFn })
}

const okFetch = (async () =>
  new Response(JSON.stringify(META_RESPONSE), { status: 200 })) as typeof fetch

/**
 * A daemon that answers both routes: `/health` with a body of the caller's
 * choosing, `/v0/meta` with the provider listing.
 */
function daemonFetch(healthBody: string | null): typeof fetch {
  return (async (input: unknown) => {
    if (String(input).endsWith('/health')) {
      return healthBody === null
        ? new Response('{}', { status: 404 })
        : new Response(healthBody, { status: 200 })
    }
    return new Response(JSON.stringify(META_RESPONSE), { status: 200 })
  }) as typeof fetch
}

function healthWith(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    ...(JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1) as Record<string, unknown>),
    ...overrides,
  })
}

describe('AppSettingsRemoteExecutionHostConnectionResolver', () => {
  it('resolves the configured base URL and token', async () => {
    const resolver = resolverWith({
      baseUrl: 'https://daemon.test',
      token: 'tok',
    })
    await expect(resolver.resolveConnection()).resolves.toEqual({
      baseUrl: 'https://daemon.test',
      token: 'tok',
    })
  })

  it('throws configuration errors for missing base URL and token', async () => {
    await expect(
      resolverWith({ baseUrl: null, token: 'tok' }).resolveConnection(),
    ).rejects.toMatchObject({ kind: 'configuration' })
    await expect(
      resolverWith({
        baseUrl: 'https://daemon.test',
        token: '  ',
      }).resolveConnection(),
    ).rejects.toMatchObject({ kind: 'configuration' })
  })
})

describe('testRemoteExecutionHostConnection', () => {
  it('reports missing configuration without touching the network', async () => {
    const resolver = resolverWith({ baseUrl: null, token: null })
    const result = await testRemoteExecutionHostConnection({
      resolver,
      host: hostWith(resolver, (async () => {
        throw new Error('must not be called')
      }) as typeof fetch),
    })
    expect(result).toMatchObject({ ok: false, state: 'missing-base-url' })
  })

  it('reports a missing token before probing the daemon', async () => {
    const resolver = resolverWith({
      baseUrl: 'https://daemon.test',
      token: null,
    })
    const result = await testRemoteExecutionHostConnection({
      resolver,
      host: hostWith(resolver, (async () => {
        throw new Error('must not be called')
      }) as typeof fetch),
    })
    expect(result).toMatchObject({
      ok: false,
      state: 'missing-token',
      baseUrl: 'https://daemon.test',
    })
  })

  it('connects and reports the provider listing', async () => {
    const resolver = resolverWith({
      baseUrl: 'https://daemon.test',
      token: 'tok',
    })
    const result = await testRemoteExecutionHostConnection({
      resolver,
      host: hostWith(resolver, okFetch),
    })
    expect(result.ok).toBe(true)
    expect(result.state).toBe('connected')
    expect(result.providers?.map((p) => p.providerId)).toEqual(['claude'])
  })

  it('reports the daemon version and capabilities it shook hands with', async () => {
    const resolver = resolverWith({
      baseUrl: 'https://daemon.test',
      token: 'tok',
    })
    const result = await testRemoteExecutionHostConnection({
      resolver,
      host: hostWith(resolver, daemonFetch(DAEMON_HEALTH_FIXTURE_0_26_1)),
    })

    expect(result.ok).toBe(true)
    expect(result.state).toBe('connected')
    expect(result.daemon).toMatchObject({ version: '0.26.1', apiVersion: 'v0' })
    expect(result.daemon?.protocolCapabilities).toHaveLength(17)
  })

  it('connects with an unknown daemon when /health is not served', async () => {
    const resolver = resolverWith({
      baseUrl: 'https://daemon.test',
      token: 'tok',
    })
    const result = await testRemoteExecutionHostConnection({
      resolver,
      host: hostWith(resolver, daemonFetch(null)),
    })

    expect(result).toMatchObject({
      ok: true,
      state: 'connected',
      daemon: null,
    })
  })

  it('refuses a daemon speaking a protocol this app cannot read', async () => {
    const resolver = resolverWith({
      baseUrl: 'https://daemon.test',
      token: 'tok',
    })
    const result = await testRemoteExecutionHostConnection({
      resolver,
      host: hostWith(
        resolver,
        daemonFetch(
          healthWith({
            executionProtocol: { version: 2, capabilities: [] },
          }),
        ),
      ),
    })

    expect(result.ok).toBe(false)
    expect(result.state).toBe('incompatible')
    // Still named, so the message says which daemon needs attention.
    expect(result.daemon?.version).toBe('0.26.1')
  })

  it('maps error kinds to connection states', async () => {
    const resolver = resolverWith({
      baseUrl: 'https://daemon.test',
      token: 'tok',
    })

    const unauthorized = await testRemoteExecutionHostConnection({
      resolver,
      host: hostWith(
        resolver,
        (async () =>
          new Response(JSON.stringify({ error: 'nope' }), {
            status: 401,
          })) as typeof fetch,
      ),
    })
    expect(unauthorized).toMatchObject({ ok: false, state: 'auth-failed' })

    const offline = await testRemoteExecutionHostConnection({
      resolver,
      host: hostWith(resolver, (async () => {
        throw new Error('ECONNREFUSED')
      }) as typeof fetch),
    })
    expect(offline).toMatchObject({ ok: false, state: 'unreachable' })

    const malformed = await testRemoteExecutionHostConnection({
      resolver,
      host: hostWith(
        resolver,
        (async () =>
          new Response(JSON.stringify({ nonsense: true }), {
            status: 200,
          })) as typeof fetch,
      ),
    })
    expect(malformed).toMatchObject({ ok: false, state: 'invalid-response' })
  })
})
