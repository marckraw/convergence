import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import {
  closeDatabase,
  getDatabase,
  resetDatabase,
} from '../../database/database'
import { AppSettingsService } from '../../app-settings/app-settings.service'
import { recordingExecutionHostCredentials } from '../../credentials/execution-host-daemon-credentials.fixture'
import { ExecutionHostEndpointRepository } from '../../execution-host-endpoint/execution-host-endpoint.repository'
import { seedExecutionHostEndpoint } from '../../execution-host-endpoint/execution-host-endpoint.fixture'
import { StateService } from '../../state/state.service'
import { SessionService } from '../../session/session.service'
import { ProviderCatalogService } from '../provider-catalog.service'
import { ProviderRegistry } from '../provider-registry'
import { LocalExecutionHost } from './local-execution-host'
import { AppSettingsRemoteExecutionHostRegistry } from './remote-execution-host.registry'
import {
  createStubDaemon,
  waitUntil,
  type StubDaemon,
} from './execution-host-daemon.fixture'
import { DAEMON_HEALTH_FIXTURE_0_26_1 } from './execution-host-health.fixture'

const DAEMON_A = { id: 'daemon-a', baseUrl: 'https://daemon-a.test' }
const DAEMON_B = { id: 'daemon-b', baseUrl: 'https://daemon-b.test' }

/**
 * Where a session's turn actually went (MAR-2620).
 *
 * The session record has always held the right Endpoint id; what was wrong was
 * the machine the turn reached. Nothing below the wire can tell those apart, so
 * these run the real registry, the real per-Endpoint connection resolver and a
 * real `SessionService` against two stub daemons that answer on different
 * origins — and assert the URL.
 */
describe('remote execution hosts, one per endpoint', () => {
  let db: Database.Database
  let tempDir: string
  let daemonA: StubDaemon
  let daemonB: StubDaemon
  let requestUrls: string[]
  let registry: AppSettingsRemoteExecutionHostRegistry
  let service: SessionService
  let appSettings: AppSettingsService

  const PROJECT_ID = 'endpoint-routing-project'

  /**
   * One fetch over two daemons, dispatched by origin. A request for an origin
   * no daemon serves throws rather than defaulting: routing to the wrong
   * machine must fail loudly here, not be absorbed by a stub that answers
   * anything.
   */
  function routedFetch(): typeof fetch {
    return (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      requestUrls.push(url)
      if (url.startsWith(DAEMON_A.baseUrl)) return daemonA.fetchFn(url, init)
      if (url.startsWith(DAEMON_B.baseUrl)) return daemonB.fetchFn(url, init)
      throw new Error(`No daemon serves ${url}`)
    }) as typeof fetch
  }

  /** Session-start POSTs, as URLs, in the order they were sent. */
  function startUrls(): string[] {
    return requestUrls.filter((url) => url.endsWith('/v0/execution/sessions'))
  }

  /** Session-snapshot GETs, as URLs, in the order they were sent. */
  function snapshotUrls(): string[] {
    return requestUrls.filter((url) =>
      /\/v0\/execution\/sessions\/[^/]+$/.test(url),
    )
  }

  /** A workspace snapshot naming the machine that served it. */
  function snapshotFrom(daemon: string): Record<string, unknown> {
    return {
      workspace: {
        repository: 'git@github.com:acme/repo.git',
        branchName: `convergence/${daemon}`,
        baseRef: 'main',
      },
      prUrl: `https://github.com/acme/repo/pull/${daemon === 'a' ? 1 : 2}`,
    }
  }

  function createSessionOn(endpointId: string, name: string): string {
    return service.create({
      projectId: PROJECT_ID,
      workspaceId: null,
      providerId: 'claude-code',
      model: 'sonnet',
      effort: null,
      name,
      executionHost: endpointId,
    }).id
  }

  beforeEach(async () => {
    db = getDatabase()
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-endpoint-routing-'))
    const repoPath = join(tempDir, 'repo')
    mkdirSync(repoPath)
    mkdirSync(join(repoPath, '.git'))
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES (?, 'routing', ?)",
    ).run(PROJECT_ID, repoPath)

    // A is written first, so a resolver that reads by position reads A.
    seedExecutionHostEndpoint(db, DAEMON_A.id, DAEMON_A.baseUrl)
    seedExecutionHostEndpoint(db, DAEMON_B.id, DAEMON_B.baseUrl)
    db.prepare(
      'UPDATE execution_host_endpoints SET position = 1 WHERE id = ?',
    ).run(DAEMON_B.id)

    daemonA = createStubDaemon()
    daemonB = createStubDaemon()
    requestUrls = []

    appSettings = new AppSettingsService(
      db,
      new StateService(db),
      async () => [],
      new ExecutionHostEndpointRepository(db),
      recordingExecutionHostCredentials(),
    )
    registry = new AppSettingsRemoteExecutionHostRegistry({
      appSettings,
      // Each Endpoint keys its own token, so a host that asked for the wrong
      // machine's would present a token the other daemon issued.
      credentials: { resolveToken: async (id: string) => `token-${id}` },
      fetch: routedFetch(),
    })

    service = new SessionService(
      db,
      new LocalExecutionHost(new ProviderRegistry()),
      join(tempDir, 'global-sessions'),
    )
    service.setRemoteExecutionHosts(registry)
    service.setRemoteWorkspaceSourceResolver(() => ({
      repository: 'git@github.com:acme/repo.git',
    }))

    // Boot: both Endpoints get a host and each primes its own listing.
    await registry.primeConfiguredEndpoints()
    await waitUntil(
      () => registry.hostFor(DAEMON_B.id).capabilities().length > 0,
      'both daemons to be listed',
    )
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('posts a session to the base URL of the endpoint it recorded', async () => {
    const sessionId = createSessionOn(DAEMON_B.id, 'on daemon b')

    await service.start(sessionId, { text: 'hello' })
    await waitUntil(() => startUrls().length > 0, 'the session to be posted')

    expect(startUrls()).toEqual([`${DAEMON_B.baseUrl}/v0/execution/sessions`])
    expect(daemonB.startRequests).toHaveLength(1)
    expect(daemonA.startRequests).toHaveLength(0)
  })

  it('keeps two endpoints running at once without either seeing the other', async () => {
    const onA = createSessionOn(DAEMON_A.id, 'on daemon a')
    const onB = createSessionOn(DAEMON_B.id, 'on daemon b')

    await service.start(onA, { text: 'hello a' })
    await service.start(onB, { text: 'hello b' })
    await waitUntil(
      () =>
        daemonA.eventStreamLastEventIds.length === 1 &&
        daemonB.eventStreamLastEventIds.length === 1,
      'both event streams to open',
    )
    await waitUntil(
      () => startUrls().length === 2,
      'both sessions to be posted',
    )

    const sessionIdsOf = (daemon: StubDaemon): string[] =>
      daemon.startRequests.map(
        (body) => (body.config as { sessionId: string }).sessionId,
      )
    expect(sessionIdsOf(daemonA)).toEqual([onA])
    expect(sessionIdsOf(daemonB)).toEqual([onB])
    expect(
      requestUrls.filter((url) => url.startsWith(DAEMON_A.baseUrl)).length,
    ).toBeGreaterThan(0)
  })

  it('gives each endpoint its own provider listing and its own handshake', async () => {
    daemonB.setMeta({
      providers: [
        {
          id: 'codex',
          label: 'Codex',
          available: true,
          authenticated: true,
          models: [{ slug: 'gpt-5.5', label: 'GPT-5.5' }],
          features: { resume: false, followup: true },
        },
      ],
    })
    daemonB.setHealthBody(
      JSON.stringify({
        ...(JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1) as Record<
          string,
          unknown
        >),
        version: '9.9.9',
      }),
    )
    await registry.hostFor(DAEMON_B.id).refreshProviders()

    const hostA = registry.hostFor(DAEMON_A.id)
    const hostB = registry.hostFor(DAEMON_B.id)

    expect(hostA).not.toBe(hostB)
    expect(hostA.capabilities().map((entry) => entry.providerId)).toEqual([
      'claude',
      'codex',
    ])
    expect(hostB.capabilities().map((entry) => entry.providerId)).toEqual([
      'codex',
    ])
    expect(hostB.handshake()?.daemonVersion).toBe('9.9.9')
    expect(hostA.handshake()?.daemonVersion).not.toBe('9.9.9')
  })

  it('reads the workspace from the endpoint the session named, not the first one', async () => {
    const sessionId = createSessionOn(DAEMON_B.id, 'on daemon b')
    // Both daemons answer, and both answers look right. A panel that asked the
    // wrong machine would render a branch and a PR with nothing to mark them
    // as belonging to a session this one never ran.
    daemonA.setSessionSnapshot(sessionId, snapshotFrom('a'))
    daemonB.setSessionSnapshot(sessionId, snapshotFrom('b'))

    const info = await service.fetchRemoteSessionWorkspaceInfo(sessionId)

    expect(snapshotUrls()).toEqual([
      `${DAEMON_B.baseUrl}/v0/execution/sessions/${sessionId}`,
    ])
    expect(daemonA.snapshotRequests).toEqual([])
    expect(info.workspace?.branchName).toBe('convergence/b')
    expect(info.prUrl).toBe('https://github.com/acme/repo/pull/2')
  })

  it('refuses a workspace read for an endpoint that is gone rather than asking anywhere', async () => {
    const sessionId = createSessionOn('daemon-c', 'on a vanished endpoint')

    await expect(
      service.fetchRemoteSessionWorkspaceInfo(sessionId),
    ).rejects.toThrow(/endpoint "daemon-c"/)
    expect(snapshotUrls()).toEqual([])
  })

  it('refuses a session whose endpoint is gone rather than posting it anywhere', async () => {
    const sessionId = createSessionOn('daemon-c', 'on a vanished endpoint')

    await expect(service.start(sessionId, { text: 'hello' })).rejects.toThrow(
      /endpoint "daemon-c"/,
    )
    // Nothing to wait for: the refusal happens before any transport exists.
    expect(startUrls()).toEqual([])
  })

  it('refuses a listed-but-blocked provider in the daemon’s own words', async () => {
    // The permission question, asked by name. `SessionService` used to gate on
    // `capabilitiesFor` -- a descriptive method -- and rewrite a null into
    // "Provider not found", so a CLI this daemon lists and refuses to run came
    // back as a provider that does not exist, about a machine the human never
    // touched. Listed and blocked is not absent, and the refusal is the
    // daemon's sentence (MAR-2682).
    daemonB.setMeta({
      providers: [
        {
          id: 'codex',
          label: 'Codex',
          available: false,
          authenticated: true,
          details: 'missing binary',
          models: [{ slug: 'gpt-5.5', label: 'GPT-5.5' }],
          features: { resume: true, followup: true },
        },
      ],
    })
    await registry.hostFor(DAEMON_B.id).refreshProviders()

    const sessionId = service.create({
      projectId: PROJECT_ID,
      workspaceId: null,
      providerId: 'codex',
      model: 'gpt-5.5',
      effort: null,
      name: 'blocked on daemon b',
      executionHost: DAEMON_B.id,
    }).id

    // Something else about this session is wrong too, and it is wrong *later*:
    // the old gate let a blocked provider through -- `capabilitiesFor` is
    // non-null for one the daemon lists and refuses -- so the first thing that
    // failed downstream got to name the refusal, and the human was told about a
    // missing git remote instead of a CLI their daemon cannot run. The
    // permission question is asked first, so the answer is the daemon's.
    service.setRemoteWorkspaceSourceResolver(() => null)

    await expect(service.start(sessionId, { text: 'hello' })).rejects.toThrow(
      'Cannot start codex: The daemon reports Codex as unavailable: missing binary.',
    )
    expect(startUrls()).toEqual([])
  })

  it('leaves a session unchanged when its provider is blocked on send', async () => {
    // The other door, and the one where the descriptive gate cost something
    // that outlives the refusal. `sendMessage` used to let a blocked provider
    // past `capabilitiesFor` into `sendRemoteTurn`, which writes the turn's
    // bookkeeping before it attaches -- so a quiet send that was then refused
    // left `relays_muted` set on the session and every later turn went out
    // silently, for a turn that never happened (MAR-2682).
    daemonB.setMeta({
      providers: [
        {
          id: 'codex',
          label: 'Codex',
          available: true,
          authenticated: false,
          details: 'run `codex login`',
          models: [{ slug: 'gpt-5.5', label: 'GPT-5.5' }],
          features: { resume: true, followup: true },
        },
      ],
    })
    await registry.hostFor(DAEMON_B.id).refreshProviders()

    const sessionId = service.create({
      projectId: PROJECT_ID,
      workspaceId: null,
      providerId: 'codex',
      model: 'gpt-5.5',
      effort: null,
      name: 'blocked quiet send',
      executionHost: DAEMON_B.id,
    }).id

    await expect(
      service.sendMessage(sessionId, { text: 'hello', muteRelays: true }),
    ).rejects.toThrow(
      'Cannot start codex: The daemon reports Codex as not signed in: run `codex login`.',
    )
    // Read from the row, because that is where the mark outlives the send: the
    // session summary does not carry it, and every later settle does.
    expect(
      db
        .prepare('SELECT relays_muted FROM sessions WHERE id = ?')
        .get(sessionId),
    ).toMatchObject({ relays_muted: 0 })
    expect(startUrls()).toEqual([])
  })

  it('mints no host for an endpoint removed after the caller checked', async () => {
    // The window a membership check upstream cannot close. `ProviderCatalogService`
    // lists the configured ids, awaits, and only then asks for a host; a removal
    // landing in that gap does not merely answer stale -- `hostFor` would build
    // the host, memoise it and prime a request to a machine nobody is configured
    // for. The check that matters is the one at the mint, and it is synchronous
    // (MAR-2682).
    const DAEMON_C = { id: 'daemon-c', baseUrl: 'https://daemon-c.test' }
    seedExecutionHostEndpoint(db, DAEMON_C.id, DAEMON_C.baseUrl)

    const catalogs = new ProviderCatalogService({
      local: { describe: async () => [] },
      filterLocalDescriptors: (descriptors) => descriptors,
      remote: {
        listEndpointIds: async () => {
          const ids = (
            await appSettings.getAppSettings()
          ).executionHostEndpoints.map((endpoint) => endpoint.id)
          // Standing inside the window: the row goes away between the answer
          // and the caller acting on it.
          db.prepare('DELETE FROM execution_host_endpoints WHERE id = ?').run(
            DAEMON_C.id,
          )
          return ids
        },
        hostFor: (endpointId) => registry.hostFor(endpointId),
      },
    })

    await expect(catalogs.get(DAEMON_C.id)).rejects.toThrow(
      /endpoint "daemon-c" is not configured/,
    )
    // Nothing was dialled...
    expect(
      requestUrls.filter((url) => url.startsWith(DAEMON_C.baseUrl)),
    ).toEqual([])
    // ...and nothing was kept: a memoised host would be handed back here
    // without ever reaching the check again.
    expect(() => registry.hostFor(DAEMON_C.id)).toThrow(
      /endpoint "daemon-c" is not configured/,
    )
  })
})
