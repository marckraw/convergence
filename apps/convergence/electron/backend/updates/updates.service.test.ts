import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdatesService, type AutoUpdaterLike } from './updates.service'
import type { UpdateStatus } from './updates.types'

type Handler = (...args: unknown[]) => void

interface FakeAutoUpdater extends AutoUpdaterLike {
  emit(event: string, ...args: unknown[]): void
  listenerCount(event: string): number
}

function makeFakeAutoUpdater(): FakeAutoUpdater {
  const handlers = new Map<string, Set<Handler>>()
  return {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    allowDowngrade: true,
    forceDevUpdateConfig: true,
    logger: { placeholder: true },
    on(event, handler) {
      let set = handlers.get(event)
      if (!set) {
        set = new Set()
        handlers.set(event, set)
      }
      set.add(handler)
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler)
    },
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => undefined),
    quitAndInstall: vi.fn(),
    emit(event, ...args) {
      handlers.get(event)?.forEach((handler) => handler(...args))
    },
    listenerCount(event) {
      return handlers.get(event)?.size ?? 0
    },
  }
}

function makeService(
  overrides: {
    autoUpdater?: FakeAutoUpdater
    appVersion?: string
  } = {},
) {
  const autoUpdater = overrides.autoUpdater ?? makeFakeAutoUpdater()
  const statuses: UpdateStatus[] = []
  const broadcast = (status: UpdateStatus) => statuses.push(status)
  const openExternal = vi.fn(async () => undefined)
  const now = () => new Date('2026-04-22T17:00:00.000Z')
  const service = new UpdatesService({
    autoUpdater,
    appVersion: overrides.appVersion ?? '0.16.0',
    broadcast,
    openExternal,
    releaseNotesUrl: (v) => `https://example.test/v${v}`,
    now,
  })
  return { service, autoUpdater, statuses, openExternal }
}

describe('UpdatesService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('configures autoUpdater with safe flags on construction', () => {
    const { autoUpdater } = makeService()
    expect(autoUpdater.autoDownload).toBe(false)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
    expect(autoUpdater.allowPrerelease).toBe(false)
    expect(autoUpdater.allowDowngrade).toBe(false)
    expect(autoUpdater.forceDevUpdateConfig).toBe(false)
    expect(autoUpdater.logger).toBeNull()
  })

  it('check() transitions idle → checking and calls autoUpdater', () => {
    const { service, autoUpdater, statuses } = makeService()
    service.check('user')
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(service.getStatus().phase).toBe('checking')
    expect(statuses.map((s) => s.phase)).toEqual(['checking'])
    expect(service.getLastTrigger()).toBe('user')
  })

  it('update-available emits available status with release notes URL', () => {
    const { service, autoUpdater, statuses } = makeService()
    service.check('user')
    autoUpdater.emit('update-available', { version: '0.17.0' })
    const status = service.getStatus()
    expect(status).toEqual({
      phase: 'available',
      version: '0.17.0',
      releaseNotesUrl: 'https://example.test/v0.17.0',
      detectedAt: '2026-04-22T17:00:00.000Z',
    })
    expect(statuses.at(-1)).toEqual(status)
  })

  it('update-not-available emits not-available with current version', () => {
    const { service, autoUpdater } = makeService()
    service.check('background')
    autoUpdater.emit('update-not-available', {})
    expect(service.getStatus()).toEqual({
      phase: 'not-available',
      currentVersion: '0.16.0',
      lastChecked: '2026-04-22T17:00:00.000Z',
    })
  })

  it('error event emits error status with summarized message', () => {
    const { service, autoUpdater } = makeService()
    service.check('user')
    autoUpdater.emit('error', { code: 'ENOTFOUND' })
    expect(service.getStatus()).toEqual({
      phase: 'error',
      message: 'Offline or GitHub unreachable.',
      lastChecked: '2026-04-22T17:00:00.000Z',
    })
  })

  it('download-progress emits downloading with clamped numbers', () => {
    const { service, autoUpdater } = makeService()
    service.check('user')
    autoUpdater.emit('update-available', { version: '0.17.0' })
    autoUpdater.emit('download-progress', {
      percent: 42,
      bytesPerSecond: 2048,
    })
    expect(service.getStatus()).toEqual({
      phase: 'downloading',
      version: '0.17.0',
      percent: 42,
      bytesPerSecond: 2048,
    })
  })

  it('update-downloaded emits downloaded status', () => {
    const { service, autoUpdater } = makeService()
    service.check('user')
    autoUpdater.emit('update-available', { version: '0.17.0' })
    autoUpdater.emit('update-downloaded', { version: '0.17.0' })
    expect(service.getStatus()).toEqual({
      phase: 'downloaded',
      version: '0.17.0',
      releaseNotesUrl: 'https://example.test/v0.17.0',
    })
  })

  it('check() is idempotent while already checking', () => {
    const { service, autoUpdater } = makeService()
    service.check('user')
    service.check('user')
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('check() is a no-op while downloading', () => {
    const { service, autoUpdater } = makeService()
    service.check('user')
    autoUpdater.emit('update-available', { version: '0.17.0' })
    autoUpdater.emit('download-progress', { percent: 10, bytesPerSecond: 100 })
    service.check('user')
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('download() from non-available state emits error and does not start download', () => {
    const { service, autoUpdater } = makeService()
    service.download()
    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled()
    expect(service.getStatus().phase).toBe('error')
  })

  it('download() from available state calls downloadUpdate', () => {
    const { service, autoUpdater } = makeService()
    service.check('user')
    autoUpdater.emit('update-available', { version: '0.17.0' })
    service.download()
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('install() from non-downloaded state emits error', () => {
    const { service, autoUpdater } = makeService()
    service.install()
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    expect(service.getStatus().phase).toBe('error')
  })

  it('install() from downloaded state calls quitAndInstall with runAfter', () => {
    const { service, autoUpdater } = makeService()
    service.check('user')
    autoUpdater.emit('update-available', { version: '0.17.0' })
    autoUpdater.emit('update-downloaded', { version: '0.17.0' })
    service.install()
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('openReleaseNotes uses last known URL even after transitioning away', async () => {
    const { service, autoUpdater, openExternal } = makeService()
    service.check('user')
    autoUpdater.emit('update-available', { version: '0.17.0' })
    autoUpdater.emit('update-downloaded', { version: '0.17.0' })
    const ok = await service.openReleaseNotes()
    expect(ok).toBe(true)
    expect(openExternal).toHaveBeenCalledWith('https://example.test/v0.17.0')
  })

  it('openReleaseNotes returns false when no version is known', async () => {
    const { service, openExternal } = makeService()
    const ok = await service.openReleaseNotes()
    expect(ok).toBe(false)
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('dispose() removes every autoUpdater listener it registered', () => {
    const { service, autoUpdater } = makeService()
    const before = [
      'checking-for-update',
      'update-available',
      'update-not-available',
      'download-progress',
      'update-downloaded',
      'error',
    ].map((e) => autoUpdater.listenerCount(e))
    expect(before.every((n) => n === 1)).toBe(true)
    service.dispose()
    const after = before.map((_, i) =>
      autoUpdater.listenerCount(
        [
          'checking-for-update',
          'update-available',
          'update-not-available',
          'download-progress',
          'update-downloaded',
          'error',
        ][i],
      ),
    )
    expect(after.every((n) => n === 0)).toBe(true)
  })

  it('dispose() makes check()/download()/install() no-ops', () => {
    const { service, autoUpdater } = makeService()
    service.dispose()
    service.check('user')
    service.download()
    service.install()
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled()
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })
})
