// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { deferred } from '@convergence/execution-host-client'
import type { IpcMainInvokeEvent } from 'electron'
import type { ConversationService } from './conversation/conversation.service'
import { registerStudioIpc, broadcastDaemonStatus } from './studio-ipc'
import { registerStudioUpdates } from '../updates/updates.ipc'

const fake = vi.hoisted(() => ({
  handlers: new Map<
    string,
    (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
  >(),
  quit: [] as (() => void)[],
  owner: true,
  destroyed: false,
  send: vi.fn(),
}))
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    once: (_: string, handler: () => void) => fake.quit.push(handler),
  },
  BrowserWindow: {
    fromWebContents: () => (fake.owner ? {} : null),
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: { isDestroyed: () => fake.destroyed, send: fake.send },
      },
    ],
  },
  ipcMain: {
    handle: (
      name: string,
      fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
    ) => fake.handlers.set(name, fn),
    removeHandler: (name: string) => fake.handlers.delete(name),
  },
}))
vi.mock('electron-updater', () => ({ autoUpdater: {} }))
const channels = [
  'studio:get-startup',
  'studio:list-conversations',
  'studio:get-transcript',
  'studio:start-conversation',
  'studio:send-message',
  'studio:daemon-status',
]
const frame = {}
const ownedEvent = {
  senderFrame: frame,
  sender: { mainFrame: frame },
} as IpcMainInvokeEvent
const invoke = (name: string, ...args: unknown[]) =>
  Promise.resolve().then(() => fake.handlers.get(name)!(ownedEvent, ...args))
function setup(ready = Promise.resolve()) {
  const service = {
    list: vi.fn(() => [{ id: 'saved' }]),
    snapshot: vi.fn(() => ({ id: 'saved' })),
    start: vi.fn(async () => ({ kind: 'started', conversationId: 'new' })),
    send: vi.fn(async () => ({ kind: 'sent' })),
  }
  registerStudioIpc({
    service: service as unknown as ConversationService,
    getStartup: async () => ({ kind: 'misconfigured', missing: ['fixture'] }),
    getDaemonStatus: async () => null,
    whenRecordReady: () => ready,
  })
  return service
}
beforeEach(() => {
  fake.handlers.clear()
  fake.quit = []
  fake.owner = true
  fake.destroyed = false
  fake.send.mockClear()
})

it.each(channels)(
  'refuses a foreign frame on %s — mutation: drop owned from that handler',
  async (channel) => {
    setup()
    await expect(
      Promise.resolve().then(() =>
        fake.handlers.get(channel)!({
          ...ownedEvent,
          senderFrame: {},
        } as IpcMainInvokeEvent),
      ),
    ).rejects.toThrow('app window')
  },
)
it('shares ownership with updates and refuses an unowned main frame — mutation: remove fromWebContents check', async () => {
  setup()
  registerStudioUpdates()
  fake.owner = false
  for (const handler of fake.handlers.values()) {
    await expect(
      Promise.resolve().then(() => handler(ownedEvent)),
    ).rejects.toThrow('app window')
  }
})
it('removes every invoke on will-quit — mutation: omit Studio cleanup', () => {
  setup()
  registerStudioUpdates()
  for (const quit of fake.quit) quit()
  expect([...fake.handlers.keys()]).toEqual([])
})
it('registers the literal channels and forwards valid requests — mutations: wrong channel or wrong forwarded argument', async () => {
  const service = setup()
  expect([...fake.handlers.keys()].sort()).toEqual([...channels].sort())
  expect(fake.handlers.has('studio:startConversation')).toBe(false)
  expect(await invoke('studio:get-startup')).toEqual({
    kind: 'misconfigured',
    missing: ['fixture'],
  })
  expect(await invoke('studio:daemon-status')).toBe(null)
  expect(await invoke('studio:start-conversation', 'hello')).toEqual({
    kind: 'started',
    conversationId: 'new',
  })
  expect(service.start).toHaveBeenCalledWith('hello')
  expect(await invoke('studio:send-message', 'saved', 'again')).toEqual({
    kind: 'sent',
  })
  expect(service.send).toHaveBeenCalledWith('saved', 'again')
})
it.each(['studio:list-conversations', 'studio:get-transcript'])(
  'awaits the record at %s — mutation: omit readiness await',
  async (channel) => {
    const held = deferred()
    const service = setup(held.promise)
    const result = invoke(channel, 'saved')
    await new Promise((resolve) => setImmediate(resolve))
    const before =
      service.list.mock.calls.length + service.snapshot.mock.calls.length
    held.release()
    const value = await result
    expect(before).toBe(0)
    expect(value).toEqual(
      channel === 'studio:list-conversations'
        ? [{ id: 'saved' }]
        : { id: 'saved' },
    )
    if (channel === 'studio:get-transcript')
      expect(service.snapshot).toHaveBeenCalledWith('saved')
  },
)
it.each([
  [42, 'text'],
  ['saved', 42],
])(
  'refuses malformed send arguments %j %j — mutation: bypass the corresponding readIpcString',
  async (id, text) => {
    const service = setup()
    expect(await invoke('studio:send-message', id, text)).toMatchObject({
      kind: 'refused',
    })
    expect(service.send).not.toHaveBeenCalled()
  },
)
it('refuses malformed start and transcript arguments — mutation: bypass readIpcString', async () => {
  const service = setup()
  expect(await invoke('studio:start-conversation', {})).toMatchObject({
    kind: 'refused',
  })
  expect(await invoke('studio:get-transcript', {})).toBe(null)
  expect(service.start).not.toHaveBeenCalled()
  expect(service.snapshot).not.toHaveBeenCalled()
})
it.each(['', ' \n '])(
  'refuses empty sentences %j at both send doors — mutation: remove trim guard',
  async (text) => {
    const service = setup()
    expect(await invoke('studio:start-conversation', text)).toMatchObject({
      kind: 'refused',
    })
    expect(await invoke('studio:send-message', 'saved', text)).toMatchObject({
      kind: 'refused',
    })
    expect(service.start).not.toHaveBeenCalled()
    expect(service.send).not.toHaveBeenCalled()
  },
)
it('skips destroyed webContents — mutation: remove webContents.isDestroyed guard', () => {
  fake.destroyed = true
  broadcastDaemonStatus({} as Parameters<typeof broadcastDaemonStatus>[0])
  expect(fake.send).not.toHaveBeenCalled()
})
