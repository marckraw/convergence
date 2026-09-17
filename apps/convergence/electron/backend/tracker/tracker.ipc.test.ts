import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: never[]) => unknown>(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, ...args: never[]) => unknown,
    ) => {
      electronMocks.handlers.set(channel, handler)
    },
  },
}))

import { registerTrackerIpcHandlers } from './tracker.ipc'

function invoke<T>(channel: string, ...args: unknown[]): T {
  const handler = electronMocks.handlers.get(channel)
  if (!handler) throw new Error(`No handler registered for ${channel}`)
  return handler({}, ...(args as never[])) as T
}

describe('MAR-3084 lap 2, F: no key without an owner', () => {
  const setKey = vi.fn(async () => 'present' as const)

  beforeEach(() => {
    electronMocks.handlers.clear()
    setKey.mockClear()
    registerTrackerIpcHandlers({
      credentials: {
        status: async () => 'absent',
        setKey,
        deleteKey: async () => 'absent',
      },
      probe: async () => ({ ok: true, issues: 0 }),
      crewExists: (crewId) => crewId === 'crew-1',
    })
  })

  it('files a key under an existing crew', async () => {
    await expect(
      invoke<Promise<string>>(
        'tracker:setCredential',
        'crew-1',
        'lin_api_fixture',
      ),
    ).resolves.toBe('present')
    expect(setKey).toHaveBeenCalledWith('crew-1', 'lin_api_fixture')
  })

  it('refuses a key for a crew that does not exist, before the Keychain', async () => {
    // Mutation: drop the owner check -> the key is filed, red.
    await expect(
      invoke<Promise<string>>(
        'tracker:setCredential',
        'no-such-crew',
        'lin_api_fixture',
      ),
    ).rejects.toThrow('existing crew')
    expect(setKey).not.toHaveBeenCalled()
  })
})
