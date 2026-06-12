import { describe, expect, it } from 'vitest'
import type { AppSettings } from '../../app-settings/app-settings.types'
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
        ({ executionHostRemoteBaseUrl: input.baseUrl }) as AppSettings,
    },
    credentials: { resolveToken: async () => input.token },
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
