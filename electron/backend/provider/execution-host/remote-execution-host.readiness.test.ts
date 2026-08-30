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
import { ProviderRegistry } from '../provider-registry'
import { LocalExecutionHost } from './local-execution-host'
import { AppSettingsRemoteExecutionHostRegistry } from './remote-execution-host.registry'
import {
  createStubDaemon,
  deferred,
  letEverythingQueuedRun,
  track,
  waitUntil,
  type StubDaemon,
} from './execution-host-daemon.fixture'
import { TEST_REMOTE_WORK_ADDRESS } from '../../session/session-work-address.fixture'

const DAEMON = { id: 'daemon-b', baseUrl: 'https://daemon-b.test' }

/**
 * A turn sent on an Endpoint whose provider listing has not landed (MAR-2620).
 *
 * The listing is a round trip to the daemon, and `start()` reads its result
 * synchronously — so between adding an Endpoint and its daemon answering there
 * is a window in which a perfectly good turn is refused. The routing suite
 * cannot see it: it primes both daemons and waits for them before it does
 * anything, which is precisely the state this file refuses to assume.
 *
 * So the listing is held open here on a gate the test releases. Without the
 * gate the stub daemon answers within the same run of microtasks the send
 * already awaits, and the window closes by luck rather than by design — a test
 * that passes for a reason that has nothing to do with the fix.
 */
describe('a turn on an endpoint whose listing has not landed', () => {
  let db: Database.Database
  let tempDir: string
  let daemon: StubDaemon
  let requestUrls: string[]
  let metaGate: { promise: Promise<void>; release: () => void } | null
  let transportFails: boolean
  let registry: AppSettingsRemoteExecutionHostRegistry
  let service: SessionService

  const PROJECT_ID = 'endpoint-readiness-project'

  /**
   * The daemon behind a gate on its provider listing and a switch on its
   * transport, so "has not answered yet" and "cannot be reached at all" are
   * two different, separately reachable states.
   */
  function gatedFetch(): typeof fetch {
    return (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      requestUrls.push(url)
      if (transportFails) {
        throw new TypeError('fetch failed')
      }
      if (url.endsWith('/v0/meta') && metaGate) {
        await metaGate.promise
      }
      return daemon.fetchFn(url, init)
    }) as typeof fetch
  }

  function startUrls(): string[] {
    return requestUrls.filter((url) => url.endsWith('/v0/execution/sessions'))
  }

  function createSession(name: string): string {
    return service.create({
      projectId: PROJECT_ID,
      workspaceId: null,
      providerId: 'claude-code',
      model: 'sonnet',
      effort: null,
      name,
      executionHost: DAEMON.id,
      workAddress: TEST_REMOTE_WORK_ADDRESS,
    }).id
  }

  beforeEach(() => {
    db = getDatabase()
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-endpoint-readiness-'))
    const repoPath = join(tempDir, 'repo')
    mkdirSync(repoPath)
    mkdirSync(join(repoPath, '.git'))
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES (?, 'readiness', ?)",
    ).run(PROJECT_ID, repoPath)
    seedExecutionHostEndpoint(db, DAEMON.id, DAEMON.baseUrl)

    daemon = createStubDaemon()
    requestUrls = []
    metaGate = null
    transportFails = false

    const appSettings = new AppSettingsService(
      db,
      new StateService(db),
      async () => [],
      new ExecutionHostEndpointRepository(db),
      recordingExecutionHostCredentials(),
    )
    registry = new AppSettingsRemoteExecutionHostRegistry({
      appSettings,
      credentials: { resolveToken: async (id: string) => `token-${id}` },
      fetch: gatedFetch(),
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
    // Deliberately no priming and no waiting: this is the Endpoint added after
    // boot, whose host is built by the send itself.
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('waits for the listing already in flight instead of refusing the turn', async () => {
    metaGate = deferred()
    const sessionId = createSession('sent while cold')

    const send = track(service.start(sessionId, { text: 'hello' }))
    await letEverythingQueuedRun()

    // The whole point: the send is still waiting, not refused. Fire the
    // listing and forget it, and this is where it has already thrown.
    expect(send.settled()).toBe('pending')
    expect(startUrls()).toEqual([])

    metaGate.release()
    await send.done

    expect(send.error()).toBeNull()
    expect(send.settled()).toBe('resolved')
    await waitUntil(
      () => daemon.startRequests.length === 1,
      'the session to be posted',
    )
    expect(startUrls()).toEqual([`${DAEMON.baseUrl}/v0/execution/sessions`])
  })

  it('fails an unreachable endpoint with the connection reason, never a provider one', async () => {
    transportFails = true
    const sessionId = createSession('sent to a dark machine')

    const send = track(service.start(sessionId, { text: 'hello' }))
    await send.done

    const error = send.error()
    expect(send.settled()).toBe('rejected')
    expect(error?.message).toMatch(/unreachable/i)
    // The lie this replaces. "Provider not found: claude-code" sends a reader
    // hunting a Claude Code problem on a machine that answered nothing at all.
    expect(error?.message).not.toMatch(/provider not found/i)
    expect(startUrls()).toEqual([])
  })

  it('still says provider not found when the daemon answered and has no such provider', async () => {
    daemon.setMeta({
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
    const sessionId = createSession('claude on a codex-only daemon')

    const send = track(service.start(sessionId, { text: 'hello' }))
    await send.done

    // The daemon answered, and its answer was that it does not have this
    // provider. That claim is now the only thing this sentence can mean.
    expect(send.settled()).toBe('rejected')
    expect(send.error()?.message).toMatch(/provider not found/i)
    expect(startUrls()).toEqual([])
  })

  it('asks again on the next turn after a listing that failed', async () => {
    transportFails = true
    const sessionId = createSession('sent while the daemon was down')

    const refused = track(service.start(sessionId, { text: 'hello' }))
    await refused.done
    expect(refused.settled()).toBe('rejected')

    // The daemon comes up. A listing recorded as permanently failed would keep
    // this Endpoint refusing until Convergence restarted.
    transportFails = false
    const retried = track(service.start(sessionId, { text: 'hello again' }))
    await retried.done

    expect(retried.error()).toBeNull()
    await waitUntil(
      () => daemon.startRequests.length === 1,
      'the retried session to be posted',
    )
    expect(startUrls()).toEqual([`${DAEMON.baseUrl}/v0/execution/sessions`])
  })
})
