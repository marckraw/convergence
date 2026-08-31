import { describe, expect, it } from 'vitest'
import type { AppSettings } from '../../app-settings/app-settings.types'
import { DAEMON_HEALTH_FIXTURE_0_26_1 } from './execution-host-health.fixture'
import { RemoteExecutionHost } from './remote-execution-host'
import {
  AppSettingsRemoteExecutionHostConnectionResolver,
  testRemoteExecutionHostConnection,
} from './remote-execution-host-connection'

function endpoint(
  id: string,
  baseUrl: string,
): AppSettings['executionHostEndpoints'][number] {
  return {
    id,
    label: id,
    baseUrl,
    position: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    configurationEpoch: 0,
  }
}

/**
 * A resolver over an explicit list of Endpoints and an explicit token per
 * Endpoint id. Both are keyed by id and neither has a fallback, so a resolver
 * that reached for the wrong machine gets nothing rather than something
 * plausible.
 */
function resolverOver(input: {
  endpointId: string
  endpoints: AppSettings['executionHostEndpoints']
  tokens: Record<string, string | null>
  observed?: Array<{ endpointId: string; fingerprint: string }>
}): AppSettingsRemoteExecutionHostConnectionResolver {
  return new AppSettingsRemoteExecutionHostConnectionResolver({
    appSettings: {
      getAppSettings: async () =>
        ({ executionHostEndpoints: input.endpoints }) as AppSettings,
      observeExecutionHostConfiguration: (
        endpointId: string,
        fingerprint: string,
      ) => {
        input.observed?.push({ endpointId, fingerprint })
      },
    },
    credentials: {
      resolveToken: async (endpointId: string) =>
        input.tokens[endpointId] ?? null,
    },
    endpointId: input.endpointId,
  })
}

function resolverWith(input: {
  baseUrl: string | null
  token: string | null
}): AppSettingsRemoteExecutionHostConnectionResolver {
  return resolverOver({
    endpointId: 'default',
    endpoints: input.baseUrl ? [endpoint('default', input.baseUrl)] : [],
    tokens: { default: input.token },
  })
}

/** One entry of a daemon `/v0/meta` listing, runnable unless said otherwise. */
function provider(
  id: string,
  label: string,
  overrides: { available?: boolean; authenticated?: boolean } = {},
): Record<string, unknown> {
  return {
    id,
    label,
    available: overrides.available ?? true,
    authenticated: overrides.authenticated ?? true,
    models: [{ slug: 'sonnet', label: 'Claude Sonnet' }],
    features: { resume: true },
  }
}

const META_RESPONSE = {
  providers: [provider('claude', 'Claude Code')],
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

  it('resolves the Endpoint it names, not whichever one is configured first', async () => {
    // The defect this resolver exists to make impossible: endpoint A is first
    // in the list, and a resolver bound to B must still address B. Reading by
    // position validated the id upstream and then discarded it, so a session
    // on B posted to A (MAR-2620).
    const resolver = resolverOver({
      endpointId: 'daemon-b',
      endpoints: [
        endpoint('daemon-a', 'https://daemon-a.test'),
        endpoint('daemon-b', 'https://daemon-b.test'),
      ],
      tokens: { 'daemon-a': 'token-a', 'daemon-b': 'token-b' },
    })

    await expect(resolver.resolveConnection()).resolves.toEqual({
      baseUrl: 'https://daemon-b.test',
      token: 'token-b',
    })
  })

  it('refuses when its own Endpoint is gone, even with others configured', async () => {
    const resolver = resolverOver({
      endpointId: 'daemon-b',
      endpoints: [endpoint('daemon-a', 'https://daemon-a.test')],
      tokens: { 'daemon-a': 'token-a' },
    })

    await expect(resolver.resolveConnection()).rejects.toMatchObject({
      kind: 'configuration',
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
      host: () =>
        hostWith(resolver, (async () => {
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
      host: () =>
        hostWith(resolver, (async () => {
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
      host: () => hostWith(resolver, okFetch),
    })
    expect(result.ok).toBe(true)
    expect(result.state).toBe('connected')
    expect(result.providers?.map((p) => p.providerId)).toEqual(['claude'])
  })

  it('counts the providers this daemon will run, not the ones it listed', async () => {
    // "Available" has to mean one thing in one app. Settings counted the whole
    // listing while the composer offered only the runnable ones, so the same
    // daemon was 5 upstairs and 3 downstairs (MAR-2682). Mutation: count
    // `providers.length` here again, and this goes red on the 3.
    const resolver = resolverWith({
      baseUrl: 'https://daemon.test',
      token: 'tok',
    })
    const mixedFetch = (async () =>
      new Response(
        JSON.stringify({
          providers: [
            provider('claude', 'Claude Code'),
            provider('codex', 'Codex'),
            provider('pi', 'Pi'),
            provider('cursor', 'Cursor', { available: false }),
            provider('gemini', 'Gemini', { authenticated: false }),
          ],
        }),
        { status: 200 },
      )) as typeof fetch

    const result = await testRemoteExecutionHostConnection({
      resolver,
      host: () => hostWith(resolver, mixedFetch),
    })

    expect(result.message).toBe(
      'Connected. 3 providers available, 2 blocked: Cursor, Gemini.',
    )
    // The blocked two are still carried, so the row that lists them can.
    expect(result.providers).toHaveLength(5)
  })

  it('reports the daemon version and capabilities it shook hands with', async () => {
    const resolver = resolverWith({
      baseUrl: 'https://daemon.test',
      token: 'tok',
    })
    const result = await testRemoteExecutionHostConnection({
      resolver,
      host: () => hostWith(resolver, daemonFetch(DAEMON_HEALTH_FIXTURE_0_26_1)),
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
      host: () => hostWith(resolver, daemonFetch(null)),
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
      host: () =>
        hostWith(
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
      host: () =>
        hostWith(
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
      host: () =>
        hostWith(resolver, (async () => {
          throw new Error('ECONNREFUSED')
        }) as typeof fetch),
    })
    expect(offline).toMatchObject({ ok: false, state: 'unreachable' })

    const malformed = await testRemoteExecutionHostConnection({
      resolver,
      host: () =>
        hostWith(
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
