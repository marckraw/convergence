import { describe, expect, it } from 'vitest'
import { AppSettingsRemoteExecutionHostConnectionResolver } from './remote-execution-host-connection'

/**
 * One Endpoint as `EndpointConfigurationSource` describes it (MAR-2737).
 *
 * The port's shape and not the app's: Convergence's own
 * `ConfiguredExecutionHostEndpoint` carries a label, a position, timestamps and
 * an epoch, and the resolver reads none of them. A fixture that restated the
 * app's whole row would quietly make this package depend on it again through
 * the test file.
 */
function endpoint(
  id: string,
  baseUrl: string,
): { id: string; baseUrl: string } {
  return { id, baseUrl }
}

/**
 * A resolver over an explicit list of Endpoints and an explicit token per
 * Endpoint id. Both are keyed by id and neither has a fallback, so a resolver
 * that reached for the wrong machine gets nothing rather than something
 * plausible.
 */
function resolverOver(input: {
  endpointId: string
  endpoints: { id: string; baseUrl: string }[]
  tokens: Record<string, string | null>
  observed?: Array<{ endpointId: string; fingerprint: string }>
}): AppSettingsRemoteExecutionHostConnectionResolver {
  return new AppSettingsRemoteExecutionHostConnectionResolver({
    appSettings: {
      getAppSettings: async () => ({ executionHostEndpoints: input.endpoints }),
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
