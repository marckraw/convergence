// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { resolveStudioWindowSize } from './window-options.config'

const mocks = vi.hoisted(() => ({
  options: undefined as Record<string, number> | undefined,
}))
vi.mock('electron', () => ({
  app: { whenReady: () => Promise.resolve(), on: vi.fn() },
  screen: {
    getPrimaryDisplay: () => ({ workAreaSize: { width: 1440, height: 860 } }),
  },
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
  expect(mocks.options?.minHeight).toBe(800)
  expect(mocks.options?.height).toBe(860)
  expect(mocks.options?.width).toBeGreaterThan(
    mocks.options?.minWidth ?? Infinity,
  )
  expect(mocks.options?.height).toBeGreaterThan(
    mocks.options?.minHeight ?? Infinity,
  )
})

it.each([
  [
    { width: 1440, height: 860 },
    { width: 1440, height: 860, minWidth: 1280, minHeight: 800 },
  ],
  [
    { width: 1366, height: 860 },
    { width: 1366, height: 860, minWidth: 1280, minHeight: 800 },
  ],
  [
    { width: 2560, height: 1440 },
    { width: 1440, height: 960, minWidth: 1280, minHeight: 800 },
  ],
])(
  'fits work area %j — mutation: drop the clamp or restore the 920px minimum',
  (workArea, expected) => {
    expect(resolveStudioWindowSize(workArea)).toEqual(expected)
  },
)
