// @vitest-environment node
import { expect, it, vi } from 'vitest'
import type { StudioApi } from '../../src/shared/api/studio-api.types'
const fixture = vi.hoisted(() => ({
  api: undefined as StudioApi | undefined,
  invoke: vi.fn(async () => null),
  on: vi.fn(),
  off: vi.fn(),
}))
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: StudioApi) => {
      fixture.api = api
    },
  },
  ipcRenderer: {
    invoke: fixture.invoke,
    on: fixture.on,
    off: fixture.off,
    removeListener: fixture.off,
  },
}))
it('preload carries the conversation and daemon doors and removes its listeners — mutations: wrong invoke channel or detach off', async () => {
  await import('./index')
  const api = fixture.api!
  await api.getDaemonStatus()
  await api.startConversation('first')
  await api.sendMessage('c-1', 'next')
  await api.getTranscript('c-1')
  await api.listConversations()
  await api.getStartup()
  expect(fixture.invoke.mock.calls).toEqual([
    ['studio:daemon-status'],
    ['studio:start-conversation', 'first'],
    ['studio:send-message', 'c-1', 'next'],
    ['studio:get-transcript', 'c-1'],
    ['studio:list-conversations'],
    ['studio:get-startup'],
  ])
  const listener = vi.fn()
  const stop = api.onConversationEvent(listener)
  const [channel, forward] = fixture.on.mock.calls.at(-1)!
  forward({}, { conversationId: 'c-1' })
  expect(listener).toHaveBeenCalledWith({ conversationId: 'c-1' })
  stop()
  expect(fixture.off).toHaveBeenCalledWith(channel, forward)
})
