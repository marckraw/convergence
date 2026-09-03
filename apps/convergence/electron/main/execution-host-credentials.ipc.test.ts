import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { registerIpcHandlers } from './ipc'
import {
  closeDatabase,
  getDatabase,
  resetDatabase,
} from '../backend/database/database'
import { AppSettingsService } from '../backend/app-settings/app-settings.service'
import {
  recordingExecutionHostCredentials,
  type RecordingExecutionHostCredentials,
} from '../backend/credentials/execution-host-daemon-credentials.fixture'
import {
  EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY,
  ExecutionHostDaemonCredentialsService,
} from '../backend/credentials/execution-host-daemon-credentials.service'
import { ExecutionHostEndpointRepository } from '../backend/execution-host-endpoint/execution-host-endpoint.repository'
import { seedExecutionHostEndpoint } from '../backend/execution-host-endpoint/execution-host-endpoint.fixture'
import { StateService } from '../backend/state/state.service'
import { AppSettingsRemoteExecutionHostRegistry } from '../backend/provider/execution-host/remote-execution-host.registry'
import {
  createStubDaemon,
  waitUntil,
  type StubDaemon,
} from '@convergence/execution-host-client'

/**
 * The four daemon handlers, each acting on the Endpoint the caller named
 * (MAR-2629).
 *
 * These closed over `DEFAULT_EXECUTION_HOST_ENDPOINT_ID` while one Endpoint was
 * all there could be. With two configured, an ambient default is not a
 * shortcut: `setToken` would file kuba-vps's token under the other machine's
 * Keychain account, and `testRemoteConnection` would report the wrong daemon's
 * version as this row's answer — both while every other test stayed green.
 *
 * So the canary configures two Endpoints, calls each handler naming the second,
 * and asserts the id that arrived. `'default'` is deliberately one of the two
 * and deliberately not the one asked for: a revert to the ambient default lands
 * on a configured Endpoint, passes validation, and still fails here.
 */

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const exposed = new Map<string, unknown>()

/**
 * `ipcRenderer.invoke` dispatches into the handler the main process actually
 * registered, so a preload mount is only satisfied by the channel string its
 * own handler answers to. Recording the channel alone would let the two halves
 * drift to a name nothing serves.
 */
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
    on: vi.fn(),
  },
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => {
      const handler = handlers.get(channel)
      if (!handler) {
        return Promise.reject(
          new Error(`No ipcMain handler is registered for "${channel}".`),
        )
      }
      return Promise.resolve(handler({}, ...args))
    },
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    send: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) => {
      exposed.set(key, api)
    },
  },
  nativeTheme: { prefersReducedTransparency: false },
  dialog: {},
  BrowserWindow: { getAllWindows: () => [] },
  shell: {},
}))

const AMBIENT = { id: 'default', baseUrl: 'https://ambient.test' }
const NAMED = { id: 'kuba-vps', baseUrl: 'https://kuba.test' }

/**
 * `registerIpcHandlers` wires listeners onto the session service as it
 * registers. Nothing here exercises them, so this stands in for the whole
 * surface with no-ops; a signature change that moves the arguments below fails
 * loudly — the handler is missing, or registration throws.
 */
const inertSessionService = new Proxy(
  {},
  { get: () => () => undefined },
) as unknown

/** Only the two mounts these canaries exist to pin. */
interface PreloadBridge {
  appSettings: { sweepExecutionHostCredentials: () => Promise<string[]> }
  credentials: {
    executionHostDaemon: {
      environmentOverride: () => Promise<{
        configured: boolean
        envKey: string
        endpointId: string
      }>
    }
  }
}

const SESSION_SERVICE_ARGUMENT = 7
const APP_SETTINGS_ARGUMENT = 12
const EXECUTION_HOST_REMOTE_ARGUMENT = 22
const ARGUMENT_COUNT = 23

describe('the execution host daemon ipc handlers', () => {
  const previousEnvToken = process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY]
  let db: Database.Database
  let ambientDaemon: StubDaemon
  let namedDaemon: StubDaemon
  let requestUrls: string[]
  let credentialCalls: Array<{ method: string; endpointId: string }>
  let endpointCredentials: RecordingExecutionHostCredentials

  function routedFetch(): typeof fetch {
    return (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      requestUrls.push(url)
      if (url.startsWith(AMBIENT.baseUrl))
        return ambientDaemon.fetchFn(url, init)
      if (url.startsWith(NAMED.baseUrl)) return namedDaemon.fetchFn(url, init)
      throw new Error(`No daemon serves ${url}`)
    }) as typeof fetch
  }

  beforeEach(async () => {
    handlers.clear()
    db = getDatabase()
    credentialCalls = []
    requestUrls = []

    seedExecutionHostEndpoint(db, AMBIENT.id, AMBIENT.baseUrl)
    seedExecutionHostEndpoint(db, NAMED.id, NAMED.baseUrl)
    db.prepare(
      'UPDATE execution_host_endpoints SET position = 1 WHERE id = ?',
    ).run(NAMED.id)

    ambientDaemon = createStubDaemon()
    namedDaemon = createStubDaemon()
    namedDaemon.setMeta({ providers: [] })

    delete process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY]
    endpointCredentials = recordingExecutionHostCredentials()
    const appSettings = new AppSettingsService(
      db,
      new StateService(db),
      async () => [],
      new ExecutionHostEndpointRepository(db),
      endpointCredentials,
    )
    // The one method that is the real service: `describeEnvironmentOverride`
    // reads `process.env` and nothing else, so it can answer here without
    // reaching `security`. Stubbing it would have left the canary below pinning
    // a stub's constant instead of the fact the handler is supposed to report.
    const environmentOverrides = new ExecutionHostDaemonCredentialsService()
    const credentials = {
      describeEnvironmentOverride: () =>
        environmentOverrides.describeEnvironmentOverride(),
      getStatus: async (endpointId: string) => {
        credentialCalls.push({ method: 'getStatus', endpointId })
        return { providerId: 'execution-host-daemon', account: endpointId }
      },
      setToken: async (_input: { token: string }, endpointId: string) => {
        credentialCalls.push({ method: 'setToken', endpointId })
        return { providerId: 'execution-host-daemon', account: endpointId }
      },
      deleteToken: async (endpointId: string) => {
        credentialCalls.push({ method: 'deleteToken', endpointId })
        return { providerId: 'execution-host-daemon', account: endpointId }
      },
      resolveToken: async (endpointId: string) => `token-${endpointId}`,
    }
    const registry = new AppSettingsRemoteExecutionHostRegistry({
      appSettings,
      credentials,
      fetch: routedFetch(),
      // Not this suite's subject: named so the composition root cannot
      // quietly lose the real one (MAR-2694 round 2).
      onWorkspaceReported: () => {},
    })

    await registry.primeConfiguredEndpoints()
    await waitUntil(
      () => registry.hostFor(AMBIENT.id).capabilities().length > 0,
      'the ambient daemon to be listed',
    )

    const args: unknown[] = Array.from({ length: ARGUMENT_COUNT }, () => ({}))
    args[SESSION_SERVICE_ARGUMENT] = inertSessionService
    args[APP_SETTINGS_ARGUMENT] = appSettings
    args[EXECUTION_HOST_REMOTE_ARGUMENT] = { credentials, registry }
    ;(registerIpcHandlers as (...values: never[]) => void)(...(args as never[]))
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    if (previousEnvToken === undefined) {
      delete process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY]
    } else {
      process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY] = previousEnvToken
    }
  })

  function call(channel: string, payload: unknown): Promise<unknown> {
    const handler = handlers.get(channel)
    expect(handler).toBeTypeOf('function')
    // `ipcMain.handle` invokes the handler inside its own try/catch and replies
    // with the error, so a renderer never sees a synchronous throw. Modelled
    // here because three of these handlers are deliberately not `async`
    // (MAR-2642): they must reach the credential queue in the same tick.
    try {
      return Promise.resolve(handler?.({}, payload))
    } catch (error) {
      return Promise.reject(error)
    }
  }

  it('files a token under the endpoint the caller named', async () => {
    await call('credentials:executionHostDaemon:setToken', {
      endpointId: NAMED.id,
      token: 'sk-live',
    })

    expect(credentialCalls).toEqual([
      { method: 'setToken', endpointId: NAMED.id },
    ])
  })

  it('reads and deletes the named endpoint’s token, not the first one’s', async () => {
    await call('credentials:executionHostDaemon:getStatus', {
      endpointId: NAMED.id,
    })
    await call('credentials:executionHostDaemon:deleteToken', {
      endpointId: NAMED.id,
    })

    expect(credentialCalls).toEqual([
      { method: 'getStatus', endpointId: NAMED.id },
      { method: 'deleteToken', endpointId: NAMED.id },
    ])
  })

  it('tests the named endpoint at its own base URL', async () => {
    // Both daemons answer, and both answers look equally convincing. The URL
    // is the claim; "a request happened" is true of the wrong machine too.
    const before = requestUrls.length
    const result = (await call('executionHost:testRemoteConnection', {
      endpointId: NAMED.id,
    })) as { ok: boolean; baseUrl: string | null }

    expect(result.ok).toBe(true)
    expect(result.baseUrl).toBe(NAMED.baseUrl)
    const dialed = requestUrls.slice(before)
    expect(dialed.every((url) => url.startsWith(NAMED.baseUrl))).toBe(true)
    expect(dialed.length).toBeGreaterThan(0)
  })

  it('refuses an endpoint id that names no configured machine', async () => {
    await expect(
      call('credentials:executionHostDaemon:setToken', {
        endpointId: 'vanished',
        token: 'sk-live',
      }),
    ).rejects.toThrow(/"vanished" is not configured/)
    // The point of refusing: a token written here would sit in the Keychain
    // under an account no Endpoint will ever read.
    expect(credentialCalls).toEqual([])
  })

  /**
   * The guard answers about the value the caller sent, never a repair of it
   * (MAR-2642).
   *
   * It used to `trim()` first, so ` kuba-vps ` was accepted as `kuba-vps` and
   * the token went into the real kuba-vps's Keychain account: a request that
   * named one machine, satisfied against another. The save path one layer down
   * already refuses an id it could have quietly trimmed into a different one;
   * this is that rule at the boundary where the id arrives from a caller that
   * is not a person and can be exact.
   *
   * The human-typed fields on the same surface still trim, deliberately —
   * pinned in `src/features/app-settings/execution-host-settings.pure.test.ts`.
   */
  it('refuses an id that trimming would have turned into a configured one', async () => {
    await expect(
      call('credentials:executionHostDaemon:setToken', {
        endpointId: ` ${NAMED.id} `,
        token: 'sk-live',
      }),
    ).rejects.toThrow(/is not configured/)
    // The whole point of refusing: repaired, this call writes a secret under
    // an account the caller never named.
    expect(credentialCalls).toEqual([])
  })

  it('quotes the refused id so a newline cannot hide inside it', async () => {
    await expect(
      call('credentials:executionHostDaemon:deleteToken', {
        endpointId: `${NAMED.id}\n`,
      }),
    ).rejects.toThrow(
      'Execution host endpoint "kuba-vps\\n" is not configured.',
    )
    expect(credentialCalls).toEqual([])
  })

  it('refuses a call that names no endpoint at all', async () => {
    await expect(
      call('credentials:executionHostDaemon:getStatus', {}),
    ).rejects.toThrow(/endpoint id is required/)
    expect(credentialCalls).toEqual([])
  })

  /**
   * Every credential method takes its Endpoint's queue slot the moment it is
   * called, before its own first `await` — that queue is what stops a token
   * Save from landing after the removal that followed it and recreating the
   * credential of a machine that is gone (MAR-2642).
   *
   * Which makes *when the handler reaches it* the whole question. Anything the
   * handler awaits first is a window in which a removal can take the slot
   * ahead of the Save, and the Save then lands behind it — validated against an
   * Endpoint that existed when it was asked about and does not now. Resolving
   * the id used to read the endpoint list through `getAppSettings`, which
   * awaits provider descriptors that have nothing to say about which machines
   * exist.
   *
   * So the canary is the tick itself: the handler is invoked and not awaited,
   * and the credential call must already have happened. Reinstate any `await`
   * before it and this fails, whatever the awaited thing turns out to cost.
   */
  it('claims the endpoint’s credential queue before the handler’s first await', () => {
    const handler = handlers.get('credentials:executionHostDaemon:setToken')
    expect(handler).toBeTypeOf('function')

    void handler?.({}, { endpointId: NAMED.id, token: 'sk-live' })

    expect(credentialCalls).toEqual([
      { method: 'setToken', endpointId: NAMED.id },
    ])
  })

  it('refuses, synchronously, an endpoint that stopped existing', () => {
    // The other half of the same tick: resolving the id must not have become
    // "trust it and check later" in exchange for being synchronous.
    const handler = handlers.get('credentials:executionHostDaemon:deleteToken')
    expect(() => handler?.({}, { endpointId: 'vanished' })).toThrow(
      /"vanished" is not configured/,
    )
    expect(credentialCalls).toEqual([])
  })

  /**
   * The environment override, composed rather than described (MAR-2642).
   *
   * The service knows whether the variable is set, and the settings surface
   * knows how to say so; the handler between them is the part nothing was
   * driving. Replacing it with a permanent `configured: false` left every gate
   * green while the one credential no sweep can collect and no Endpoint row
   * records went silent — which is the invisible dead credential the whole
   * feature exists to make visible.
   *
   * So the canary asks twice, across a change only the environment made. A
   * constant cannot answer both.
   */
  it('answers the environment override from the environment, not a constant', async () => {
    expect(
      await call('credentials:executionHostDaemon:environmentOverride', {}),
    ).toEqual({
      configured: false,
      envKey: EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY,
      endpointId: 'default',
    })

    process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY] = 'env-override'

    const set = (await call(
      'credentials:executionHostDaemon:environmentOverride',
      {},
    )) as { configured: boolean; endpointId: string }
    expect(set.configured).toBe(true)
    expect(set.endpointId).toBe('default')
    // And still without the token: this surface says that a credential exists,
    // never what it is.
    expect(JSON.stringify(set)).not.toContain('env-override')
  })

  /**
   * The sweep, composed (MAR-2642).
   *
   * A removal commits the settings before it destroys the token, so a Keychain
   * that refused the cleanup leaves an entry filed under an id no Endpoint will
   * ever bear again. The service knows how to collect that debt and the store
   * knows how to destroy the entry; the hook that runs it was the part nothing
   * was driving — removing it altogether left every gate green, with tokens
   * quietly outliving their machines.
   *
   * Two hooks, because they answer two different failures: the first settings
   * load of a launch, and every settings-dialog open thereafter.
   */
  it('collects the cleanup debt when settings are first loaded', async () => {
    endpointCredentials.stored.add('vanished')

    await call('appSettings:get', {})

    // Detached from the read on purpose — loading settings must not wait on
    // `security` — so the assertion waits for it rather than for the handler.
    await waitUntil(
      () => endpointCredentials.forgotten.includes('vanished'),
      'the orphaned credential to be collected',
    )
    expect(endpointCredentials.stored.has('vanished')).toBe(false)
  })

  /**
   * The claim the load hook alone could not make true: the renderer loads
   * settings once and keeps them, so reopening Settings never reached
   * `appSettings:get` again and a cleanup that failed sat there until the app
   * was restarted.
   */
  it('collects it again on demand, without a restart', async () => {
    endpointCredentials.stored.add('vanished')

    expect(await call('appSettings:sweepExecutionHostCredentials', {})).toEqual(
      ['vanished'],
    )
    expect(endpointCredentials.forgotten).toEqual(['vanished'])

    // Idempotent, which is what makes it safe to ask for on every open: every
    // account under this service belongs to an Endpoint, so one that is not a
    // stored id is garbage and one that is, is never touched.
    endpointCredentials.stored.add(NAMED.id)
    expect(await call('appSettings:sweepExecutionHostCredentials', {})).toEqual(
      [],
    )
    expect(endpointCredentials.stored.has(NAMED.id)).toBe(true)
  })

  /**
   * The wire, for both channels this slice added (MAR-2642).
   *
   * Everything above drives `handlers` directly and every renderer test stubs
   * `window.electronAPI` wholesale, so deleting either mount from
   * `electron/preload/index.ts` left typecheck and every suite green while the
   * real app threw the moment Settings opened. Silent absence — the same class
   * as the relay bootstrap that became a no-op with nothing to show for it.
   *
   * So these load the real preload module and call what it exposed. Because the
   * mocked `ipcRenderer.invoke` dispatches into the handler the main process
   * registered, a channel renamed on one side alone fails here too.
   */
  async function bridge(): Promise<PreloadBridge> {
    await import('../preload/index')
    return exposed.get('electronAPI') as PreloadBridge
  }

  it('mounts the credential sweep on the bridge, carrying its answer back', async () => {
    endpointCredentials.stored.add('vanished')

    const api = await bridge()
    expect(api.appSettings.sweepExecutionHostCredentials).toBeTypeOf('function')

    expect(await api.appSettings.sweepExecutionHostCredentials()).toEqual([
      'vanished',
    ])
    expect(endpointCredentials.forgotten).toEqual(['vanished'])
  })

  it('mounts the environment override on the bridge, carrying its answer back', async () => {
    process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY] = 'env-override'

    const daemon = (await bridge()).credentials.executionHostDaemon
    expect(daemon.environmentOverride).toBeTypeOf('function')

    expect(await daemon.environmentOverride()).toEqual({
      configured: true,
      envKey: EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY,
      endpointId: 'default',
    })
  })
})
