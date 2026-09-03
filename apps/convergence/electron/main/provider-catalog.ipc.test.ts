import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
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
import { AppSettingsRemoteExecutionHostRegistry } from '../backend/provider/execution-host/remote-execution-host.registry'
import {
  createStubDaemon,
  waitUntil,
  type StubDaemon,
} from '@convergence/execution-host-client'
import { ExecutionHostDaemonCredentialsService } from '../backend/credentials/execution-host-daemon-credentials.service'
import { ProviderRegistry } from '../backend/provider/provider-registry'
import { SessionService } from '../backend/session/session.service'
import { LocalExecutionHost } from '../backend/provider/execution-host/local-execution-host'
import type { ProviderCatalog } from '../backend/provider/provider-catalog.types'

/**
 * The main half of `provider:getAll` (MAR-2682).
 *
 * The service suite proves the routing, and stays green if this handler stops
 * passing the argument along — which is the wire that would leave the composer
 * asking about a daemon and being answered about this laptop, with every other
 * gate in the slice still passing. So this registers the real handler, takes
 * the function `ipcMain.handle` was given, and asserts which daemon the request
 * actually reached.
 *
 * Two daemons, both answering, both plausible. A canary that only proved a
 * request happened would pass while the row described the wrong machine.
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
 * `registerIpcHandlers` takes its collaborators positionally. Three matter
 * here: the provider registry this machine's catalog comes from, the app
 * settings service the local filter and the Endpoint list come from, and the
 * remote bundle that makes any of the daemons reachable. A signature change
 * that moves one fails loudly below rather than quietly proving nothing.
 */
const SESSION_SERVICE_ARGUMENT = 7
const PROVIDER_REGISTRY_ARGUMENT = 8
const APP_SETTINGS_ARGUMENT = 12
const EXECUTION_HOST_REMOTE_ARGUMENT = 22
const ARGUMENT_COUNT = 23

function metaFor(providers: unknown[]): unknown {
  return { providers }
}

describe('the per-machine ipc doors', () => {
  let db: Database.Database
  let tempDir: string
  let daemonA: StubDaemon
  let daemonB: StubDaemon
  let metaUrls: string[]

  function routedFetch(): typeof fetch {
    return (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/v0/meta')) metaUrls.push(url)
      if (url.startsWith(DAEMON_A.baseUrl)) return daemonA.fetchFn(url, init)
      if (url.startsWith(DAEMON_B.baseUrl)) return daemonB.fetchFn(url, init)
      throw new Error(`No daemon serves ${url}`)
    }) as typeof fetch
  }

  beforeEach(async () => {
    handlers.clear()
    db = getDatabase()
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-catalog-ipc-'))

    seedExecutionHostEndpoint(db, DAEMON_A.id, DAEMON_A.baseUrl)
    seedExecutionHostEndpoint(db, DAEMON_B.id, DAEMON_B.baseUrl)
    db.prepare(
      'UPDATE execution_host_endpoints SET position = 1 WHERE id = ?',
    ).run(DAEMON_B.id)

    daemonA = createStubDaemon()
    daemonB = createStubDaemon()
    metaUrls = []

    daemonA.setMeta(
      metaFor([
        {
          id: 'claude',
          label: 'Claude Code',
          available: true,
          authenticated: true,
          models: [{ slug: 'a-sonnet', label: 'A Sonnet' }],
          features: { resume: true },
        },
      ]),
    )
    daemonB.setMeta(
      metaFor([
        {
          id: 'codex',
          label: 'Codex',
          available: true,
          authenticated: true,
          models: [{ slug: 'b-gpt', label: 'B GPT' }],
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
      ]),
    )

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
      // Not this suite's subject: named so the composition root cannot
      // quietly lose the real one (MAR-2694 round 2).
      onWorkspaceReported: () => {},
    })

    await registry.primeConfiguredEndpoints()
    await waitUntil(
      () => registry.hostFor(DAEMON_B.id).capabilities().length > 0,
      'both daemons to be listed',
    )

    const providerRegistry = new ProviderRegistry()
    const args: unknown[] = Array.from({ length: ARGUMENT_COUNT }, () => ({}))
    args[SESSION_SERVICE_ARGUMENT] = new SessionService(
      db,
      new LocalExecutionHost(providerRegistry),
      join(tempDir, 'global-sessions'),
    )
    args[PROVIDER_REGISTRY_ARGUMENT] = providerRegistry
    args[APP_SETTINGS_ARGUMENT] = appSettings
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

  /**
   * `unknown`, because that is what an IPC argument is. Typing this helper
   * `string` made the suite unable to express the case the handler's own
   * signature exists for, so the wire's worst input was reachable in production
   * and unreachable in the tests (MAR-2682).
   */
  async function getAll(executionHostId?: unknown): Promise<ProviderCatalog> {
    const handler = handlers.get('provider:getAll')
    expect(handler).toBeTypeOf('function')
    return (await handler?.({}, executionHostId)) as ProviderCatalog
  }

  /**
   * Where one machine can work (MAR-2689). Mounted beside `provider:getAll`
   * and pinned the same way: the service suite proves the routing and stays
   * green if this handler stops passing the argument along, and the renderer
   * suites stub the bridge entirely -- so a door that answered about the wrong
   * daemon, or was never mounted at all, would leave every other gate passing
   * while the strip offered one machine's Projects under another's name.
   */
  async function getProjects(executionHostId?: unknown): Promise<{
    executionHostId: string
    supported: boolean
    projects: { id: string }[]
    unreachableReason: string | null
  }> {
    const handler = handlers.get('executionHost:getProjects')
    expect(handler).toBeTypeOf('function')
    return (await handler?.({}, executionHostId)) as {
      executionHostId: string
      supported: boolean
      projects: { id: string }[]
      unreachableReason: string | null
    }
  }

  it('asks the endpoint it was given where it can work', async () => {
    daemonB.setProjects({
      projects: [
        {
          id: 'new-blok',
          name: 'new-blok',
          workingDirectory: '/srv/projects/new-blok',
        },
      ],
    })
    daemonA.setProjects({
      projects: [
        { id: 'wrong', name: 'wrong', workingDirectory: '/srv/wrong' },
      ],
    })

    const catalog = await getProjects(DAEMON_B.id)

    expect(catalog.executionHostId).toBe(DAEMON_B.id)
    expect(catalog.projects.map((project) => project.id)).toEqual(['new-blok'])
    // The other daemon was not asked at all: a door that answered from
    // whichever host was configured first would list `wrong` here.
    expect(daemonA.projectsRequests).toBe(0)
  })

  it('answers for this machine without asking any daemon', async () => {
    const catalog = await getProjects('local')

    expect(catalog).toEqual({
      executionHostId: 'local',
      supported: false,
      projects: [],
      unreachableReason: null,
    })
    expect(daemonA.projectsRequests + daemonB.projectsRequests).toBe(0)
  })

  /**
   * The real `session:create` handler, which is the only place a work address
   * arriving over IPC is decoded (MAR-2689).
   *
   * The preload bridge types the field `unknown` and says main decodes it; for
   * one run it did not, and a probe's `{mode:'repository', repository:42}` was
   * persisted verbatim and read back as no place at all. The service suite
   * cannot see this: it is handed a typed object. Only the handler can.
   */
  async function createSession(input: Record<string, unknown>): Promise<{
    id: string
    workAddress: unknown
  }> {
    const handler = handlers.get('session:create')
    expect(handler).toBeTypeOf('function')
    return (await handler?.({}, input)) as { id: string; workAddress: unknown }
  }

  function newSessionInput(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      contextKind: 'project',
      projectId: 'p-create',
      workspaceId: null,
      providerId: 'claude-code',
      model: 'sonnet',
      effort: null,
      name: 'a remote session',
      executionHost: DAEMON_B.id,
      ...overrides,
    }
  }

  it('decodes the place a new session states, and refuses one it cannot read', async () => {
    // Mutation: forward `input` to `createSession` unchanged (restore the
    // cast-through), and the malformed row goes red -- the session is created
    // and its record holds no place.
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p-create', 'p', ?)",
    ).run(join(tempDir, 'create-repo'))

    const valid = await createSession(
      newSessionInput({
        workAddress: {
          mode: 'project',
          projectId: 'new-blok',
          workingDirectory: '/srv/projects/new-blok',
          label: 'Project new-blok',
        },
      }),
    )
    expect(valid.workAddress).toEqual({
      mode: 'project',
      projectId: 'new-blok',
      workingDirectory: '/srv/projects/new-blok',
      label: 'Project new-blok',
    })

    // Malformed: refused by name, and nothing reaches the record.
    await expect(
      createSession(
        newSessionInput({
          workAddress: { mode: 'repository', repository: 42, label: 'shown' },
        }),
      ),
    ).rejects.toThrow(/work address/)

    // Missing: refused too, because a remote session is born with a place or
    // not at all. The message is the service's, which is the door that knows
    // the session is going to a daemon.
    await expect(createSession(newSessionInput())).rejects.toThrow(
      /where it works/,
    )

    const rows = db.prepare('SELECT id FROM sessions').all() as Array<{
      id: string
    }>
    expect(rows.map((row) => row.id)).toEqual([valid.id])
  })

  it('leaves a local session stating no place, and records none', async () => {
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p-create', 'p', ?)",
    ).run(join(tempDir, 'create-repo'))

    const local = await createSession(
      newSessionInput({ executionHost: undefined }),
    )
    expect(local.workAddress).toBeNull()
  })

  it('reads what a daemon would clone for a checkout, and null when there is nothing to clone', async () => {
    const handler = handlers.get('git:getCloneableRepositoryUrl')
    expect(handler).toBeTypeOf('function')
    // A directory that is not a repository has no origin, so there is nothing
    // a daemon could clone -- and the strip says so rather than offering a
    // place derived from nothing.
    expect(await handler?.({}, tempDir)).toBeNull()
  })

  it('asks the endpoint it was given, at that endpoint’s base URL', async () => {
    metaUrls = []
    const catalog = await getAll(DAEMON_B.id)

    // The URL is the claim. "A request happened" is true of the wrong machine
    // just as easily as the right one.
    // Non-empty first: `every` over nothing is vacuously true, and a handler
    // that asked no daemon at all would sail past the check below.
    expect(metaUrls.length).toBeGreaterThan(0)
    expect(metaUrls.every((url) => url.startsWith(DAEMON_B.baseUrl))).toBe(true)
    expect(catalog.executionHostId).toBe(DAEMON_B.id)
    expect(catalog.providers.map((entry) => entry.descriptor.id)).toEqual([
      'codex',
      'cursor',
    ])
    expect(catalog.providers[0]?.descriptor.modelOptions[0]?.id).toBe('b-gpt')
  })

  it('never hands one endpoint’s catalog back for another', async () => {
    const a = await getAll(DAEMON_A.id)
    const b = await getAll(DAEMON_B.id)

    expect(a.providers.map((entry) => entry.descriptor.id)).toEqual([
      'claude-code',
    ])
    expect(a.providers[0]?.descriptor.modelOptions[0]?.id).toBe('a-sonnet')
    expect(b.providers.map((entry) => entry.descriptor.id)).not.toContain(
      'claude-code',
    )
  })

  it('carries the daemon’s own refusal for a provider it will not run', async () => {
    const catalog = await getAll(DAEMON_B.id)
    const cursor = catalog.providers.find(
      (entry) => entry.descriptor.id === 'cursor',
    )
    expect(cursor?.blockedReason).toBe(
      'The daemon reports Cursor as unavailable: missing binary.',
    )
  })

  it('names each remote provider after itself, all the way to the renderer', async () => {
    // The option row's primary label is `vendorLabel || name`, and every
    // synthesized remote descriptor used to carry the constant "Remote daemon"
    // — so a daemon running three CLIs offered three rows saying the same word
    // where each provider's name belonged (MAR-2682, "the row names the
    // provider, not the machine"). Pinned here because this is the last point
    // the wire's descriptor and the row's derivation meet: the renderer's own
    // suite builds its descriptors by hand and cannot see this.
    const catalog = await getAll(DAEMON_B.id)
    const labels = catalog.providers.map(
      (entry) => entry.descriptor.vendorLabel || entry.descriptor.name,
    )

    expect(labels).toEqual(['Codex', 'Cursor'])
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('hands a value that is not a string through to the door that refuses it', async () => {
    // The service refuses a non-string by name; nothing proved the handler ever
    // let one reach it. A handler that coerced -- `String(...)`, or a
    // `typeof` guard falling back to local -- would satisfy every other test in
    // this file and quietly answer for this laptop about a request that was not
    // a request for it (MAR-2682).
    //
    // Two shapes, because they fail differently: a number is rendered, an object
    // is only named. Neither may come back as Local, and neither may trouble a
    // daemon.
    //
    // Mutation: map a non-string argument to `'local'` (or to `String(...)`)
    // in the `provider:getAll` handler, and both rows go red.
    metaUrls = []

    const numeric = await getAll(42)
    expect(numeric.executionHostId).not.toBe('local')
    expect(numeric.unreachableReason).toContain('a number (42)')
    expect(numeric.providers).toEqual([])

    const object = await getAll({ id: DAEMON_B.id })
    expect(object.executionHostId).not.toBe('local')
    expect(object.unreachableReason).toContain('an object')
    // And nothing the caller wrote is read while it is being refused, so the
    // endpoint id it was carrying is nowhere in the answer.
    expect(object.unreachableReason).not.toContain(DAEMON_B.id)
    expect(object.providers).toEqual([])

    expect(metaUrls).toEqual([])
  })

  it('answers about this machine when nothing names another, and asks no daemon', async () => {
    metaUrls = []
    const catalog = await getAll()

    expect(catalog.executionHostId).toBe('local')
    expect(catalog.providers).toEqual([])
    expect(catalog.unreachableReason).toBeNull()
    expect(metaUrls).toEqual([])
  })
})
