// @vitest-environment node
import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { createStudioUpdater } from './updates.service'

function setup() {
  vi.useFakeTimers()
  const driver = Object.assign(new EventEmitter(), {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    checkForUpdates: vi.fn().mockResolvedValue(null),
    downloadUpdate: vi.fn().mockResolvedValue([]),
    quitAndInstall: vi.fn(),
  })
  const publish = vi.fn()
  return { driver, publish, updater: createStudioUpdater(driver, publish) }
}
afterEach(() => vi.useRealTimers())

it('checks on launch and every four hours — mutation: remove either scheduled check', async () => {
  const { driver, updater } = setup()
  await vi.advanceTimersByTimeAsync(10_000)
  expect(driver.checkForUpdates).toHaveBeenCalledTimes(1)
  driver.emit('update-not-available')
  await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
  expect(driver.checkForUpdates).toHaveBeenCalledTimes(2)
  updater.dispose()
  await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
  expect(driver.checkForUpdates).toHaveBeenCalledTimes(2)
})
it('requires download and restart consent — mutation: enable automatic download/install or bypass state guards', async () => {
  const { driver, updater, publish } = setup()
  expect([driver.autoDownload, driver.autoInstallOnAppQuit]).toEqual([
    false,
    false,
  ])
  await updater.download()
  updater.install()
  expect([
    driver.downloadUpdate.mock.calls.length,
    driver.quitAndInstall.mock.calls.length,
  ]).toEqual([0, 0])
  driver.emit('update-available', { version: '0.2.0' })
  expect(publish).toHaveBeenLastCalledWith({
    status: 'available',
    version: '0.2.0',
  })
  await updater.download()
  expect(driver.downloadUpdate).toHaveBeenCalledTimes(1)
  expect(updater.getState().status).toBe('downloading')
  driver.emit('update-downloaded', { version: '0.2.0' })
  expect(updater.getState()).toEqual({ status: 'downloaded', version: '0.2.0' })
  await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000 + 10_000)
  expect(driver.checkForUpdates).not.toHaveBeenCalled()
  updater.install()
  expect(driver.quitAndInstall).toHaveBeenCalledWith(false, true)
  updater.dispose()
  expect(driver.eventNames()).toEqual([])
  expect(vi.getTimerCount()).toBe(0)
})
it('failed checks become an honest error and can retry — mutation: swallow rejection or keep checking', async () => {
  const { driver, updater } = setup()
  driver.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
  await updater.check()
  expect(updater.getState()).toEqual({ status: 'error' })
  await updater.check()
  expect(driver.checkForUpdates).toHaveBeenCalledTimes(2)
  updater.dispose()
})
