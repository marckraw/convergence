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
  deferred,
  envelope,
  letEverythingQueuedRun,
  track,
  waitUntil,
  type StubDaemon,
} from './execution-host-daemon.fixture'

const ENDPOINT_ID = 'the-machine'
const OLD_URL = 'https://old-machine.test'
const NEW_URL = 'https://new-machine.test'

/** A daemon that runs Codex and nothing else. */
const CODEX_ONLY = {
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
}

/** A daemon that runs Claude and nothing else. */
const CLAUDE_ONLY = {
  providers: [
    {
      id: 'claude',
      label: 'Claude Code',
      available: true,
      authenticated: true,
      models: [{ slug: 'sonnet', label: 'Claude Sonnet' }],
      features: { resume: true, followup: true },
    },
  ],
}

/**
 * One Endpoint whose base URL is edited under a host that is already running
 * (MAR-2620).
 *
 * The third turn of one root cause: something derived from an Endpoint stopped
 * tracking that Endpoint. The id was validated and discarded; readiness was
 * hoped for rather than awaited; and here the provider listing outlived the
 * address it was read from. Requests already went to the new machine — the
 * resolver reads settings per call — so the failure had the worst possible
 * shape: traffic pointed at daemon B while every decision about *what may run*
 * was still daemon A's answer.
 *
 * Two daemons on different origins and one Endpoint pointed first at one and
 * then at the other, because nothing below the wire can tell a host that
 * re-listed from a host that kept an answer. The Endpoint moves through the
 * real settings write, and the host is never rebuilt: a session already running
 * on it holds handles, and tearing those out to fix a cache would trade this
 * bug for a worse one.
 */
describe('an endpoint whose base url moves under a live host', () => {
  let db: Database.Database
  let tempDir: string
  let oldMachine: StubDaemon
  let newMachine: StubDaemon
  let requestUrls: string[]
  let metaGate: { promise: Promise<void>; release: () => void } | null
  let appSettings: AppSettingsService
  let registry: AppSettingsRemoteExecutionHostRegistry
  let service: SessionService

  const PROJECT_ID = 'endpoint-reconfiguration-project'

  /**
   * One fetch over two daemons, dispatched by origin, with an optional gate on
   * the new machine's provider listing. An origin no daemon serves throws
   * rather than defaulting: reaching the wrong machine must fail loudly here.
   */
  function routedFetch(): typeof fetch {
    return (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      requestUrls.push(url)
      if (url.startsWith(OLD_URL)) return oldMachine.fetchFn(url, init)
      if (url.startsWith(NEW_URL)) {
        if (url.endsWith('/v0/meta') && metaGate) await metaGate.promise
        return newMachine.fetchFn(url, init)
      }
      throw new Error(`No daemon serves ${url}`)
    }) as typeof fetch
  }

  /** Provider listings asked for, as URLs, in the order they were sent. */
  function metaUrls(): string[] {
    return requestUrls.filter((url) => url.endsWith('/v0/meta'))
  }

  /** Session-start POSTs, as URLs, in the order they were sent. */
  function startUrls(): string[] {
    return requestUrls.filter((url) => url.endsWith('/v0/execution/sessions'))
  }

  function listedProviderIds(): string[] {
    return registry
      .hostFor(ENDPOINT_ID)
      .capabilities()
      .map((entry) => entry.providerId)
  }

  /**
   * The edit under test, made the way the settings surface makes it: the whole
   * settings object read back and saved with this Endpoint pointed somewhere
   * else. Writing the row directly would skip the path a human takes.
   */
  async function pointEndpointAt(baseUrl: string): Promise<void> {
    const current = await appSettings.getAppSettings()
    await appSettings.setAppSettings({
      ...current,
      executionHostEndpoints: [
        { id: ENDPOINT_ID, label: 'the machine', baseUrl },
      ],
    })
  }

  function createSession(name: string): string {
    return service.create({
      projectId: PROJECT_ID,
      workspaceId: null,
      providerId: 'claude-code',
      model: 'sonnet',
      effort: null,
      name,
      executionHost: ENDPOINT_ID,
    }).id
  }

  beforeEach(async () => {
    db = getDatabase()
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-endpoint-reconfig-'))
    const repoPath = join(tempDir, 'repo')
    mkdirSync(repoPath)
    mkdirSync(join(repoPath, '.git'))
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES (?, 'reconfig', ?)",
    ).run(PROJECT_ID, repoPath)
    seedExecutionHostEndpoint(db, ENDPOINT_ID, OLD_URL)

    oldMachine = createStubDaemon()
    oldMachine.setMeta(CODEX_ONLY)
    newMachine = createStubDaemon()
    newMachine.setMeta(CLAUDE_ONLY)
    requestUrls = []
    metaGate = null

    appSettings = new AppSettingsService(
      db,
      new StateService(db),
      async () => [],
      new ExecutionHostEndpointRepository(db),
    )
    registry = new AppSettingsRemoteExecutionHostRegistry({
      appSettings,
      // One token for both machines, so the only thing that differs across the
      // edit is the address — the half the bug was about.
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

    // Boot against the old machine, and wait for its answer: every test below
    // starts from a host that holds a listing worth going stale.
    await registry.primeConfiguredEndpoints()
    await waitUntil(
      () => listedProviderIds().length > 0,
      'the old machine to be listed',
    )
    expect(listedProviderIds()).toEqual(['codex'])
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('lists the new machine and starts a claude session there after the address moves', async () => {
    const sessionId = createSession('follows the endpoint')

    await pointEndpointAt(NEW_URL)
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(() => startUrls().length > 0, 'the session to be posted')

    // Served from the old listing this is "Provider not found: claude" — a
    // refusal gated on daemon A's answer while the POST it guards would have
    // gone to daemon B.
    expect(listedProviderIds()).toEqual(['claude'])
    expect(startUrls()).toEqual([`${NEW_URL}/v0/execution/sessions`])
    expect(newMachine.startRequests).toHaveLength(1)
    expect(oldMachine.startRequests).toHaveLength(0)
  })

  it('does not report ready from the listing the old address gave', async () => {
    // The new machine is held before it can answer, so "ready" can only mean
    // one of two things and the test can tell them apart.
    metaGate = deferred()
    await pointEndpointAt(NEW_URL)

    const ready = track(registry.whenReady(ENDPOINT_ID))
    await letEverythingQueuedRun()

    expect(ready.settled()).toBe('pending')
    expect(listedProviderIds()).toEqual([])

    metaGate.release()
    await ready.done

    expect(ready.error()).toBeNull()
    expect(listedProviderIds()).toEqual(['claude'])
  })

  it('leaves a session already running on the old address alone', async () => {
    // The old machine runs Claude for this one, so there is a live run to
    // disturb. Same address, so the listing is refreshed, not invalidated.
    oldMachine.setMeta(CLAUDE_ONLY)
    await registry.hostFor(ENDPOINT_ID).refreshProviders()

    const hostBefore = registry.hostFor(ENDPOINT_ID)
    const running = createSession('running when the address changed')
    await service.start(running, { text: 'hello' })
    await waitUntil(
      () => oldMachine.eventStreamLastEventIds.length === 1,
      'the event stream to open on the old machine',
    )
    oldMachine.emit(envelope(1, { kind: 'status', status: 'running' }, running))
    await waitUntil(
      () => service.getById(running)?.status === 'running',
      'the session to be running',
    )

    await pointEndpointAt(NEW_URL)
    await registry.whenReady(ENDPOINT_ID)
    expect(listedProviderIds()).toEqual(['claude'])
    expect(metaUrls().at(-1)).toBe(`${NEW_URL}/v0/meta`)

    // The knowledge went; the object stayed. Swapping in a fresh host would
    // read as a clean fix and would strand every handle this one handed out.
    expect(registry.hostFor(ENDPOINT_ID)).toBe(hostBefore)

    // And the run that was already going still arrives, on the machine it
    // started on.
    oldMachine.emit(
      envelope(2, { kind: 'status', status: 'completed' }, running),
    )
    oldMachine.emit(
      envelope(3, { kind: 'attention', attention: 'finished' }, running),
    )
    await waitUntil(
      () => service.getById(running)?.status === 'completed',
      'the running session to finish on the machine it started on',
    )
    expect(service.getById(running)?.attention).toBe('finished')
    expect(newMachine.startRequests).toHaveLength(0)
  })

  it('does not list again while the endpoint is unchanged', async () => {
    const listedAtBoot = metaUrls().length
    expect(listedAtBoot).toBe(1)

    await registry.whenReady(ENDPOINT_ID)
    await registry.whenReady(ENDPOINT_ID)
    await registry.whenReady(ENDPOINT_ID)
    // A Save that leaves this Endpoint exactly where it was is not a change.
    await pointEndpointAt(OLD_URL)
    await registry.primeConfiguredEndpoints()
    await letEverythingQueuedRun()

    // Invalidating on every ask would be correct and useless: a round trip per
    // turn, and a window on each one where the cache is empty again.
    expect(metaUrls().length).toBe(listedAtBoot)
    expect(listedProviderIds()).toEqual(['codex'])
  })
})
