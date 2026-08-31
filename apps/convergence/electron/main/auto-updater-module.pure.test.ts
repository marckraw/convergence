import { describe, expect, it, vi } from 'vitest'
import { resolveAutoUpdater } from './auto-updater-module.pure'

function makeAutoUpdater() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => undefined),
    quitAndInstall: vi.fn(),
  }
}

describe('resolveAutoUpdater', () => {
  it('returns named autoUpdater export when present', () => {
    const autoUpdater = makeAutoUpdater()
    expect(resolveAutoUpdater({ autoUpdater })).toBe(autoUpdater)
  })

  it('returns default.autoUpdater when packaged import nests exports', () => {
    const autoUpdater = makeAutoUpdater()
    expect(resolveAutoUpdater({ default: { autoUpdater } })).toBe(autoUpdater)
  })

  it('returns the module itself when it already matches the updater shape', () => {
    const autoUpdater = makeAutoUpdater()
    expect(resolveAutoUpdater(autoUpdater)).toBe(autoUpdater)
  })

  it('returns null for invalid module shapes', () => {
    expect(resolveAutoUpdater({ autoUpdater: undefined })).toBeNull()
    expect(resolveAutoUpdater({ default: {} })).toBeNull()
    expect(resolveAutoUpdater(null)).toBeNull()
  })
})
