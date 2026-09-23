import { afterEach, expect, it, vi } from 'vitest'
import { ipcMain } from 'electron'
import { registerReleaseIpcHandlers } from './release.ipc'
import { releaseBench, seat } from './release-act.fixture'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
afterEach(() => vi.clearAllMocks())

it('MAR-3087 R5 release:merge refuses a horse through the real service boundary', async () => {
  const b = releaseBench()
  try {
    registerReleaseIpcHandlers(b.service)
    const handler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([channel]) => channel === 'release:merge')![1]
    await expect(
      handler({} as never, {
        ...seat,
        sessionId: 'horse',
        planId: 'forged',
        issueIds: ['issue-1'],
      }),
    ).rejects.toThrow('Only the mastermind')
    expect(b.gh).not.toHaveBeenCalled()
    expect(
      vi.mocked(ipcMain.handle).mock.calls.map(([channel]) => channel),
    ).toEqual(['release:plan', 'release:merge', 'release:acts'])
  } finally {
    b.db.close()
  }
})
