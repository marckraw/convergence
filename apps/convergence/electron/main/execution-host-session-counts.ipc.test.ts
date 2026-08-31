import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { registerIpcHandlers } from './ipc'
import {
  closeDatabase,
  getDatabase,
  resetDatabase,
} from '../backend/database/database'
import { LocalExecutionHost } from '../backend/provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../backend/provider/provider-registry'
import { SessionService } from '../backend/session/session.service'
import type { ExecutionHostSessionCount } from '../backend/session/session.types'

/**
 * The removal warning's whole supply line, in one place (MAR-2642).
 *
 * The settings surface says how many sessions a removal strands. Every renderer
 * test stubs `window.electronAPI`, so replacing this handler's body with
 * `() => ({})` left both suites green while the warning went permanently
 * silent — a destructive removal presented as free, which is the lie this era
 * exists to prevent. So the composition is pinned here: real sessions in a real
 * database, through the registered handler, plus the preload mount that carries
 * the call across.
 */

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const exposed = new Map<string, unknown>()
const invocations: string[] = []

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
    on: vi.fn(),
  },
  ipcRenderer: {
    invoke: (channel: string) => {
      invocations.push(channel)
      return Promise.resolve(null)
    },
    on: vi.fn(),
    removeListener: vi.fn(),
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

const SESSION_SERVICE_ARGUMENT = 6
const ARGUMENT_COUNT = 22

const COUNTS_CHANNEL = 'executionHost:sessionCountsByEndpoint'

describe('the execution host session count handler', () => {
  let db: Database.Database

  /**
   * Ids straight out of `Object.prototype`, because these are the user's own
   * Endpoint ids and nothing stops one being called `toString`. A bare object
   * accumulator reads `counts['toString']` as an inherited function rather than
   * a missing count, and `counts['__proto__'] = n` goes to the prototype setter
   * and is lost — a real Endpoint's warning turns to garbage or to silence.
   */
  function seedSession(id: string, executionHost: string): void {
    db.prepare(
      `INSERT INTO sessions
         (id, context_kind, provider_id, name, working_directory, execution_host)
       VALUES (?, 'global', 'claude-code', ?, '/tmp', ?)`,
    ).run(id, id, executionHost)
  }

  beforeEach(() => {
    handlers.clear()
    invocations.length = 0
    db = getDatabase()

    const sessionService = new SessionService(
      db,
      new LocalExecutionHost(new ProviderRegistry()),
      '/tmp',
    )

    const args: unknown[] = Array.from({ length: ARGUMENT_COUNT }, () => ({}))
    args[SESSION_SERVICE_ARGUMENT] = sessionService
    ;(registerIpcHandlers as (...values: never[]) => void)(...(args as never[]))
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  function count(): Promise<ExecutionHostSessionCount[]> {
    const handler = handlers.get(COUNTS_CHANNEL)
    expect(handler).toBeTypeOf('function')
    return Promise.resolve(handler?.({})) as Promise<
      ExecutionHostSessionCount[]
    >
  }

  it('counts the sessions that name each execution host', async () => {
    seedSession('a', 'kuba')
    seedSession('b', 'kuba')
    seedSession('c', 'default')
    seedSession('d', 'local')

    const counted = new Map(
      (await count()).map((entry) => [entry.executionHostId, entry.sessions]),
    )

    expect(counted.get('kuba')).toBe(2)
    expect(counted.get('default')).toBe(1)
    expect(counted.get('local')).toBe(1)
  })

  it('folds a blank execution host into this machine, as every old row meant', async () => {
    seedSession('a', 'local')
    seedSession('b', '')

    const counted = new Map(
      (await count()).map((entry) => [entry.executionHostId, entry.sessions]),
    )

    expect(counted.get('local')).toBe(2)
    expect(counted.has('')).toBe(false)
  })

  it('counts endpoints named after Object.prototype members', async () => {
    seedSession('a', 'toString')
    seedSession('b', '__proto__')
    seedSession('c', '__proto__')
    seedSession('d', 'constructor')

    const counted = new Map(
      (await count()).map((entry) => [entry.executionHostId, entry.sessions]),
    )

    expect(counted.get('toString')).toBe(1)
    expect(counted.get('__proto__')).toBe(2)
    expect(counted.get('constructor')).toBe(1)
  })

  it('reports nothing rather than zeroes when no session names a host', async () => {
    expect(await count()).toEqual([])
  })

  /**
   * The link the renderer suite cannot see: it stubs `window.electronAPI`
   * wholesale, so deleting this mount leaves every one of its tests green while
   * the real app throws on open.
   */
  it('is mounted on the preload bridge under the channel the main process handles', async () => {
    await import('../preload/index')

    const api = exposed.get('electronAPI') as {
      executionHost: { sessionCountsByEndpoint: () => Promise<unknown> }
    }
    expect(api.executionHost.sessionCountsByEndpoint).toBeTypeOf('function')

    await api.executionHost.sessionCountsByEndpoint()
    expect(invocations).toEqual([COUNTS_CHANNEL])
  })
})
