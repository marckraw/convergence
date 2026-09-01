import { describe, expect, it } from 'vitest'
import { EXECUTION_PROTOCOL_VERSION } from '@mrck-labs/execution-host-protocol'
import {
  parseRemoteExecutionHostMeta,
  RemoteExecutionHostError,
} from '@convergence/execution-host-client'
import { buildWireStartRequest } from './execution-host-wire-mapping.pure'
import {
  capabilitiesForRemoteProvider,
  catalogEntryForRemoteProvider,
  describeRemoteExecutionHostFailure,
  describeRemoteProviderBlock,
  describeRemoteProviderListing,
  descriptorForRemoteProvider,
  localProviderIdForRemoteProvider,
  remoteExecutionHostReconnectDelayMs,
  remoteProviderIdForLocalProvider,
  unavailableProviderError,
} from './remote-execution-host.pure'

/**
 * A `/v0/meta` body, stated here as well as in the package's own parser tests
 * (MAR-2737).
 *
 * The two copies are not one fact split in two. The package's copy pins what
 * `parseRemoteExecutionHostMeta` *returns*; this one is only an input builder,
 * a short way to obtain two well-typed `RemoteExecutionHostProviderInfo` values
 * for the functions below. If a daemon ever changes this shape, the package's
 * copy is the one that has to move, and this one going stale can make these
 * rows unrepresentative but never wrong: the parser's return type is checked.
 */
const DAEMON_META = {
  name: 'agents-daemon',
  version: '0.1.0',
  apiVersion: 'v0',
  providers: [
    {
      id: 'claude',
      label: 'Claude Code',
      available: true,
      authenticated: true,
      cliVersion: '2.1.175',
      details: 'ready',
      models: [
        { slug: 'sonnet', label: 'Claude Sonnet' },
        { slug: 'opus', label: 'Claude Opus' },
      ],
      features: {
        streaming: true,
        resume: true,
        followup: true,
        structuredRequests: false,
        planMode: true,
      },
    },
    {
      id: 'codex',
      label: 'Codex',
      available: false,
      authenticated: false,
      cliVersion: null,
      details: 'missing binary',
      models: [],
      features: { streaming: true, resume: false, followup: true },
    },
  ],
}

describe('the two provider namespaces (MAR-2682)', () => {
  it('translates claude both ways from one table, so the halves cannot drift', () => {
    // A provider that translates out but not back is a session that starts and
    // can never be described again, so the pair is derived from one table.
    expect(remoteProviderIdForLocalProvider('claude-code')).toBe('claude')
    expect(localProviderIdForRemoteProvider('claude')).toBe('claude-code')
    expect(
      localProviderIdForRemoteProvider(
        remoteProviderIdForLocalProvider('claude-code'),
      ),
    ).toBe('claude-code')
  })

  it('translates an unknown id to itself rather than claiming it does not exist', () => {
    // Ruling 6. Answering "no such provider" for an id this table merely does
    // not know would be this process guessing what some daemon can run — the
    // same guess `REMOTE_CAPABLE_PROVIDER_IDS` made, in the same shape. What a
    // machine runs is what its own listing says.
    for (const id of ['codex', 'cursor', 'pi', 'gemini', 'antigravity']) {
      expect(remoteProviderIdForLocalProvider(id)).toBe(id)
      expect(localProviderIdForRemoteProvider(id)).toBe(id)
    }
  })
})

describe('describeRemoteProviderBlock', () => {
  it('quotes the daemon, rather than diagnosing on its behalf', () => {
    const [, codex] = parseRemoteExecutionHostMeta(DAEMON_META)
    expect(describeRemoteProviderBlock(codex!)).toBe(
      'The daemon reports Codex as unavailable: missing binary.',
    )
  })

  it('blocks nothing the daemon says it will run', () => {
    const [claude] = parseRemoteExecutionHostMeta(DAEMON_META)
    expect(describeRemoteProviderBlock(claude!)).toBeNull()
  })

  it('leads with availability, because an absent CLI cannot be signed in', () => {
    const [info] = parseRemoteExecutionHostMeta({
      providers: [
        {
          id: 'cursor',
          label: 'Cursor',
          available: false,
          authenticated: false,
          details: 'not installed',
          models: [],
          features: {},
        },
      ],
    })
    expect(describeRemoteProviderBlock(info!)).toBe(
      'The daemon reports Cursor as unavailable: not installed.',
    )
  })

  it('names the sign-in when the CLI is there and the credential is not', () => {
    const [info] = parseRemoteExecutionHostMeta({
      providers: [
        {
          id: 'codex',
          label: 'Codex',
          available: true,
          authenticated: false,
          models: [],
          features: {},
        },
      ],
    })
    // No `details` from this daemon, so the sentence is shorter and still only
    // says what the machine reported.
    expect(describeRemoteProviderBlock(info!)).toBe(
      'The daemon reports Codex as not signed in.',
    )
  })
})

describe('describeRemoteProviderListing', () => {
  function listing(
    entries: Array<{
      id: string
      label: string
      block?: 'absent' | 'signed-out'
    }>,
  ) {
    return parseRemoteExecutionHostMeta({
      providers: entries.map((entry) => ({
        id: entry.id,
        label: entry.label,
        available: entry.block !== 'absent',
        authenticated: entry.block === undefined,
        models: [],
        features: {},
      })),
    })
  }

  it('counts what the machine will run, not what it listed', () => {
    // The number Settings shows and the number of options the composer offers
    // are one fact. Counting the listing made them disagree by exactly the
    // blocked ones (MAR-2682).
    expect(
      describeRemoteProviderListing(
        listing([
          { id: 'claude', label: 'Claude Code' },
          { id: 'codex', label: 'Codex' },
          { id: 'pi', label: 'Pi' },
          { id: 'cursor', label: 'Cursor', block: 'absent' },
          { id: 'gemini', label: 'Gemini', block: 'signed-out' },
        ]),
      ),
    ).toBe('3 providers available, 2 blocked: Cursor, Gemini.')
  })

  it('says nothing about blocking when nothing is blocked', () => {
    expect(
      describeRemoteProviderListing(listing([{ id: 'pi', label: 'Pi' }])),
    ).toBe('1 provider available.')
  })

  it('is honest about a daemon that will run none of what it lists', () => {
    expect(
      describeRemoteProviderListing(
        listing([{ id: 'cursor', label: 'Cursor', block: 'absent' }]),
      ),
    ).toBe('0 providers available, 1 blocked: Cursor.')
  })
})

describe('catalogEntryForRemoteProvider', () => {
  it('pairs the local-namespace descriptor with the daemon’s own verdict', () => {
    const [claude, codex] = parseRemoteExecutionHostMeta(DAEMON_META)
    expect(catalogEntryForRemoteProvider(claude!)).toEqual({
      descriptor: descriptorForRemoteProvider(claude!),
      blockedReason: null,
    })
    const blocked = catalogEntryForRemoteProvider(codex!)
    expect(blocked.descriptor.id).toBe('codex')
    expect(blocked.blockedReason).toMatch(/missing binary/)
  })
})

describe('capabilitiesForRemoteProvider', () => {
  it('never advertises one-shot support', () => {
    const [claude] = parseRemoteExecutionHostMeta(DAEMON_META)
    expect(capabilitiesForRemoteProvider(claude!)).toEqual({
      providerId: 'claude',
      name: 'Claude Code',
      supportsContinuation: true,
      supportsOneShot: false,
      supportsContextManagement: false,
    })
  })
})

describe('descriptorForRemoteProvider', () => {
  it('synthesizes a conservative descriptor from the listing', () => {
    const [claude] = parseRemoteExecutionHostMeta(DAEMON_META)
    const descriptor = descriptorForRemoteProvider(claude!)
    expect(descriptor).toMatchObject({
      id: 'claude-code',
      name: 'Claude Code',
      kind: 'conversation',
      supportsContinuation: true,
      defaultModelId: 'sonnet',
      midRunInput: {
        supportsNativeFollowUp: true,
        defaultRunningMode: 'follow-up',
      },
    })
    expect(descriptor.modelOptions.map((m) => m.id)).toEqual(['sonnet', 'opus'])
    expect(descriptor.attachments.supportsImage).toBe(false)
  })

  it('defaults the model id to empty when the listing has no models', () => {
    const [, codex] = parseRemoteExecutionHostMeta(DAEMON_META)
    expect(descriptorForRemoteProvider(codex!).defaultModelId).toBe('')
  })
})
describe('start request and response', () => {
  it('builds a versioned start request around the session config', () => {
    const request = buildWireStartRequest('claude', {
      sessionId: 's-1',
      workingDirectory: '/work',
      initialMessage: 'hello',
      model: 'sonnet',
      effort: null,
      continuationToken: null,
    })
    expect(request.protocolVersion).toBe(EXECUTION_PROTOCOL_VERSION)
    expect(request.providerId).toBe('claude')
    expect(request.config.sessionId).toBe('s-1')
  })
})

describe('remoteExecutionHostReconnectDelayMs', () => {
  it('backs off exponentially and caps at thirty seconds', () => {
    expect(remoteExecutionHostReconnectDelayMs(1)).toBe(1000)
    expect(remoteExecutionHostReconnectDelayMs(2)).toBe(2000)
    expect(remoteExecutionHostReconnectDelayMs(3)).toBe(4000)
    expect(remoteExecutionHostReconnectDelayMs(10)).toBe(30_000)
  })
})

describe('describeRemoteExecutionHostFailure', () => {
  it('appends the HTTP status and an actionable hint by error kind', () => {
    expect(
      describeRemoteExecutionHostFailure(
        new RemoteExecutionHostError('Invalid API token', 'auth', 401),
      ),
    ).toBe(
      'Invalid API token (HTTP 401) The daemon rejected the API token; update it in Settings under Remote execution host.',
    )
    expect(
      describeRemoteExecutionHostFailure(
        new RemoteExecutionHostError('ECONNREFUSED', 'network'),
      ),
    ).toContain('Test connection in Settings')
  })

  it('passes through plain errors and http errors without hints', () => {
    expect(describeRemoteExecutionHostFailure(new Error('boom'))).toBe('boom')
    expect(
      describeRemoteExecutionHostFailure(
        new RemoteExecutionHostError(
          'Workspace materialization failed: repo not found',
          'http',
          400,
        ),
      ),
    ).toBe('Workspace materialization failed: repo not found (HTTP 400)')
  })
})
describe('unavailableProviderError', () => {
  it('says provider not found only once the daemon has answered', () => {
    const error = unavailableProviderError({
      providerId: 'claude',
      listed: true,
      listingFailure: null,
    })

    expect(error.message).toBe('Provider not found: claude')
  })

  it('reports why the listing failed instead of blaming the provider', () => {
    const error = unavailableProviderError({
      providerId: 'claude',
      listed: false,
      listingFailure: new RemoteExecutionHostError(
        'Remote execution host is unreachable: fetch failed',
        'network',
      ),
    })

    expect(error.message).toContain('never listed its providers')
    expect(error.message).toContain('unreachable')
    expect(error.message).not.toContain('Provider not found')
    // The kind rides along, so the settings connection test and the
    // conversation note classify this exactly as they classify the listing
    // failure underneath it.
    expect(error).toBeInstanceOf(RemoteExecutionHostError)
    expect((error as RemoteExecutionHostError).kind).toBe('network')
  })

  it('keeps an auth failure an auth failure', () => {
    const error = unavailableProviderError({
      providerId: 'codex',
      listed: false,
      listingFailure: new RemoteExecutionHostError('Unauthorized', 'auth', 401),
    })

    expect((error as RemoteExecutionHostError).kind).toBe('auth')
    expect((error as RemoteExecutionHostError).status).toBe(401)
    expect(describeRemoteExecutionHostFailure(error)).toContain(
      'rejected the API token',
    )
  })

  it('admits it has not asked yet when nothing has failed', () => {
    const error = unavailableProviderError({
      providerId: 'claude',
      listed: false,
      listingFailure: null,
    })

    expect(error.message).toContain('has not listed its providers yet')
    expect(error.message).not.toContain('Provider not found')
  })
})
