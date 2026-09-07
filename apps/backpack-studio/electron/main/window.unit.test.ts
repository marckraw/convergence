// @vitest-environment node
import { expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  options: undefined as Record<string, number> | undefined,
}))
vi.mock('electron', () => ({
  app: { whenReady: () => Promise.resolve(), on: vi.fn() },
  BrowserWindow: class {
    constructor(options: Record<string, number>) {
      mocks.options = options
    }
    loadURL = vi.fn()
    loadFile = vi.fn()
  },
}))
vi.mock('../updates/updates.ipc', () => ({ registerStudioUpdates: vi.fn() }))

it('actual BrowserWindow stays above stacking breakpoints — mutation: remove minima or restore 1000×700 default', async () => {
  await import('./index')
  await Promise.resolve()
  expect(mocks.options?.minWidth).toBeGreaterThanOrEqual(650 + 490 + 2 * 70)
  expect(mocks.options?.minWidth).toBeGreaterThan(1100)
  expect(mocks.options?.minHeight).toBeGreaterThanOrEqual(920)
  expect(mocks.options?.width).toBeGreaterThan(
    mocks.options?.minWidth ?? Infinity,
  )
  expect(mocks.options?.height).toBeGreaterThan(
    mocks.options?.minHeight ?? Infinity,
  )
})
