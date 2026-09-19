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
  const resolveProject = vi.fn(async () => ({
    kind: 'resolved' as const,
    project: {
      id: 'project-1',
      name: 'convergence',
      url: 'https://linear.app/example/project/convergence-0a1b2c3d4e5f',
    },
  }))

  beforeEach(() => {
    electronMocks.handlers.clear()
    setKey.mockClear()
    resolveProject.mockClear()
    registerTrackerIpcHandlers({
      credentials: {
        status: async () => 'absent',
        setKey,
        deleteKey: async () => 'absent',
      },
      probe: async () => ({ ok: true, issues: 0, projectName: 'convergence' }),
      resolveProject,
      crewExists: (crewId) => crewId === 'crew-1',
      refresh: () => ({ outcome: 'reading', refreshableAt: null }),
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

  it('MAR-3156 R5: the lookup takes a crew id and a reference, and answers no key', async () => {
    const answer = await invoke<
      Promise<{ kind: string; project?: { id: string } }>
    >('tracker:resolveProject', 'crew-1', 'convergence')

    expect(resolveProject).toHaveBeenCalledWith('crew-1', 'convergence')
    // Mutation: hand the key back with the answer -> red here (and the door
    // would be the one place in this feature where a key leaves the main
    // process).
    expect(JSON.stringify(answer)).not.toContain('lin_api')
    expect(Object.keys(answer)).toEqual(['kind', 'project'])
  })
})
