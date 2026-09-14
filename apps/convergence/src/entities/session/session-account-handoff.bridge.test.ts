import { expect, it, vi } from 'vitest'
import { useSessionStore } from './session.model'

const wire = vi.hoisted(() => ({ invoke: vi.fn(), api: undefined as unknown }))
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: unknown) => {
      wire.api = api
    },
  },
  ipcRenderer: {
    invoke: wire.invoke,
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    send: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  nativeTheme: { prefersReducedTransparency: false },
}))

it('keeps a typed refusal through the real preload, API and store without a toast error', async () => {
  await import('../../../electron/preload/index')
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: wire.api,
  })
  const refusal = {
    accepted: false,
    stage: 'source-busy',
    message: 'Other source work is still running.',
  }
  wire.invoke.mockResolvedValueOnce(refusal)
  const request = {
    sessionId: 'session-1',
    text: 'saved draft',
    providerAccountId: 'account-b',
    attachmentIds: ['attachment-1'],
  }
  await expect(
    useSessionStore.getState().sendMessageToSession(request),
  ).resolves.toBe(false)
  expect(wire.invoke).toHaveBeenCalledWith(
    'session:sendMessage',
    'session-1',
    expect.objectContaining({
      text: 'saved draft',
      providerAccountId: 'account-b',
      attachmentIds: ['attachment-1'],
    }),
  )
  expect(
    useSessionStore.getState().accountHandoffRefusals['session-1'],
  ).toEqual(refusal)
  expect(useSessionStore.getState().error).toBeNull()
  wire.invoke.mockResolvedValueOnce({ accepted: true })
  await expect(
    useSessionStore.getState().sendMessageToSession(request),
  ).resolves.toBe(true)
  expect(
    useSessionStore.getState().accountHandoffRefusals['session-1'],
  ).toBeUndefined()
})
