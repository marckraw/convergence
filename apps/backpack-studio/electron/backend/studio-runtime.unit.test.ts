// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { deferred } from '@convergence/execution-host-client'
const fixtures = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  sent: vi.fn(),
  hydrate: vi.fn(async () => {}),
  handshake: vi.fn(),
}))
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/studio-test-record', on: vi.fn() },
  BrowserWindow: {
    getAllWindows: () => [
      { isDestroyed: () => false, webContents: { send: fixtures.sent } },
    ],
  },
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      fixtures.handlers.set(name, handler),
  },
}))
vi.mock('./config/studio-environment.service', () => ({
  loadStudioConfig: async () => ({
    ok: true,
    config: {
      daemonBaseUrl: 'https://live.example',
      daemonToken: 'fixture-only',
      daemonProject: '/project',
      providerId: 'claude',
    },
  }),
}))
vi.mock('./daemon/daemon-client', () => ({
  DaemonClient: class {
    handshake = fixtures.handshake
  },
}))
vi.mock('./conversation/conversation.service', () => ({
  ConversationService: class {
    hydrate = fixtures.hydrate
    list = () => [{ id: 'saved' }]
  },
}))

it('publishes the real handshake without gating the saved list — mutations: omit daemon IPC, await handshake before hydration', async () => {
  const held = deferred()
  fixtures.handshake.mockImplementation(async () => {
    await held.promise
    return {
      status: 'connected',
      providers: { claude: true },
      executionProtocolCapabilities: [],
      daemonVersion: 'live',
      apiVersion: '0',
      detail: null,
    }
  })
  const { registerStudioRuntime } = await import('./studio-runtime.service')
  await registerStudioRuntime()
  expect(await fixtures.handlers.get('studio:list-conversations')?.()).toEqual([
    { id: 'saved' },
  ])
  expect(fixtures.sent).not.toHaveBeenCalled()
  held.release()
  expect(await fixtures.handlers.get('studio:daemon-status')?.()).toMatchObject(
    {
      status: 'connected',
      endpointName: 'live.example',
      daemonVersion: 'live',
    },
  )
  expect(fixtures.sent).toHaveBeenCalledWith(
    'studio:daemon-status',
    expect.objectContaining({ endpointName: 'live.example' }),
  )
})
