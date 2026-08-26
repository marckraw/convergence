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
import { ExecutionHostEndpointRepository } from '../../execution-host-endpoint/execution-host-endpoint.repository'
import { seedExecutionHostEndpoint } from '../../execution-host-endpoint/execution-host-endpoint.fixture'
import { StateService } from '../../state/state.service'
import { SessionService } from '../../session/session.service'
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

    const appSettings = new AppSettingsService(
      db,
      new StateService(db),
      async () => [],
      new ExecutionHostEndpointRepository(db),
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
})
