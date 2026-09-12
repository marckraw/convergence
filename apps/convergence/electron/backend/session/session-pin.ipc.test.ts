import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { registerIpcHandlers } from '../../main/ipc'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { SessionService } from './session.service'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'

const { handlers, send } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  send: vi.fn(),
}))
vi.mock('../pull-request/pull-request-refresh.service', () => ({
  connectPullRequestRefresh: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (key: string, fn: (...args: unknown[]) => unknown) =>
      handlers.set(key, fn),
    on: vi.fn(),
  },
  BrowserWindow: { getAllWindows: () => [{ webContents: { send } }] },
  dialog: {},
  shell: {},
}))
afterEach(() => {
  closeDatabase()
  resetDatabase()
  handlers.clear()
  send.mockClear()
})

it('pin IPC broadcasts and survives reload; second migration is guarded (mutation: store-only pin or unconditional ALTER)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'run74-pin-'))
  const path = join(dir, 'pin.sqlite')
  const db = getDatabase(path)
  const service = new SessionService(
    db,
    new LocalExecutionHost(new ProviderRegistry()),
  )
  try {
    const session = service.create({
      contextKind: 'global',
      providerId: 'codex',
      model: null,
      effort: null,
      name: 'Pinned',
    })
    const args = Array.from(
      { length: 18 },
      () => new Proxy({}, { get: () => vi.fn() }),
    )
    args[7] = service
    ;(registerIpcHandlers as (...args: unknown[]) => void)(...args)
    const pin = handlers.get('session:setPinned')!
    expect(pin).toBeTypeOf('function')
    const result = (await pin({}, session.id, true)) as {
      pinnedAt: string
      updatedAt: string
    }
    expect(result.pinnedAt).toMatch(/^\d{4}-/)
    expect(result.updatedAt).toBe(session.updatedAt)
    expect(send).toHaveBeenCalledWith(
      'session:summaryUpdated',
      expect.objectContaining({ id: session.id, pinnedAt: result.pinnedAt }),
    )
    await service.disposeAll()
    closeDatabase()
    resetDatabase()
    const reloaded = new SessionService(
      getDatabase(path),
      new LocalExecutionHost(new ProviderRegistry()),
    )
    expect(reloaded.getSummaryById(session.id)?.pinnedAt).toBe(result.pinnedAt)
    args[7] = reloaded
    ;(registerIpcHandlers as (...args: unknown[]) => void)(...args)
    await handlers.get('session:setPinned')!({}, session.id, false)
    expect(reloaded.getSummaryById(session.id)?.pinnedAt).toBeNull()
    await reloaded.disposeAll()
  } finally {
    await service.disposeAll()
    closeDatabase()
    resetDatabase()
    rmSync(dir, { recursive: true, force: true })
  }
})
