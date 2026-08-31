import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import type {
  AttentionState,
  SessionStartConfig,
  SessionStatus,
} from '../provider.types'
import {
  describeProviderExecutionHostContract,
  type ExecutionHostContractContext,
} from './execution-host.contract'
import {
  DAEMON_HEALTH_FIXTURE_0_26_1,
  daemonHealthFixtureWithoutDescriptor,
} from './execution-host-health.fixture'
import {
  createStubDaemon,
  envelope,
  waitUntil,
  type StubDaemon,
} from './execution-host-daemon.fixture'
import { RemoteExecutionHost } from './remote-execution-host'
import { RemoteExecutionHostError } from './remote-execution-host.types'
import type { ProviderDebugSink } from '../../provider-debug/provider-debug-sink'
import type { ProviderDebugEntry } from '../../provider-debug/provider-debug.types'

function createHost(
  stub: StubDaemon,
  options: {
    healthProbeTimeoutMs?: number
    debugSink?: ProviderDebugSink
  } = {},
): RemoteExecutionHost {
  return new RemoteExecutionHost({
    connection: {
      resolveConnection: async () => ({
        baseUrl: 'http://daemon.test',
        token: 'test-token',
      }),
    },
    fetch: stub.fetchFn,
    reconnect: { maxAttempts: 2, wait: async () => {} },
    ...options,
  })
}

interface DaemonIdentity {
  version: string
  providerId: string
}

interface RacingDaemon {
  fetchFn: typeof fetch
  /** Answers the nth `/health` request, 0-based in arrival order. */
  releaseHealth: (index: number) => void
  /** Answers the nth `/v0/meta` request, 0-based in arrival order. */
  releaseMeta: (index: number) => void
}

/**
 * A daemon whose answers are held until the test releases them, so two
 * overlapping refreshes can be interleaved deliberately. Each refresh gets its
 * own identity — a different version on `/health` and a different provider on
 * `/v0/meta` — which is what makes a mismatched pair visible.
 */
function createRacingDaemon(identities: DaemonIdentity[]): RacingDaemon {
  const gate = () => {
    let release!: () => void
    const promise = new Promise<void>((resolve) => {
      release = resolve
    })
    return { promise, release }
  }
  const healthGates = identities.map(gate)
  const metaGates = identities.map(gate)
  let healthCalls = 0
  let metaCalls = 0

  const jsonResponse = (body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const fetchFn = (async (input: unknown) => {
    const url = String(input)
    if (url.endsWith('/health')) {
      const identity = identities[healthCalls]
      await healthGates[healthCalls++].promise
      return jsonResponse({
        ...(JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1) as Record<
          string,
          unknown
        >),
        version: identity.version,
      })
    }
    if (url.endsWith('/v0/meta')) {
      const identity = identities[metaCalls]
      await metaGates[metaCalls++].promise
      return jsonResponse({
        providers: [
          {
            id: identity.providerId,
            label: identity.providerId,
            available: true,
            authenticated: true,
            models: [],
            features: { resume: true, followup: true },
          },
        ],
      })
    }
    throw new Error(`Unexpected request: ${url}`)
  }) as typeof fetch

  return {
    fetchFn,
    releaseHealth: (index) => healthGates[index].release(),
    releaseMeta: (index) => metaGates[index].release(),
  }
}

function createRacingHost(racing: RacingDaemon): RemoteExecutionHost {
  return new RemoteExecutionHost({
    connection: {
      resolveConnection: async () => ({
        baseUrl: 'http://daemon.test',
        token: 'test-token',
      }),
    },
    fetch: racing.fetchFn,
  })
}

/** Lets every already-scheduled continuation run before the test goes on. */
async function settleScheduledWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function startConfig(sessionId: string): SessionStartConfig {
  return {
    sessionId,
    workingDirectory: '/work',
    initialMessage: 'hello',
    model: null,
    effort: null,
    continuationToken: null,
  }
}

describe('RemoteExecutionHost', () => {
  let stub: StubDaemon
  let host: RemoteExecutionHost

  beforeEach(async () => {
    stub = createStubDaemon()
    host = createHost(stub)
    await host.refreshProviders()
  })

  describe('contract suite', () => {
    let ctx: ExecutionHostContractContext

    beforeEach(() => {
      ctx = {
        host,
        fullProviderId: 'claude',
        describedProviderId: 'claude-code',
        noOneShotProviderId: 'codex',
        unknownProviderId: 'missing-provider',
        hostSupportsOneShot: false,
      }
    })

    describeProviderExecutionHostContract('RemoteExecutionHost', () => ctx)
  })

  it('classifies meta auth failures', async () => {
    stub.setMetaStatus(401)
    await expect(host.refreshProviders()).rejects.toMatchObject({
      name: 'RemoteExecutionHostError',
      kind: 'auth',
    })
  })

  it('classifies unreachable daemons as network errors', async () => {
    const offline = new RemoteExecutionHost({
      connection: {
        resolveConnection: async () => ({
          baseUrl: 'http://daemon.test',
          token: 'tok',
        }),
      },
      fetch: (async () => {
        throw new Error('ECONNREFUSED')
      }) as typeof fetch,
    })
    await expect(offline.refreshProviders()).rejects.toMatchObject({
      kind: 'network',
    })
  })

  describe('the catalog the option row reads (MAR-2682)', () => {
    it('describes the daemon’s providers in the local namespace', async () => {
      const catalog = await host.describeCatalog()
      expect(catalog.providers.map((entry) => entry.descriptor.id)).toEqual([
        'claude-code',
        'codex',
      ])
      // A session records the local id, so a catalog handing out daemon ids
      // would offer rows `resolveExecution` translates again and cannot find.
      expect(catalog.unreachableReason).toBeNull()
    })

    it('blocks a provider the daemon will not run, in the daemon’s own words', async () => {
      stub.setMeta({
        providers: [
          {
            id: 'claude',
            label: 'Claude Code',
            available: true,
            authenticated: true,
            models: [{ slug: 'sonnet', label: 'Claude Sonnet' }],
            features: { resume: true },
          },
          {
            id: 'cursor',
            label: 'Cursor',
            available: false,
            authenticated: false,
            details: 'missing binary',
            models: [],
            features: {},
          },
        ],
      })

      const catalog = await host.describeCatalog()

      // Listed, not dropped: a disabled row teaches what the machine cannot do
      // while an absent one is a mystery (MAR-2682, "a blocked provider is
      // listed and disabled, never dropped").
      expect(catalog.providers.map((entry) => entry.descriptor.id)).toEqual([
        'claude-code',
        'cursor',
      ])
      expect(catalog.providers[0]?.blockedReason).toBeNull()
      expect(catalog.providers[1]?.blockedReason).toBe(
        'The daemon reports Cursor as unavailable: missing binary.',
      )
    })

    it('says why a daemon could not be asked, rather than reporting no providers', async () => {
      stub.setMetaStatus(500)
      const catalog = await host.describeCatalog()
      // The previous listing survives a blip -- a row correct a second ago must
      // not empty -- and the failure is still reported beside it.
      expect(catalog.providers).not.toHaveLength(0)
      expect(catalog.unreachableReason).toMatch(/HTTP 500/)
    })

    it('names the provider, not the machine, on every row', async () => {
      // `vendorLabel: 'Remote daemon'` made every provider on every daemon read
      // the same word where its own name belonged, because the option row
      // renders `vendorLabel || name` as the primary label. Three providers,
      // three labels (MAR-2682, "the row names the provider, not the
      // machine"). Naming the machine is the strip's
      // job, one tier below.
      stub.setMeta({
        providers: ['claude', 'codex', 'cursor'].map((id) => ({
          id,
          label: `${id} on the daemon`,
          available: true,
          authenticated: true,
          models: [],
          features: {},
        })),
      })

      const catalog = await host.describeCatalog()
      const labels = catalog.providers.map(
        (entry) => entry.descriptor.vendorLabel || entry.descriptor.name,
      )

      expect(labels).toEqual([
        'claude on the daemon',
        'codex on the daemon',
        'cursor on the daemon',
      ])
      expect(new Set(labels).size).toBe(3)
    })

    it('derives describe() from the same catalog, so the two cannot disagree', async () => {
      const catalog = await host.describeCatalog()
      const descriptors = await host.describe()
      expect(descriptors).toEqual(
        catalog.providers.map((entry) => entry.descriptor),
      )
    })
  })

  it('keeps the previous provider cache when describe cannot reach the daemon', async () => {
    stub.setMetaStatus(500)
    const descriptors = await host.describe()
    expect(descriptors.map((d) => d.id)).toEqual(['claude-code', 'codex'])
  })

  describe('/health handshake', () => {
    it('records what agents-daemon 0.26.1 says about itself', async () => {
      await host.refreshProviders()
      const handshake = host.handshake()

      expect(handshake?.status).toBe('connected')
      expect(handshake?.daemonVersion).toBe('0.26.1')
      expect(handshake?.apiVersion).toBe('v0')
      expect(handshake?.executionProtocolCapabilities).toHaveLength(17)
    })

    it('asks for /health without a token, because the route needs none', async () => {
      await host.refreshProviders()
      expect(stub.healthRequests).not.toHaveLength(0)
      for (const request of stub.healthRequests) {
        expect(request.authorization).toBeNull()
      }
    })

    it('still lists providers when the daemon serves no /health', async () => {
      stub.setHealthBody(null)
      await expect(host.refreshProviders()).resolves.toHaveLength(2)
      expect(host.handshake()).toBeNull()
    })

    it('degrades to connected-without-capabilities when /health omits the descriptor', async () => {
      stub.setHealthBody(JSON.stringify(daemonHealthFixtureWithoutDescriptor()))

      await host.refreshProviders()
      expect(host.handshake()).toMatchObject({
        status: 'connected',
        daemonVersion: '0.26.1',
        executionProtocolCapabilities: [],
      })
    })

    it('calls a daemon on a later protocol incompatible', async () => {
      stub.setHealthBody(
        JSON.stringify({
          ...(JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1) as Record<
            string,
            unknown
          >),
          version: '0.99.0',
          executionProtocol: { version: 2, capabilities: ['deltas.append.v2'] },
        }),
      )

      await host.refreshProviders()
      expect(host.handshake()).toMatchObject({
        status: 'incompatible',
        daemonVersion: '0.99.0',
      })
    })

    it('lists providers when /health never answers, and says nothing about the daemon', async () => {
      const hanging = createStubDaemon()
      hanging.setHealthHangs(true)
      const hangingHost = createHost(hanging, { healthProbeTimeoutMs: 20 })

      await expect(hangingHost.refreshProviders()).resolves.toHaveLength(2)
      expect(hangingHost.handshake()).toBeNull()
    })

    it('leaves providers and handshake from the same daemon when two refreshes overlap', async () => {
      const racing = createRacingDaemon([
        { version: '0.26.1', providerId: 'claude' },
        { version: '0.27.0', providerId: 'codex' },
      ])
      const racingHost = createRacingHost(racing)

      const first = racingHost.refreshProviders()
      await settleScheduledWork()
      const second = racingHost.refreshProviders()
      await settleScheduledWork()

      // The listings land in order, the handshakes in the opposite order —
      // the interleave a settings change produces.
      racing.releaseMeta(0)
      await settleScheduledWork()
      racing.releaseMeta(1)
      await settleScheduledWork()

      // Both listings have landed and neither handshake has. Nothing from a
      // refresh may be visible until both values land together, so a reader
      // mid-refresh still sees the empty pre-refresh cache — not one daemon's
      // providers under no version at all.
      expect(racingHost.capabilities()).toEqual([])
      expect(racingHost.handshake()).toBeNull()

      racing.releaseHealth(1)
      await second
      racing.releaseHealth(0)
      await first

      expect(racingHost.capabilities().map((c) => c.providerId)).toEqual([
        'codex',
      ])
      expect(racingHost.handshake()?.daemonVersion).toBe('0.27.0')
    })

    it('does not let a slow refresh finishing last overwrite a newer one', async () => {
      const racing = createRacingDaemon([
        { version: '0.26.1', providerId: 'claude' },
        { version: '0.27.0', providerId: 'codex' },
      ])
      const racingHost = createRacingHost(racing)

      const first = racingHost.refreshProviders()
      await settleScheduledWork()
      const second = racingHost.refreshProviders()
      await settleScheduledWork()

      racing.releaseMeta(1)
      racing.releaseHealth(1)
      await second
      expect(racingHost.handshake()?.daemonVersion).toBe('0.27.0')

      racing.releaseMeta(0)
      racing.releaseHealth(0)
      await first

      expect(racingHost.capabilities().map((c) => c.providerId)).toEqual([
        'codex',
      ])
      expect(racingHost.handshake()?.daemonVersion).toBe('0.27.0')
    })

    it('hands the superseded refresh the newer daemon listing, not its own', async () => {
      const racing = createRacingDaemon([
        { version: '0.26.1', providerId: 'claude' },
        { version: '0.27.0', providerId: 'codex' },
      ])
      const racingHost = createRacingHost(racing)

      const first = racingHost.refreshProviders()
      await settleScheduledWork()
      const second = racingHost.refreshProviders()
      await settleScheduledWork()

      racing.releaseMeta(1)
      racing.releaseHealth(1)
      await second

      racing.releaseMeta(0)
      racing.releaseHealth(0)

      // testRemoteExecutionHostConnection reads this return value and then
      // handshake(), back to back. A superseded refresh that reported its own
      // dead listing would hand the dialog one daemon's providers under the
      // other daemon's version and capability badge.
      const supersededListing = await first
      expect(supersededListing.map((p) => p.providerId)).toEqual(['codex'])
    })

    it('leaves the handshake untouched when the provider listing fails', async () => {
      await host.refreshProviders()
      expect(host.handshake()?.daemonVersion).toBe('0.26.1')

      stub.setMetaStatus(500)
      await expect(host.refreshProviders()).rejects.toBeInstanceOf(
        RemoteExecutionHostError,
      )
      expect(host.handshake()?.daemonVersion).toBe('0.26.1')
    })
  })

  it('starts a session, posts the start request, and streams events in order', async () => {
    const deltas: SessionDelta[] = []
    const statuses: SessionStatus[] = []
    const tokens: string[] = []
    const heartbeats: number[] = []

    const handle = host.start('claude', startConfig('s-1'))
    handle.onDelta((delta) => deltas.push(delta))
    handle.onStatusChange((status) => statuses.push(status))
    handle.onContinuationToken((token) => tokens.push(token))
    handle.onActivityHeartbeat?.(() => heartbeats.push(1))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'event stream to open',
    )
    expect(stub.startRequests[0]).toMatchObject({
      protocolVersion: 1,
      providerId: 'claude',
      config: { sessionId: 's-1', initialMessage: 'hello' },
    })

    stub.emit(
      envelope(1, {
        kind: 'delta',
        delta: { kind: 'session.patch', patch: { status: 'running' } },
      }),
    )
    stub.emit(envelope(2, { kind: 'status', status: 'running' }))
    stub.emit(envelope(3, { kind: 'continuation-token', token: 'resume-1' }))
    stub.emit(envelope(4, { kind: 'heartbeat' }))

    await waitUntil(() => heartbeats.length === 1, 'all events to arrive')
    // Three deltas for four events: the wire delta passes through the mapping
    // layer unchanged, and the dedicated `status` and `continuation-token`
    // kinds each become a `session.patch` of their own (MAR-2582). The
    // callbacks still fire — they are the handle's declared contract — but the
    // deltas are what a reader actually receives.
    //
    // Every session patch carries the sequence of the envelope it came from,
    // whichever of the two ways it arrived. That is what the record commits
    // alongside the patch, and what tells it a settle it has already applied
    // from one the daemon is reporting for the first time.
    expect(deltas).toEqual([
      {
        kind: 'session.patch',
        patch: { status: 'running' },
        executionHostSeq: 1,
      },
      {
        kind: 'session.patch',
        patch: { status: 'running', updatedAt: expect.any(String) },
        executionHostSeq: 2,
      },
      {
        kind: 'session.patch',
        patch: { continuationToken: 'resume-1', updatedAt: expect.any(String) },
        executionHostSeq: 3,
      },
    ])
    expect(statuses).toEqual(['running'])
    expect(tokens).toEqual(['resume-1'])

    handle.stop()
  })

  /**
   * The settle pairing touches a session patch that settles nothing: not at
   * all (MAR-2590).
   *
   * A mid-turn patch is the common case by far, and the whole delta path runs
   * through the same pairing, so "adds a field only to a terminal patch" is a
   * claim that has to be pinned rather than assumed. Asserted on the keys as
   * well as the value, because `toEqual` ignores a key whose value is
   * `undefined` — an `attention: undefined` welded onto every patch would pass
   * the equality and still change what the mapping emits.
   */
  it('forwards a session patch that settles nothing exactly as the wire sent it', async () => {
    const deltas: SessionDelta[] = []

    const handle = host.start('claude', startConfig('s-1'))
    handle.onDelta((delta) => deltas.push(delta))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'event stream to open',
    )

    const patch = {
      status: 'running',
      activity: 'streaming',
      continuationToken: 'resume-1',
      updatedAt: '2026-08-25T10:00:00.000Z',
    } as const
    stub.emit(
      envelope(1, {
        kind: 'delta',
        delta: { kind: 'session.patch', patch },
      }),
    )

    await waitUntil(() => deltas.length === 1, 'the patch to arrive')

    const forwarded = deltas[0]
    expect(forwarded).toEqual({
      kind: 'session.patch',
      patch,
      executionHostSeq: 1,
    })
    expect(
      forwarded.kind === 'session.patch' ? Object.keys(forwarded.patch) : [],
    ).toEqual(Object.keys(patch))

    handle.stop()
  })

  /**
   * Before the mapping layer, every wire delta reached SessionService.applyDelta,
   * which bumps liveness before it switches on kind — so an unreadable kind was
   * "bump, then ignore". Filtering the delta out must not also throw away the
   * bump: the daemon spoke, and that is what liveness measures.
   */
  it('bumps liveness without forwarding a delta kind it cannot map', async () => {
    const deltas: SessionDelta[] = []
    const heartbeats: number[] = []

    const handle = host.start('claude', startConfig('s-1'))
    handle.onDelta((delta) => deltas.push(delta))
    handle.onActivityHeartbeat?.(() => heartbeats.push(1))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'event stream to open',
    )

    stub.emit(
      envelope(1, {
        kind: 'delta',
        delta: {
          kind: 'turn.patch',
          turnId: 'turn-1',
          patch: { status: 'completed' },
        },
      }),
    )

    await waitUntil(() => heartbeats.length === 1, 'the liveness bump')
    expect(heartbeats).toHaveLength(1)
    expect(deltas).toEqual([])

    handle.stop()
  })

  it('resumes a dropped stream from the last processed sequence', async () => {
    const statuses: SessionStatus[] = []
    const handle = host.start('claude', startConfig('s-1'))
    handle.onStatusChange((status) => statuses.push(status))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    await waitUntil(() => statuses.length === 1, 'first event')

    stub.dropStream()
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 2,
      'reconnect after drop',
    )
    expect(stub.eventStreamLastEventIds[1]).toBe('1')

    stub.emit(envelope(2, { kind: 'status', status: 'completed' }))
    await waitUntil(() => statuses.length === 2, 'event after resume')
    expect(statuses).toEqual(['running', 'completed'])

    handle.stop()
  })

  it('queues commands sent before start completes and posts them as envelopes', async () => {
    const handle = host.start('claude', startConfig('s-1'))
    handle.sendMessage('follow up', undefined, undefined, {
      deliveryMode: 'follow-up',
    })
    handle.approve('approval-1')

    await waitUntil(
      () => stub.commandEnvelopes.length === 2,
      'queued commands to flush',
    )
    expect(stub.commandEnvelopes[0]).toEqual({
      protocolVersion: 1,
      sessionId: 's-1',
      command: {
        kind: 'send-message',
        text: 'follow up',
        options: { deliveryMode: 'follow-up' },
      },
    })
    expect(stub.commandEnvelopes[1]).toEqual({
      protocolVersion: 1,
      sessionId: 's-1',
      command: { kind: 'approve', providerApprovalId: 'approval-1' },
    })

    handle.stop()
    await waitUntil(
      () => stub.commandEnvelopes.length === 3,
      'stop command to post',
    )
    expect(stub.commandEnvelopes[2]).toMatchObject({
      command: { kind: 'stop' },
    })
  })

  it('surfaces a failed start through deltas and status, not thrown errors', async () => {
    stub.setStartStatus(400)
    const deltas: SessionDelta[] = []
    const statuses: SessionStatus[] = []
    const attentions: AttentionState[] = []

    const handle = host.start('claude', startConfig('s-1'))
    handle.onDelta((delta) => deltas.push(delta))
    handle.onStatusChange((status) => statuses.push(status))
    handle.onAttentionChange((attention) => attentions.push(attention))

    await waitUntil(() => statuses.length === 1, 'failure to surface')
    expect(statuses).toEqual(['failed'])
    expect(attentions).toEqual(['failed'])

    const note = deltas.find((d) => d.kind === 'conversation.item.add')
    expect(note).toBeDefined()
    if (note?.kind === 'conversation.item.add' && note.item.kind === 'note') {
      expect(note.item.text).toContain('failed to start')
    }
    const patch = deltas.find((d) => d.kind === 'session.patch')
    if (patch?.kind === 'session.patch') {
      expect(patch.patch.status).toBe('failed')
      expect(patch.patch.attention).toBe('failed')
    }
  })

  /**
   * The daemon takes one start per session id and answers a second with 409
   * `Session already exists` (`execution-session-manager.ts:436-438`). Pinned
   * here because the stub daemon enforcing that is what keeps this suite from
   * agreeing with us instead of with the daemon: without it, a caller that
   * restarts a live session to continue it looks like it works.
   */
  it('surfaces the daemon refusing a second start for a session it already has', async () => {
    const first = host.start('claude', startConfig('s-1'))
    await waitUntil(
      () => stub.startRequests.length === 1,
      'the first start to be accepted',
    )

    const deltas: SessionDelta[] = []
    const statuses: SessionStatus[] = []
    const second = host.start('claude', startConfig('s-1'))
    second.onDelta((delta) => deltas.push(delta))
    second.onStatusChange((status) => statuses.push(status))

    await waitUntil(() => statuses.length === 1, 'the refusal to surface')
    expect(statuses).toEqual(['failed'])
    const note = deltas.find((d) => d.kind === 'conversation.item.add')
    if (note?.kind === 'conversation.item.add' && note.item.kind === 'note') {
      expect(note.item.text).toContain('Session already exists')
    } else {
      throw new Error('expected the refusal to reach the transcript as a note')
    }

    first.stop()
  })

  it('fails the session after exhausting stream reconnect attempts', async () => {
    stub.setEventsStatus(500)
    const statuses: SessionStatus[] = []
    const handle = host.start('claude', startConfig('s-1'))
    handle.onStatusChange((status) => statuses.push(status))

    await waitUntil(() => statuses.length === 1, 'stream failure to surface')
    expect(statuses).toEqual(['failed'])
  })

  it('surfaces lost commands as attention without killing the session', async () => {
    const attentions: AttentionState[] = []
    const statuses: SessionStatus[] = []
    const deltas: SessionDelta[] = []

    const handle = host.start('claude', startConfig('s-1'))
    handle.onAttentionChange((attention) => attentions.push(attention))
    handle.onStatusChange((status) => statuses.push(status))
    handle.onDelta((delta) => deltas.push(delta))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'session to start',
    )
    stub.setCommandStatus(500)
    handle.sendMessage('lost message')

    await waitUntil(() => attentions.length === 1, 'attention to surface')
    expect(attentions).toEqual(['failed'])
    expect(statuses).toEqual([])
    const note = deltas.find((d) => d.kind === 'conversation.item.add')
    expect(note).toBeDefined()

    handle.stop()
  })

  /**
   * A command a dead run cannot carry is reported, never dropped (MAR-2582).
   *
   * The handle stays callable after the run behind it dies, and `sendMessage`
   * returning is the only thing a caller sees. On this wire the daemon is what
   * echoes a user turn back, so a message that never left the app leaves
   * nothing at all behind -- no turn, no error, no trace. That is what a dead
   * handle left installed on a session did to every message sent into it, and
   * the silence is its own defect: the session service must not be the only
   * thing standing between a user and a message that quietly evaporates.
   */
  it('reports a message sent into a run that has died instead of dropping it', async () => {
    stub.setEventsStatus(500)
    const attentions: AttentionState[] = []
    const statuses: SessionStatus[] = []
    const deltas: SessionDelta[] = []

    const handle = host.start('claude', startConfig('s-1'))
    handle.onAttentionChange((attention) => attentions.push(attention))
    handle.onStatusChange((status) => statuses.push(status))
    handle.onDelta((delta) => deltas.push(delta))

    await waitUntil(() => statuses.includes('failed'), 'the run to die')
    const notesBefore = deltas.filter(
      (delta) => delta.kind === 'conversation.item.add',
    ).length

    handle.sendMessage('into the dead run')

    const notes = deltas.filter(
      (delta) => delta.kind === 'conversation.item.add',
    )
    expect(notes).toHaveLength(notesBefore + 1)
    expect(JSON.stringify(notes[notes.length - 1])).toContain(
      'was not delivered',
    )
    expect(attentions[attentions.length - 1]).toBe('failed')
    // Reported because it never reached the daemon, not instead of reaching it.
    expect(stub.commandEnvelopes).toHaveLength(0)
  })

  it('attaches to a running session without posting a start request', async () => {
    const statuses: SessionStatus[] = []
    const handle = host.attach('claude', startConfig('s-1'), 3)
    handle.onStatusChange((status) => statuses.push(status))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'attach stream to open',
    )
    expect(stub.startRequests).toHaveLength(0)
    expect(stub.eventStreamLastEventIds[0]).toBe('3')

    stub.emit(envelope(4, { kind: 'status', status: 'running' }))
    await waitUntil(() => statuses.length === 1, 'resumed event')
    expect(statuses).toEqual(['running'])

    handle.sendMessage('still there?')
    await waitUntil(
      () => stub.commandEnvelopes.length === 1,
      'command after attach',
    )
    expect(stub.commandEnvelopes[0]).toMatchObject({
      command: { kind: 'send-message', text: 'still there?' },
    })

    handle.stop()
  })

  /**
   * A disposed run dispatches no buffered events (MAR-2582).
   *
   * One stream read hands the adapter a whole batch of frames: a daemon replay
   * writes them back to back and they arrive coalesced. The session service
   * disposes a handle from inside a delta listener -- that is what releasing a
   * handle at a settle is -- so the dispose happens while the rest of that
   * batch is still in the loop. Delivering the remainder feeds a handle the
   * service has already let go, and its listeners still write to the session
   * a *different* handle is now serving.
   */
  it('dispatches no buffered events once the run is disposed', async () => {
    const entries: ProviderDebugEntry[] = []
    const tracingHost = createHost(stub, {
      debugSink: { record: (entry) => entries.push(entry) },
    })
    await tracingHost.refreshProviders()

    const deltas: SessionDelta[] = []
    const handle = tracingHost.start('claude', startConfig('s-1'))
    handle.onDelta((delta) => {
      deltas.push(delta)
      // What SessionService.releaseHandle does at a settle, at the same
      // moment it does it.
      if (deltas.length === 1) handle.dispose?.()
    })

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'event stream to open',
    )

    stub.emitBatch([
      envelope(1, { kind: 'status', status: 'completed' }),
      envelope(2, { kind: 'status', status: 'running' }),
      envelope(3, { kind: 'continuation-token', token: 'resume-1' }),
    ])

    await waitUntil(() => deltas.length === 1, 'the first event to arrive')
    await waitUntil(
      () => entries.some((entry) => entry.note?.includes('disposed')),
      'the dropped events to be traced',
    )
    // Nothing after the dispose, and the drop is on the record rather than
    // silent -- the debug log is the only place a remote turn is inspectable.
    expect(deltas).toEqual([
      {
        kind: 'session.patch',
        // The settle carries its attention with it: a terminal status and the
        // attention it means are one fact and one write (MAR-2590).
        patch: {
          status: 'completed',
          attention: 'finished',
          updatedAt: expect.any(String),
        },
        executionHostSeq: 1,
      },
    ])
    expect(
      entries.filter((entry) => entry.note === 'dropped: the run is disposed'),
    ).toHaveLength(2)
  })

  it('reports processed event sequences through onEventSeq', async () => {
    const seqs: Array<[string, number]> = []
    const seqHost = new RemoteExecutionHost({
      connection: {
        resolveConnection: async () => ({
          baseUrl: 'http://daemon.test',
          token: 'test-token',
        }),
      },
      fetch: stub.fetchFn,
      reconnect: { maxAttempts: 2, wait: async () => {} },
      onEventSeq: (sessionId, seq) => seqs.push([sessionId, seq]),
    })
    await seqHost.refreshProviders()

    const handle = seqHost.start('claude', startConfig('s-1'))
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'heartbeat' }))

    await waitUntil(() => seqs.length === 2, 'sequence callbacks')
    expect(seqs).toEqual([
      ['s-1', 1],
      ['s-1', 2],
    ])

    handle.stop()
  })

  it('throws synchronously for unknown providers on start', () => {
    expect(() => host.start('missing', startConfig('s-x'))).toThrow(
      'Provider not found: missing',
    )
  })

  it('does not call a provider missing on a host that never listed any', () => {
    // Never refreshed: the cache is empty because nothing was asked, not
    // because the daemon said so (MAR-2620).
    const cold = createHost(stub)

    expect(() => cold.start('claude', startConfig('s-cold'))).toThrow(
      /has not listed its providers yet/,
    )
    expect(() => cold.start('claude', startConfig('s-cold'))).not.toThrow(
      /Provider not found/,
    )
  })

  it('names the listing failure when one is why the cache is empty', async () => {
    const unreachable = createStubDaemon()
    unreachable.setMetaStatus(503)
    const failing = createHost(unreachable)
    await expect(failing.refreshProviders()).rejects.toThrow()

    expect(() => failing.start('claude', startConfig('s-dark'))).toThrow(
      /never listed its providers/,
    )
    expect(() => failing.start('claude', startConfig('s-dark'))).not.toThrow(
      /Provider not found/,
    )
  })

  it('refuses a provider the daemon listed but will not run', async () => {
    // The block existed only in the renderer, as an entry kept out of
    // `selectableProviderDescriptors`. That is the right place for *picking*
    // and it is not a boundary: a resumed session, a relay, or any surface that
    // never rendered the option row reaches `start()` directly (MAR-2682, "a
    // blocked provider is refused at the host boundary"). Refused here, in
    // the daemon's own words.
    stub.setMeta({
      providers: [
        {
          id: 'cursor',
          label: 'Cursor',
          available: false,
          authenticated: false,
          details: 'missing binary',
          models: [],
          features: {},
        },
      ],
    })
    await host.refreshProviders()

    expect(() => host.start('cursor', startConfig('s-blocked'))).toThrow(
      'Cannot start cursor: The daemon reports Cursor as unavailable: missing binary.',
    )
    // Not the refusal for a provider that was never listed: it *was* listed,
    // and saying "not found" would send a reader hunting the wrong problem.
    expect(() => host.start('cursor', startConfig('s-blocked'))).not.toThrow(
      /Provider not found/,
    )
    await expect(
      host.oneShot('cursor', {
        prompt: 'p',
        modelId: 'm',
        workingDirectory: '/tmp',
      }),
    ).rejects.toThrow(/missing binary/)
  })

  it('lets an attach through a block, because the session already started', async () => {
    // A daemon that has since lost its binary must not strand a live run: the
    // provider was validated when the session started and the daemon owns it
    // now. The documented exemption stays exempt.
    stub.setMeta({
      providers: [
        {
          id: 'cursor',
          label: 'Cursor',
          available: false,
          authenticated: false,
          details: 'missing binary',
          models: [],
          features: {},
        },
      ],
    })
    await host.refreshProviders()

    const handle = host.attach('cursor', startConfig('s-attached'), 3)
    expect(handle).toBeTruthy()
    handle.stop()
  })

  it('goes back to the canonical refusal once a listing lands', async () => {
    const recovering = createStubDaemon()
    recovering.setMetaStatus(503)
    const host2 = createHost(recovering)
    await expect(host2.refreshProviders()).rejects.toThrow()

    recovering.setMetaStatus(200)
    await host2.refreshProviders()

    // The daemon answered, and its answer is the basis for the claim.
    expect(() => host2.start('missing', startConfig('s-known'))).toThrow(
      'Provider not found: missing',
    )
  })

  it('rejects one-shot execution with canonical errors', async () => {
    await expect(
      host.oneShot('missing', {
        prompt: 'p',
        modelId: 'm',
        workingDirectory: '/tmp',
      }),
    ).rejects.toThrow('Provider not found: missing')
    await expect(
      host.oneShot('claude', {
        prompt: 'p',
        modelId: 'm',
        workingDirectory: '/tmp',
      }),
    ).rejects.toThrow('Provider claude does not support one-shot execution')
  })

  it('exposes remote error metadata on the error type', () => {
    const error = new RemoteExecutionHostError('nope', 'http', 503)
    expect(error.kind).toBe('http')
    expect(error.status).toBe(503)
  })

  describe('wire trace', () => {
    let entries: ProviderDebugEntry[]
    let tracingHost: RemoteExecutionHost

    beforeEach(async () => {
      entries = []
      tracingHost = createHost(stub, {
        debugSink: {
          record: (entry) => entries.push(entry),
        },
      })
      await tracingHost.refreshProviders()
    })

    const eventEntries = (): ProviderDebugEntry[] =>
      entries.filter((entry) => entry.channel === 'event')

    it('records every wire event with its kind and a redacted shape', async () => {
      const handle = tracingHost.start('claude', startConfig('s-1'))
      handle.onDelta(() => {})

      await waitUntil(
        () => stub.eventStreamLastEventIds.length === 1,
        'event stream to open',
      )

      stub.emit(envelope(1, { kind: 'status', status: 'completed' }))
      stub.emit(
        envelope(2, {
          kind: 'delta',
          delta: {
            kind: 'session.patch',
            patch: { status: 'completed', continuationToken: 'resume-secret' },
          },
        }),
      )

      await waitUntil(() => eventEntries().length === 2, 'events to be traced')

      expect(eventEntries()[0]).toMatchObject({
        sessionId: 's-1',
        providerId: 'claude',
        channel: 'event',
        direction: 'in',
        method: 'status',
        payload: { seq: 1, kind: 'status', status: 'completed' },
      })
      expect(eventEntries()[1]).toMatchObject({
        method: 'delta',
        payload: {
          seq: 2,
          kind: 'delta',
          delta: {
            kind: 'session.patch',
            patchFields: ['status', 'continuationToken'],
            status: 'completed',
            continuationToken: { chars: 13, form: 'opaque' },
          },
        },
      })
      expect(JSON.stringify(entries)).not.toContain('resume-secret')

      handle.dispose?.()
    })

    it('records why an undecodable envelope was dropped', async () => {
      const handle = tracingHost.start('claude', startConfig('s-1'))
      handle.onDelta(() => {})

      await waitUntil(
        () => stub.eventStreamLastEventIds.length === 1,
        'event stream to open',
      )

      stub.emitRaw('{"protocolVersion":1,"sessionId":"s-1","seq":1}')

      await waitUntil(
        () => eventEntries().length === 1,
        'the drop to be traced',
      )
      expect(eventEntries()[0]?.note).toContain('undecodable envelope')

      handle.dispose?.()
    })

    /**
     * The one-start contract is checked by reading this log, so the log has to
     * record the starts that were refused as well as the ones that were
     * accepted. A log holding only successes can be read as "no second start
     * was attempted" when a second one was attempted and turned down — the
     * evidence and the claim would not match (MAR-2582).
     */
    it('records a start the daemon refused, not only the ones it accepted', async () => {
      const first = tracingHost.start('claude', startConfig('s-1'))
      first.onDelta(() => {})
      await waitUntil(
        () => stub.startRequests.length === 1,
        'the first start to be accepted',
      )

      const second = tracingHost.start('claude', startConfig('s-1'))
      second.onDelta(() => {})

      await waitUntil(
        () => entries.some((entry) => entry.note?.includes('refused')),
        'the refused start to be traced',
      )

      const startEntries = entries.filter(
        (entry) => entry.method === 'start' || entry.note?.includes('start'),
      )
      expect(
        startEntries.filter(
          (entry) => entry.note === 'remote session start requested',
        ),
      ).toHaveLength(2)
      const refusal = startEntries.find((entry) =>
        entry.note?.includes('refused'),
      )
      expect(refusal?.note).toContain('Session already exists')
      expect(refusal?.payload).toMatchObject({ status: 409 })
      expect(
        startEntries.filter(
          (entry) =>
            entry.note === 'remote session start accepted by the daemon',
        ),
      ).toHaveLength(1)

      first.stop()
      second.dispose?.()
    })

    /**
     * An attach posts no start request, so a connection it never resolved is
     * not a start the daemon refused (MAR-2582).
     *
     * The one-start contract is audited by reading this log. A note that calls
     * an attach failure a refused start writes evidence of a second start into
     * the record of a wire that permits exactly one -- and it is read under
     * pressure, by a human looking for exactly that string.
     */
    it('records an attach that never reached the daemon as an attach, not as a refused start', async () => {
      const offline = new RemoteExecutionHost({
        connection: {
          resolveConnection: async () => {
            throw new RemoteExecutionHostError(
              'No remote endpoint is configured.',
              'configuration',
            )
          },
        },
        fetch: stub.fetchFn,
        reconnect: { maxAttempts: 2, wait: async () => {} },
        debugSink: { record: (entry) => entries.push(entry) },
      })

      const notes: string[] = []
      const handle = offline.attach('claude', startConfig('s-1'), 3)
      handle.onDelta((delta) => {
        if (
          delta.kind === 'conversation.item.add' &&
          delta.item.kind === 'note'
        ) {
          notes.push(delta.item.text)
        }
      })

      await waitUntil(() => notes.length === 1, 'the failure to surface')
      expect(notes[0]).toContain('failed to attach')
      expect(stub.startRequests).toHaveLength(0)

      const lifecycle = entries.filter((entry) => entry.channel === 'lifecycle')
      expect(lifecycle).toHaveLength(1)
      expect(lifecycle[0]?.note).toContain(
        'remote session attach could not resolve a connection:',
      )
      expect(lifecycle[0]?.note).toContain('No remote endpoint is configured.')
      expect(entries.some((entry) => entry.note?.includes('refused'))).toBe(
        false,
      )
    })

    it('never quotes the message a command carries', async () => {
      const handle = tracingHost.start('claude', startConfig('s-1'))
      handle.onDelta(() => {})

      await waitUntil(
        () => stub.eventStreamLastEventIds.length === 1,
        'event stream to open',
      )
      handle.sendMessage('the private follow-up')

      await waitUntil(
        () => entries.some((entry) => entry.method === 'send-message'),
        'the command to be traced',
      )
      expect(JSON.stringify(entries)).not.toContain('private follow-up')

      handle.dispose?.()
    })
  })
})
