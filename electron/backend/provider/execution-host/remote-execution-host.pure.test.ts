import { describe, expect, it } from 'vitest'
import { EXECUTION_PROTOCOL_VERSION } from '@mrck-labs/execution-host-protocol'
import { buildWireStartRequest } from './execution-host-wire-mapping.pure'
import type { EndpointHandshakeResult } from './execution-host-handshake.types'
import {
  daemonCapabilitiesFingerprint,
  describeRemoteExecutionHostFailure,
  capabilitiesForRemoteProvider,
  createSseParser,
  catalogEntryForRemoteProvider,
  describeRemoteProviderBlock,
  describeRemoteProviderListing,
  descriptorForRemoteProvider,
  localProviderIdForRemoteProvider,
  parseRemoteExecutionHostMeta,
  remoteProviderIdForLocalProvider,
  parseRemoteExecutionHostStartResponse,
  parseRemoteSessionWorkspaceInfo,
  remoteExecutionHostReconnectDelayMs,
  unavailableProviderError,
  UNKNOWN_DAEMON_CAPABILITIES,
} from './remote-execution-host.pure'
import { RemoteExecutionHostError } from './remote-execution-host.types'

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

describe('parseRemoteExecutionHostMeta', () => {
  it('maps the daemon provider listing to provider infos', () => {
    const infos = parseRemoteExecutionHostMeta(DAEMON_META)
    expect(infos).toEqual([
      {
        providerId: 'claude',
        name: 'Claude Code',
        available: true,
        authenticated: true,
        details: 'ready',
        supportsContinuation: true,
        models: [
          { id: 'sonnet', label: 'Claude Sonnet' },
          { id: 'opus', label: 'Claude Opus' },
        ],
      },
      {
        providerId: 'codex',
        name: 'Codex',
        available: false,
        authenticated: false,
        details: 'missing binary',
        supportsContinuation: false,
        models: [],
      },
    ])
  })

  it('throws a malformed error when the provider listing is missing', () => {
    expect(() => parseRemoteExecutionHostMeta({ name: 'daemon' })).toThrow(
      RemoteExecutionHostError,
    )
    try {
      parseRemoteExecutionHostMeta({})
    } catch (error) {
      expect((error as RemoteExecutionHostError).kind).toBe('malformed')
    }
  })

  it('throws a malformed error for a broken provider entry', () => {
    expect(() =>
      parseRemoteExecutionHostMeta({ providers: [{ id: 42 }] }),
    ).toThrow('malformed provider entry')
  })

  it('skips malformed model entries instead of failing the listing', () => {
    const infos = parseRemoteExecutionHostMeta({
      providers: [
        {
          id: 'claude',
          label: 'Claude',
          available: true,
          authenticated: true,
          models: [{ nope: true }, { slug: 'sonnet' }],
          features: { resume: true },
        },
      ],
    })
    expect(infos[0]?.models).toEqual([{ id: 'sonnet', label: 'sonnet' }])
  })
})

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

  it('parses the echoed session id and rejects malformed responses', () => {
    expect(
      parseRemoteExecutionHostStartResponse({
        protocolVersion: 1,
        sessionId: 's-1',
      }),
    ).toEqual({ sessionId: 's-1' })
    expect(() => parseRemoteExecutionHostStartResponse({})).toThrow(
      RemoteExecutionHostError,
    )
  })
})

describe('createSseParser', () => {
  it('parses events split across arbitrary chunk boundaries', () => {
    const parser = createSseParser()
    const events = [
      ...parser.feed('id: 1\nda'),
      ...parser.feed('ta: {"a":1}\n\nid: 2\n'),
      ...parser.feed('data: {"b":2}\n\n'),
    ]
    expect(events).toEqual([
      { id: '1', data: '{"a":1}' },
      { id: '2', data: '{"b":2}' },
    ])
  })

  it('joins multiple data lines with newlines', () => {
    const parser = createSseParser()
    expect(parser.feed('data: one\ndata: two\n\n')).toEqual([
      { id: null, data: 'one\ntwo' },
    ])
  })

  it('ignores comment lines and unknown fields and handles CRLF', () => {
    const parser = createSseParser()
    expect(
      parser.feed(': keep-alive\r\nretry: 500\r\nid: 7\r\ndata: x\r\n\r\n'),
    ).toEqual([{ id: '7', data: 'x' }])
  })

  it('emits nothing for blank lines without pending data', () => {
    const parser = createSseParser()
    expect(parser.feed('\n\n: comment\n\n')).toEqual([])
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

describe('parseRemoteSessionWorkspaceInfo', () => {
  it('extracts the workspace and pull request from a snapshot', () => {
    expect(
      parseRemoteSessionWorkspaceInfo({
        sessionId: 's-1',
        workspace: {
          repository: 'https://github.com/acme/repo.git',
          branchName: 'agent/12345678',
          baseRef: 'main',
        },
        prUrl: 'https://github.com/acme/repo/pull/7',
      }),
    ).toEqual({
      workspace: {
        repository: 'https://github.com/acme/repo.git',
        branchName: 'agent/12345678',
        baseRef: 'main',
      },
      prUrl: 'https://github.com/acme/repo/pull/7',
    })
  })

  it('handles snapshots without workspace or pull request', () => {
    expect(parseRemoteSessionWorkspaceInfo({ sessionId: 's-1' })).toEqual({
      workspace: null,
      prUrl: null,
    })
    expect(() => parseRemoteSessionWorkspaceInfo('nope')).toThrow(
      RemoteExecutionHostError,
    )
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

describe('daemonCapabilitiesFingerprint (MAR-2689 round 8)', () => {
  const handshakeAdvertising = (
    capabilities: string[],
  ): EndpointHandshakeResult => ({
    status: 'connected',
    daemonVersion: '0.26.1',
    daemonGitSha: null,
    daemonBuildTime: null,
    apiVersion: 'v0',
    uptimeSeconds: null,
    providers: {},
    providerReadiness: {},
    executionProtocolCapabilities: capabilities,
    sessionDirectorySearch: false,
    transcriptSearch: false,
    detail: null,
  })

  it('tells a machine that said nothing from one that said it offers nothing', () => {
    // The two facts a boolean lost, kept apart here for the same reason
    // `remoteProjectsCapability` keeps three states: a daemon whose /health is
    // unreadable is *unknown*, and an answer read while it was withheld is not
    // true of a machine that has since stopped answering at all.
    //
    // Mutation: fingerprint a null handshake as the empty set (`?? []`), and
    // this goes red -- a machine going dark stops moving its Endpoint's epoch.
    expect(daemonCapabilitiesFingerprint(null)).not.toBe(
      daemonCapabilitiesFingerprint(handshakeAdvertising([])),
    )
  })

  it('reads a capability list as a set, not as an order', () => {
    // A daemon is free to serialise its capabilities in any order, and a
    // reordering is not a change in what it can do. Counting it as one would
    // throw away every catalog on this machine for nothing.
    //
    // Mutation: join the capabilities as given instead of sorting a copy, and
    // this goes red.
    expect(
      daemonCapabilitiesFingerprint(
        handshakeAdvertising(['projects.v1', 'rooms.v1']),
      ),
    ).toBe(
      daemonCapabilitiesFingerprint(
        handshakeAdvertising(['rooms.v1', 'projects.v1']),
      ),
    )
  })

  it('moves when a capability is withdrawn', () => {
    // The fact round 8 exists for: the same machine, at the same address and
    // credential, offering one capability fewer than it did.
    //
    // Mutation: return a constant, and this goes red.
    expect(
      daemonCapabilitiesFingerprint(
        handshakeAdvertising(['projects.v1', 'rooms.v1']),
      ),
    ).not.toBe(
      daemonCapabilitiesFingerprint(handshakeAdvertising(['rooms.v1'])),
    )
  })

  it('tells two sets apart when one id holds the separator the other is joined on', () => {
    // Round 9's finding, and the rule behind it: never fingerprint a list by
    // joining it on a character its elements may contain. The protocol decoder
    // accepts any non-empty string as a capability id, so a daemon is free to
    // advertise one holding a NUL — and under a NUL join these two sets are the
    // same bytes while meaning opposite things. `remoteProjectsCapability` asks
    // for exact membership of `projects.v1`: the first set offers Projects, the
    // second withholds them. Collide them and a crafted /health keeps a stale
    // Projects catalog in force through the very mechanism that exists to stop
    // the strip and the start door disagreeing.
    //
    // Mutation: join the sorted ids on '\u0000' instead of encoding them, and
    // this goes red.
    expect(
      daemonCapabilitiesFingerprint(handshakeAdvertising(['projects.v1', 'x'])),
    ).not.toBe(
      daemonCapabilitiesFingerprint(
        handshakeAdvertising(['projects.v1\u0000x']),
      ),
    )
  })

  it('keeps the never-answered sentinel out of reach of any advertised set', () => {
    // The same defect one layer up, and why the sentinel is not a string a
    // capability id could equal. It used to be `'\u0000unknown'`, which is
    // exactly what a machine advertising the single id `\u0000unknown`
    // fingerprinted to — so "went dark" and "answered, oddly" were one value,
    // and the distinction the sentinel exists to make was unmade by an
    // attacker-chosen id. Written against the constant rather than a literal:
    // whatever the sentinel is, no advertised set may be able to produce it.
    //
    // Mutation: join the sorted ids on '\u0000' instead of encoding them, and
    // this goes red — with any join, the sentinel is whatever a one-id set
    // fingerprints to, whichever string it is. Restoring the round-8 sentinel
    // alone does not redden it, and cannot: an encoded set cannot equal a
    // scalar.
    expect(daemonCapabilitiesFingerprint(null)).not.toBe(
      daemonCapabilitiesFingerprint(
        handshakeAdvertising([UNKNOWN_DAEMON_CAPABILITIES]),
      ),
    )
  })
})
