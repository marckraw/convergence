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
  type StubDaemon,
} from '../backend/provider/execution-host/execution-host-daemon.fixture'
import { daemonHealthFixtureWithoutDescriptor } from '../backend/provider/execution-host/execution-host-health.fixture'
import { ExecutionHostDaemonCredentialsService } from '../backend/credentials/execution-host-daemon-credentials.service'
import { ProviderRegistry } from '../backend/provider/provider-registry'
import { SessionService } from '../backend/session/session.service'
import { LocalExecutionHost } from '../backend/provider/execution-host/local-execution-host'
import type { AppSettings } from '../backend/app-settings/app-settings.types'

/**
 * The beat that makes a change behind the settings dialog visible (MAR-2689
 * rounds 6 and 8).
 *
 * A base URL edit is a settings Save, so the renderer hears about it and every
 * catalog read from the old address goes out of force at the next read. The two
 * changes pinned here are not Saves. A token change goes to the Keychain, and
 * the Endpoint row does not move. A daemon that stops advertising a capability
 * moves nothing in settings at all — same id, same address, same credential.
 * Neither reaches the renderer on its own, and without this wire the epoch that
 * says "this machine is not the one you asked" is real in main and never
 * arrives: the composer keeps showing, and offering, what the previous
 * configuration answered.
 *
 * Pinned here because its absence is silent: delete the lines that observe and
 * broadcast, and every other gate in this slice stays green while the one thing
 * the design exists for stops happening in the product.
 */

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const sent: Array<{ channel: string; payload: unknown }> = []
const exposed = new Map<string, unknown>()

/**
 * What the preload bridge has registered, by channel.
 *
 * `webContents.send` dispatches into it, so the mocked window is the real
 * window's other half rather than a recorder: a payload main pushes is a
 * payload the preload module's own listener receives, and a channel renamed on
 * one side alone reaches nobody.
 */
const rendererListeners = new Map<
  string,
  Array<(event: unknown, ...args: unknown[]) => void>
>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
    on: vi.fn(),
  },
  ipcRenderer: {
    on: (
      channel: string,
      listener: (event: unknown, ...args: unknown[]) => void,
    ) => {
      const existing = rendererListeners.get(channel) ?? []
      rendererListeners.set(channel, [...existing, listener])
    },
    removeListener: (
      channel: string,
      listener: (event: unknown, ...args: unknown[]) => void,
    ) => {
      const existing = rendererListeners.get(channel) ?? []
      rendererListeners.set(
        channel,
        existing.filter((candidate) => candidate !== listener),
      )
    },
    invoke: vi.fn(),
    send: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) => {
      exposed.set(key, api)
    },
  },
  nativeTheme: { prefersReducedTransparency: false },
  dialog: {},
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, payload: unknown) => {
            sent.push({ channel, payload })
            // A copy, because a listener is free to unregister itself here.
            for (const listener of [
              ...(rendererListeners.get(channel) ?? []),
            ]) {
              listener({}, payload)
            }
          },
        },
      },
    ],
  },
  shell: {},
}))

/** The one mount this file's last canary exists to pin. */
interface PreloadAppSettings {
  onUpdated: (callback: (settings: unknown) => void) => () => void
}

const DAEMON = { id: 'daemon-a', baseUrl: 'https://daemon-a.test' }

/**
 * `registerIpcHandlers` takes its collaborators positionally; three matter
 * here. A signature change that moves one fails loudly below rather than
 * quietly proving nothing.
 */
const SESSION_SERVICE_ARGUMENT = 6
const PROVIDER_REGISTRY_ARGUMENT = 7
const APP_SETTINGS_ARGUMENT = 11
const EXECUTION_HOST_REMOTE_ARGUMENT = 21
const ARGUMENT_COUNT = 22

describe('a daemon changing behind the settings dialog', () => {
  let db: Database.Database
  let tempDir: string
  let appSettings: AppSettingsService
  let credentials: ExecutionHostDaemonCredentialsService
  let registry: AppSettingsRemoteExecutionHostRegistry
  let stub: StubDaemon
  let tokens: Record<string, string | null>

  beforeEach(() => {
    handlers.clear()
    sent.length = 0
    rendererListeners.clear()
    db = getDatabase()
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-credential-ipc-'))
    seedExecutionHostEndpoint(db, DAEMON.id, DAEMON.baseUrl)

    stub = createStubDaemon()
    tokens = { [DAEMON.id]: 'token-a' }

    appSettings = new AppSettingsService(
      db,
      new StateService(db),
      async () => [],
      new ExecutionHostEndpointRepository(db),
      recordingExecutionHostCredentials(),
    )
    registry = new AppSettingsRemoteExecutionHostRegistry({
      appSettings,
      credentials: { resolveToken: async (id: string) => tokens[id] ?? null },
      fetch: stub.fetchFn,
      // Not this suite's subject: named so the composition root cannot
      // quietly lose the real one (MAR-2694 round 2).
      onWorkspaceReported: () => {},
    })

    // The real credentials service, with only the one method that reaches
    // `security` stood in for: the Keychain is not this test's subject, and a
    // suite that shelled out to it would be asking macOS a question about
    // Convergence's wiring.
    credentials = new ExecutionHostDaemonCredentialsService()
    vi.spyOn(credentials, 'setToken').mockImplementation(async (_input, id) => {
      tokens[id] = 'token-b'
      return {
        providerId: 'execution-host-daemon',
        configured: true,
        source: 'keychain',
        storage: 'keychain',
        account: id,
        service: 'convergence.execution-host-daemon',
        error: null,
      }
    })
    vi.spyOn(credentials, 'deleteToken').mockImplementation(async (id) => {
      tokens[id] = null
      return {
        providerId: 'execution-host-daemon',
        configured: false,
        source: null,
        storage: null,
        account: id,
        service: 'convergence.execution-host-daemon',
        error: null,
      }
    })

    const providerRegistry = new ProviderRegistry()
    const args: unknown[] = Array.from({ length: ARGUMENT_COUNT }, () => ({}))
    args[SESSION_SERVICE_ARGUMENT] = new SessionService(
      db,
      new LocalExecutionHost(providerRegistry),
      join(tempDir, 'global-sessions'),
    )
    args[PROVIDER_REGISTRY_ARGUMENT] = providerRegistry
    args[APP_SETTINGS_ARGUMENT] = appSettings
    args[EXECUTION_HOST_REMOTE_ARGUMENT] = { credentials, registry }
    ;(registerIpcHandlers as (...values: never[]) => void)(...(args as never[]))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  async function invoke(channel: string, input: unknown): Promise<unknown> {
    const handler = handlers.get(channel)
    expect(handler).toBeTypeOf('function')
    return handler?.({}, input)
  }

  /** The Endpoint list of the last settings payload pushed to a window. */
  function lastBroadcastEndpoints(): AppSettings['executionHostEndpoints'] {
    const updates = sent.filter(
      (entry) => entry.channel === 'appSettings:updated',
    )
    const latest = updates[updates.length - 1]
    if (!latest) throw new Error('no settings were broadcast')
    return (latest.payload as AppSettings).executionHostEndpoints
  }

  /**
   * The machine dialled once under the credential it already had.
   *
   * Any composer open on it has done this — a catalog read resolves the
   * connection — and it is what makes the rotation a *change* rather than a
   * first sighting. Without it the epoch would open at the new credential and
   * the test would prove nothing about rotation at all.
   */
  async function alreadyDialledOnce(): Promise<void> {
    await registry.observeEndpointConfiguration(DAEMON.id)
  }

  it('tells every window the machine is configured differently now', async () => {
    // Mutation: drop the `observeEndpointConfiguration` call from
    // `republishAfterCredentialChange`, and this goes red -- the broadcast
    // carries the epoch the *old* credential had, so nothing in the renderer
    // goes out of force. Mutation: drop the broadcast instead, and this goes
    // red on "no settings were broadcast".
    await alreadyDialledOnce()
    const before = (await appSettings.getAppSettings())
      .executionHostEndpoints[0]
    expect(before?.configurationEpoch).toBe(0)

    await invoke('credentials:executionHostDaemon:setToken', {
      endpointId: DAEMON.id,
      token: 'whatever the human pasted',
    })

    const broadcast = lastBroadcastEndpoints()[0]
    expect(broadcast?.id).toBe(DAEMON.id)
    expect(broadcast?.baseUrl).toBe(DAEMON.baseUrl)
    expect(broadcast?.configurationEpoch).not.toBe(before?.configurationEpoch)
    // And what was broadcast is what a fresh read says, not a number invented
    // for the message.
    expect(broadcast?.configurationEpoch).toBe(
      (await appSettings.getAppSettings()).executionHostEndpoints[0]
        ?.configurationEpoch,
    )
  })

  it('says the same thing when the credential is taken away', async () => {
    // The other gesture the dialog offers. Removing a token leaves the machine
    // unreachable, and a composer still showing its providers would be
    // offering a machine nothing can dial.
    //
    // Mutation: leave `deleteToken` out of `republishAfterCredentialChange`,
    // and this goes red.
    await alreadyDialledOnce()
    await invoke('credentials:executionHostDaemon:setToken', {
      endpointId: DAEMON.id,
      token: 'whatever the human pasted',
    })
    const afterSave = lastBroadcastEndpoints()[0]?.configurationEpoch

    await invoke('credentials:executionHostDaemon:deleteToken', {
      endpointId: DAEMON.id,
    })

    expect(lastBroadcastEndpoints()[0]?.configurationEpoch).not.toBe(afterSave)
  })

  it('says it again when the machine withdraws a capability at the same address', async () => {
    // The third caller of the one republish helper (MAR-2689 round 8). A
    // capability withdrawal is the change with no settings gesture at all: the
    // daemon is upgraded at the same URL under the same credential, and the
    // only production beat that observes it is Test connection in this dialog.
    // Main already refuses a Project the withdrawn capability authorised; until
    // this wire existed that refusal never reached the renderer, so the strip
    // kept offering the place the door had stopped accepting.
    //
    // Mutation: leave `executionHost:testRemoteConnection` out of
    // `republishAfterConfigurationChange`, and this goes red on "no settings
    // were broadcast". Mutation: observe the fingerprint only (drop the
    // capability observation), and this goes red on the epoch, which never
    // moves.
    await invoke('executionHost:testRemoteConnection', {
      endpointId: DAEMON.id,
    })
    const whileItAdvertised = lastBroadcastEndpoints()[0]?.configurationEpoch

    stub.setHealthBody(JSON.stringify(daemonHealthFixtureWithoutDescriptor()))
    await invoke('executionHost:testRemoteConnection', {
      endpointId: DAEMON.id,
    })

    const broadcast = lastBroadcastEndpoints()[0]
    expect(broadcast?.id).toBe(DAEMON.id)
    expect(broadcast?.baseUrl).toBe(DAEMON.baseUrl)
    expect(broadcast?.configurationEpoch).not.toBe(whileItAdvertised)
    expect(broadcast?.configurationEpoch).toBe(
      (await appSettings.getAppSettings()).executionHostEndpoints[0]
        ?.configurationEpoch,
    )
  })

  /**
   * The last link, and the only one no other suite can see (MAR-2689 round 9).
   *
   * Everything above stops at `webContents.send`; the renderer store test
   * installs a wholly mocked `window.electronAPI.appSettings.onUpdated`; and the
   * two real-preload canaries in `execution-host-credentials.ipc.test.ts` cover
   * the credential sweep and the environment override. So nothing mentioned the
   * one preload line the whole correction travels down, and deleting it left
   * every reported suite green while, in the app, no renderer callback ever
   * fired and the withdrawn machine's Projects stayed in the strip for the life
   * of the process. Silent absence, at the seam the round exists to close.
   *
   * The real preload module, against the real main broadcast: the mocked
   * `webContents.send` dispatches into whatever `ipcRenderer.on` registered, so
   * only a listener on the channel main actually pushes to hears anything.
   */
  async function appSettingsBridge(): Promise<PreloadAppSettings> {
    await import('../preload/index')
    const api = exposed.get('electronAPI') as
      | { appSettings: PreloadAppSettings }
      | undefined
    expect(api).toBeDefined()
    return (api as { appSettings: PreloadAppSettings }).appSettings
  }

  it('hands the moved epoch to a renderer listening through the real bridge', async () => {
    // Mutation: delete the `appSettings.onUpdated` mount from
    // `electron/preload/index.ts`, or change its channel by one character, and
    // this goes red -- main still broadcasts, every suite above still passes,
    // and nothing arrives.
    //
    // Mutation: make the returned unsubscribe a no-op, and the last two asserts
    // go red -- a renderer that stopped listening would keep being told.
    const bridge = await appSettingsBridge()
    expect(bridge.onUpdated).toBeTypeOf('function')

    const received: AppSettings[] = []
    const stopListening = bridge.onUpdated((settings) => {
      received.push(settings as AppSettings)
    })

    await invoke('executionHost:testRemoteConnection', {
      endpointId: DAEMON.id,
    })
    const whileItAdvertised =
      received.at(-1)?.executionHostEndpoints[0]?.configurationEpoch
    expect(whileItAdvertised).toBeTypeOf('number')

    stub.setHealthBody(JSON.stringify(daemonHealthFixtureWithoutDescriptor()))
    await invoke('executionHost:testRemoteConnection', {
      endpointId: DAEMON.id,
    })

    // What the renderer holds is the Endpoint list itself, carrying the moved
    // epoch -- not a signal that something happened, which it would have to ask
    // about separately and could act on before the answer came back.
    const arrived = received.at(-1)?.executionHostEndpoints[0]
    expect(arrived?.id).toBe(DAEMON.id)
    expect(arrived?.baseUrl).toBe(DAEMON.baseUrl)
    expect(arrived?.configurationEpoch).not.toBe(whileItAdvertised)
    // And it is the number main broadcast, not one this test computed.
    expect(arrived?.configurationEpoch).toBe(
      lastBroadcastEndpoints()[0]?.configurationEpoch,
    )

    stopListening()
    const deliveredSoFar = received.length
    const broadcastsSoFar = sent.filter(
      (entry) => entry.channel === 'appSettings:updated',
    ).length

    await invoke('credentials:executionHostDaemon:setToken', {
      endpointId: DAEMON.id,
      token: 'whatever the human pasted',
    })

    // Main went on broadcasting, so "nothing arrived" means the listener was
    // removed rather than that nothing was sent.
    expect(
      sent.filter((entry) => entry.channel === 'appSettings:updated').length,
    ).toBeGreaterThan(broadcastsSoFar)
    expect(received.length).toBe(deliveredSoFar)
  })
})
