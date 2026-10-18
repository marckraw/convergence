import { describe, expect, it } from 'vitest'
import { EXECUTION_PROTOCOL_VERSION } from '@mrck-labs/execution-host-protocol'
import {
  DAEMON_HEALTH_FIXTURE_0_26_1,
  parseDaemonHealth,
  parseRemoteExecutionHostProviders,
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
  readSnapshotRunningTasks,
} from './remote-execution-host.pure'

/**
 * A `/v0/providers` body, stated here as well as in the package's own parser
 * tests (MAR-2737).
 *
 * The two copies are not one fact split in two. The package's copy pins what
 * `parseRemoteExecutionHostProviders` *returns*; this one is only an input builder,
 * a short way to obtain two well-typed `RemoteExecutionHostProviderInfo` values
 * for the functions below. If a daemon ever changes this shape, the package's
 * copy is the one that has to move, and this one going stale can make these
 * rows unrepresentative but never wrong: the parser's return type is checked.
 */
const DAEMON_PROVIDERS = {
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
    const [, codex] = parseRemoteExecutionHostProviders(DAEMON_PROVIDERS)
    expect(describeRemoteProviderBlock(codex!)).toBe(
      'The daemon reports Codex as unavailable: missing binary.',
    )
  })

  it('blocks nothing the daemon says it will run', () => {
    const [claude] = parseRemoteExecutionHostProviders(DAEMON_PROVIDERS)
    expect(describeRemoteProviderBlock(claude!)).toBeNull()
  })

  it('leads with availability, because an absent CLI cannot be signed in', () => {
    const [info] = parseRemoteExecutionHostProviders({
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
    const [info] = parseRemoteExecutionHostProviders({
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
    return parseRemoteExecutionHostProviders({
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

  it('says both numbers when they differ, and names what is blocked', () => {
    // The number Settings shows and the number of options the composer offers
    // are one fact. Counting the listing made them disagree by exactly the
    // blocked ones (MAR-2682) -- and then saying only the runnable count made a
    // reader add two numbers together to learn what the daemon actually has
    // (MAR-2580). Five listed, three of them runnable, said once each.
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
    ).toBe('5 providers, 3 available (blocked: Cursor, Gemini).')
  })

  it('says one number when every listed provider is runnable', () => {
    expect(
      describeRemoteProviderListing(listing([{ id: 'pi', label: 'Pi' }])),
    ).toBe('1 provider available.')
  })

  it('is honest about a daemon that will run none of what it lists', () => {
    expect(
      describeRemoteProviderListing(
        listing([{ id: 'cursor', label: 'Cursor', block: 'absent' }]),
      ),
    ).toBe('1 provider, 0 available (blocked: Cursor).')
  })

  /**
   * The four combinations the daemon can report per provider, one row each
   * (MAR-2580).
   *
   * Only the first is runnable. The other three are the ways a CLI can be on a
   * machine and still not start: not installed, installed but signed out, and
   * the pair a daemon sends for a provider it knows nothing about. Counting
   * `providers.length` -- the defect -- makes all four say "available".
   *
   * Mutation: count every listed entry as available and every row but the
   * first goes red.
   */
  it.each([
    { available: true, authenticated: true, sentence: '1 provider available.' },
    {
      available: true,
      authenticated: false,
      sentence: '1 provider, 0 available (blocked: Codex).',
    },
    {
      available: false,
      authenticated: true,
      sentence: '1 provider, 0 available (blocked: Codex).',
    },
    {
      available: false,
      authenticated: false,
      sentence: '1 provider, 0 available (blocked: Codex).',
    },
  ])(
    'counts available=$available authenticated=$authenticated as $sentence',
    ({ available, authenticated, sentence }) => {
      expect(
        describeRemoteProviderListing(
          parseRemoteExecutionHostProviders({
            providers: [
              {
                id: 'codex',
                label: 'Codex',
                available,
                authenticated,
                models: [],
                features: {},
              },
            ],
          }),
        ),
      ).toBe(sentence)
    },
  )

  /**
   * Which source the two flags come from, said out loud (MAR-2580).
   *
   * `/v0/providers`, because it is the only listing this sentence is ever handed.
   * `/health` reports the same two booleans per provider as `providerReadiness`
   * (`installed`/`authenticated`) and the handshake keeps them, but they are
   * never merged into a `RemoteExecutionHostProviderInfo`: merging would change
   * which providers this app will START on a machine, which is a different
   * decision from how many it says are available, and one this ticket did not
   * make.
   *
   * Pinned by making the two sources disagree. The captured daemon's `/health`
   * calls Cursor and Gemini neither installed nor signed in; the meta listing
   * below says all four are ready. The sentence follows the meta listing, so
   * "which source" is answered by the assertion and not only by this comment --
   * and the day a daemon really does disagree, this row is where it shows up.
   */
  it('counts the /v0/providers flags, not the /health readiness pair', () => {
    const health = parseDaemonHealth(JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1))
    expect(health!.providerReadiness).toMatchObject({
      cursor: { installed: false, authenticated: false },
      gemini: { installed: false, authenticated: false },
    })

    expect(
      describeRemoteProviderListing(
        listing([
          { id: 'claude', label: 'Claude Code' },
          { id: 'codex', label: 'Codex' },
          { id: 'cursor', label: 'Cursor' },
          { id: 'gemini', label: 'Gemini' },
        ]),
      ),
    ).toBe('4 providers available.')
  })
})

describe('catalogEntryForRemoteProvider', () => {
  it('pairs the local-namespace descriptor with the daemon’s own verdict', () => {
    const [claude, codex] = parseRemoteExecutionHostProviders(DAEMON_PROVIDERS)
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
    const [claude] = parseRemoteExecutionHostProviders(DAEMON_PROVIDERS)
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
    const [claude] = parseRemoteExecutionHostProviders(DAEMON_PROVIDERS)
    const descriptor = descriptorForRemoteProvider(claude!)
    expect(descriptor).toMatchObject({
      id: 'claude-code',
      name: 'Claude Code',
      kind: 'conversation',
      supportsContinuation: true,
      // Answered from the LOCAL id this row records (R8): a remote Claude
      // Code is still a Claude Code, so the connection inspector may offer
      // "clear the conversation first" for a session running on a daemon.
      supportsConversationReset: true,
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
    const [, codex] = parseRemoteExecutionHostProviders(DAEMON_PROVIDERS)
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

describe('remote conversation reset capability', () => {
  it('advertises reset only for remote Claude — derive remote Codex reset from the local capability turns red', () => {
    const [claude, codex] = parseRemoteExecutionHostProviders(DAEMON_PROVIDERS)
    expect({
      claude: descriptorForRemoteProvider(claude!).supportsConversationReset,
      codex: descriptorForRemoteProvider(codex!).supportsConversationReset,
    }).toEqual({ claude: true, codex: false })
  })
})

describe('readSnapshotRunningTasks (MAR-3987)', () => {
  it('reads the count a snapshot of this session carries, zero included', () => {
    expect(
      readSnapshotRunningTasks({ sessionId: 's-1', runningTasks: 2 }, 's-1'),
    ).toBe(2)
    expect(
      readSnapshotRunningTasks({ sessionId: 's-1', runningTasks: 0 }, 's-1'),
    ).toBe(0)
  })

  it('reads nothing from another session, or a count that is not one', () => {
    expect(
      readSnapshotRunningTasks({ sessionId: 's-2', runningTasks: 2 }, 's-1'),
    ).toBeNull()
    expect(readSnapshotRunningTasks({ sessionId: 's-1' }, 's-1')).toBeNull()
    for (const runningTasks of [-1, 1.5, '2', null, Number.MAX_VALUE])
      expect(
        readSnapshotRunningTasks({ sessionId: 's-1', runningTasks }, 's-1'),
      ).toBeNull()
    expect(readSnapshotRunningTasks(null, 's-1')).toBeNull()
  })
})

/**
 * The provider catalogue read whole (MAR-4272): what a host says about its
 * provider beyond whether it runs -- its efforts, its permission choices, how
 * it asks, and its account's usage -- reaches the catalog entry in this app's
 * words, and its account does not.
 */
describe('the provider catalogue on a remote catalog entry', () => {
  const CATALOGUE = {
    providers: [
      {
        id: 'claude',
        label: 'Claude Code',
        available: true,
        authenticated: true,
        details: 'ready',
        models: [
          {
            slug: 'sonnet',
            label: 'Claude Sonnet',
            defaultEffort: 'medium',
            effortOptions: [{ id: 'low' }, { id: 'medium' }, { id: 'warp' }],
          },
          { slug: 'opus', label: 'Claude Opus', defaultEffort: 'warp' },
        ],
        features: {
          resume: true,
          effortLevels: ['low', 'high'],
          permissions: {
            presets: ['ask', 'yolo', 'custom'],
            claudeCode: { permissionModes: ['default', 'plan'] },
          },
          interactions: { inputRequests: ['plan'], unavailable: ['url'] },
        },
        account: { label: 'owner@example.com', source: 'sign-in' },
        usage: {
          observedAt: '2026-10-18T10:00:00.000Z',
          source: 'turn',
          windows: [
            {
              id: 'seven_day_opus',
              span: 'week',
              label: 'Opus week',
              usedPercent: 40,
              modelFamily: 'opus',
            },
          ],
          credits: { hasCredits: false, unlimited: false },
        },
      },
      {
        id: 'codex',
        label: 'Codex',
        models: [{ slug: 'gpt-5.5', label: 'GPT-5.5' }],
        features: {
          permissions: {
            presets: ['ask', 'custom'],
            codex: {
              approvalPolicies: ['on-request', 'never'],
              sandboxModes: ['read-only', 'workspace-write'],
              effectiveSandboxModes: {
                'workspace-write': 'danger-full-access',
                'danger-full-access': null,
              },
              collaborationModes: ['default'],
            },
          },
        },
      },
    ],
  }

  it("offers each model the host's own efforts, and only ones this app can name", () => {
    const [claude] = parseRemoteExecutionHostProviders(CATALOGUE)
    const { modelOptions } = descriptorForRemoteProvider(claude!)
    expect(
      modelOptions.map((model) => ({
        id: model.id,
        defaultEffort: model.defaultEffort,
        efforts: model.effortOptions.map((effort) => effort.id),
      })),
    ).toEqual([
      { id: 'sonnet', defaultEffort: 'medium', efforts: ['low', 'medium'] },
      // The provider's levels, for a model that names none of its own; a
      // default outside the list is not offered as one.
      { id: 'opus', defaultEffort: null, efforts: ['low', 'high'] },
    ])
    expect(modelOptions[0]!.effortOptions[1]).toEqual({
      id: 'medium',
      label: 'Medium',
      description: undefined,
    })
  })

  it('sends the chosen remote effort on the start', () => {
    const request = buildWireStartRequest('claude', {
      sessionId: 's-1',
      workingDirectory: '/work',
      initialMessage: 'hello',
      model: 'sonnet',
      effort: 'low',
      continuationToken: null,
    })
    expect(request.config).toMatchObject({ model: 'sonnet', effort: 'low' })
  })

  it("carries how the host's provider asks, as a local provider declares it", () => {
    const [claude, codex] = parseRemoteExecutionHostProviders(CATALOGUE)
    expect(descriptorForRemoteProvider(claude!).interactions).toEqual({
      inputRequests: ['plan'],
      passiveUpdates: [],
      unavailable: ['url'],
    })
    expect(descriptorForRemoteProvider(codex!)).not.toHaveProperty(
      'interactions',
    )
  })

  it("carries the host's permission choices and what each sandbox runs as", () => {
    const [, codex] = parseRemoteExecutionHostProviders(CATALOGUE)
    expect(catalogEntryForRemoteProvider(codex!).hostPermissions).toEqual({
      presets: ['ask', 'custom'],
      codex: {
        approvalPolicies: ['on-request', 'never'],
        sandboxModes: ['read-only', 'workspace-write'],
        effectiveSandboxModes: {
          'workspace-write': 'danger-full-access',
          'danger-full-access': null,
        },
      },
      claudeCode: null,
    })
  })

  it("carries the host account's usage, the credits' time defaulting to the usage's", () => {
    const [claude, codex] = parseRemoteExecutionHostProviders(CATALOGUE)
    expect(catalogEntryForRemoteProvider(claude!).hostUsage).toEqual({
      observedAt: '2026-10-18T10:00:00.000Z',
      source: 'turn',
      status: null,
      windows: [
        {
          id: 'seven_day_opus',
          span: 'week',
          label: 'Opus week',
          usedPercent: 40,
          resetsAt: null,
          modelFamily: 'opus',
        },
      ],
      credits: {
        hasCredits: false,
        unlimited: false,
        balance: null,
        observedAt: '2026-10-18T10:00:00.000Z',
      },
    })
    expect(catalogEntryForRemoteProvider(codex!)).not.toHaveProperty(
      'hostUsage',
    )
  })

  it('never puts the account on the entry the renderer is handed', () => {
    const entries = parseRemoteExecutionHostProviders(CATALOGUE).map(
      catalogEntryForRemoteProvider,
    )
    expect(JSON.stringify(entries)).not.toContain('owner@example.com')
  })

  it('blocks nothing on a readiness the host does not state', () => {
    const [, codex] = parseRemoteExecutionHostProviders(CATALOGUE)
    expect(codex!.available).toBeNull()
    expect(describeRemoteProviderBlock(codex!)).toBeNull()
  })
})
