import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { registerIpcHandlers } from './ipc'
import {
  closeDatabase,
  getDatabase,
  resetDatabase,
} from '../backend/database/database'
import { AppSettingsService } from '../backend/app-settings/app-settings.service'
import { recordingExecutionHostCredentials } from '../backend/credentials/execution-host-daemon-credentials.fixture'
import { ExecutionHostEndpointRepository } from '../backend/execution-host-endpoint/execution-host-endpoint.repository'
import { seedExecutionHostEndpoint } from '../backend/execution-host-endpoint/execution-host-endpoint.fixture'
import { StateService } from '../backend/state/state.service'
import { SessionService } from '../backend/session/session.service'
import { ProviderRegistry } from '../backend/provider/provider-registry'
import { LocalExecutionHost } from '../backend/provider/execution-host/local-execution-host'
import { AppSettingsRemoteExecutionHostRegistry } from '../backend/provider/execution-host/remote-execution-host.registry'
import {
  createStubDaemon,
  waitUntil,
  type StubDaemon,
} from '../backend/provider/execution-host/execution-host-daemon.fixture'
import { ExecutionHostDaemonCredentialsService } from '../backend/credentials/execution-host-daemon-credentials.service'

/**
 * The main half of `executionHost:getSessionWorkspace` (MAR-2620).
 *
 * The workspace panel must describe the machine the session named. The service
 * suite proves the service does that — and stays green if this handler stops
 * asking the service and reaches for a host of its own, which is exactly the
 * revert that once left every routing test passing. So this registers the real
 * handler over a real `SessionService` and a real registry, takes the function
 * `ipcMain.handle` was given, calls it, and asserts the origin the request
 * actually went to.
 *
 * Two daemons, both answering, both plausible: a canary that only proved a
 * request happened would pass while the panel described someone else's branch.
 */

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
    on: vi.fn(),
  },
  dialog: {},
  BrowserWindow: { getAllWindows: () => [] },
  shell: {},
}))

const DAEMON_A = { id: 'daemon-a', baseUrl: 'https://daemon-a.test' }
const DAEMON_B = { id: 'daemon-b', baseUrl: 'https://daemon-b.test' }

/**
 * `registerIpcHandlers` takes its collaborators positionally. Only two matter
 * here: the session service, which this channel routes through, and the remote
 * execution host bundle, whose presence is what registers the channel at all.
 * A signature change that moves either fails loudly below — the handler is
 * missing, or registration throws — rather than quietly proving nothing.
 */
const SESSION_SERVICE_ARGUMENT = 6
const EXECUTION_HOST_REMOTE_ARGUMENT = 21
const ARGUMENT_COUNT = 22

describe('the executionHost:getSessionWorkspace ipc handler', () => {
  let db: Database.Database
  let tempDir: string
  let daemonA: StubDaemon
  let daemonB: StubDaemon
  let requestUrls: string[]
  let service: SessionService

  const PROJECT_ID = 'workspace-ipc-project'

  function routedFetch(): typeof fetch {
    return (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      requestUrls.push(url)
      if (url.startsWith(DAEMON_A.baseUrl)) return daemonA.fetchFn(url, init)
      if (url.startsWith(DAEMON_B.baseUrl)) return daemonB.fetchFn(url, init)
      throw new Error(`No daemon serves ${url}`)
    }) as typeof fetch
  }

  function snapshotUrls(): string[] {
    return requestUrls.filter((url) =>
      /\/v0\/execution\/sessions\/[^/]+$/.test(url),
    )
  }

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

  beforeEach(async () => {
    handlers.clear()
    db = getDatabase()
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-workspace-ipc-'))
    const repoPath = join(tempDir, 'repo')
    mkdirSync(repoPath)
    mkdirSync(join(repoPath, '.git'))
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES (?, 'workspace ipc', ?)",
    ).run(PROJECT_ID, repoPath)

    // A is written first, so an ambient default resolves to A.
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
      recordingExecutionHostCredentials(),
    )
    const registry = new AppSettingsRemoteExecutionHostRegistry({
      appSettings,
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

    await registry.primeConfiguredEndpoints()
    await waitUntil(
      () => registry.hostFor(DAEMON_B.id).capabilities().length > 0,
      'both daemons to be listed',
    )

    const args: unknown[] = Array.from({ length: ARGUMENT_COUNT }, () => ({}))
    args[SESSION_SERVICE_ARGUMENT] = service
    args[EXECUTION_HOST_REMOTE_ARGUMENT] = {
      credentials: new ExecutionHostDaemonCredentialsService(),
      registry,
    }
    ;(registerIpcHandlers as (...values: never[]) => void)(...(args as never[]))
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

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

  it('asks the endpoint the session named, at that endpoint’s base URL', async () => {
    const sessionId = createSessionOn(DAEMON_B.id, 'on daemon b')
    daemonA.setSessionSnapshot(sessionId, snapshotFrom('a'))
    daemonB.setSessionSnapshot(sessionId, snapshotFrom('b'))

    const handler = handlers.get('executionHost:getSessionWorkspace')
    expect(handler).toBeTypeOf('function')

    const result = (await handler?.({}, sessionId)) as {
      ok: boolean
      info?: { workspace: { branchName: string } | null; prUrl: string | null }
      message?: string
    }

    // The URL is the claim. "A request happened" is true of the wrong machine
    // too, and the wrong machine's answer looks exactly as convincing.
    expect(snapshotUrls()).toEqual([
      `${DAEMON_B.baseUrl}/v0/execution/sessions/${sessionId}`,
    ])
    expect(daemonA.snapshotRequests).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.info?.workspace?.branchName).toBe('convergence/b')
    expect(result.info?.prUrl).toBe('https://github.com/acme/repo/pull/2')
  })

  it('reports the missing endpoint rather than asking the first one', async () => {
    const sessionId = createSessionOn('daemon-c', 'on a vanished endpoint')

    const result = (await handlers.get('executionHost:getSessionWorkspace')?.(
      {},
      sessionId,
    )) as { ok: boolean; message?: string }

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/endpoint "daemon-c"/)
    expect(snapshotUrls()).toEqual([])
  })
})
