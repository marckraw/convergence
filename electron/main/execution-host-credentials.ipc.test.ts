import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { registerIpcHandlers } from './ipc'
import {
  closeDatabase,
  getDatabase,
  resetDatabase,
} from '../backend/database/database'
import { AppSettingsService } from '../backend/app-settings/app-settings.service'
import { ExecutionHostEndpointRepository } from '../backend/execution-host-endpoint/execution-host-endpoint.repository'
import { seedExecutionHostEndpoint } from '../backend/execution-host-endpoint/execution-host-endpoint.fixture'
import { StateService } from '../backend/state/state.service'
import { AppSettingsRemoteExecutionHostRegistry } from '../backend/provider/execution-host/remote-execution-host.registry'
import {
  createStubDaemon,
  waitUntil,
  type StubDaemon,
} from '../backend/provider/execution-host/execution-host-daemon.fixture'

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

const SESSION_SERVICE_ARGUMENT = 6
const APP_SETTINGS_ARGUMENT = 11
const EXECUTION_HOST_REMOTE_ARGUMENT = 21
const ARGUMENT_COUNT = 22

describe('the execution host daemon ipc handlers', () => {
  let db: Database.Database
  let ambientDaemon: StubDaemon
  let namedDaemon: StubDaemon
  let requestUrls: string[]
  let credentialCalls: Array<{ method: string; endpointId: string }>

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

    const appSettings = new AppSettingsService(
      db,
      new StateService(db),
      async () => [],
      new ExecutionHostEndpointRepository(db),
    )
    const credentials = {
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
  })

  function call(channel: string, payload: unknown): Promise<unknown> {
    const handler = handlers.get(channel)
    expect(handler).toBeTypeOf('function')
    return Promise.resolve(handler?.({}, payload))
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

  it('refuses a call that names no endpoint at all', async () => {
    await expect(
      call('credentials:executionHostDaemon:getStatus', {}),
    ).rejects.toThrow(/endpoint id is required/)
    expect(credentialCalls).toEqual([])
  })
})
