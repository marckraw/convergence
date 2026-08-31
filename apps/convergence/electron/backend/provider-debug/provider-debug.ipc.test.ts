import type { WebContents } from 'electron'
import { describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, sessionId: string) => void>(),
  handle: vi.fn(),
  openPath: vi.fn(),
  on: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: electronMocks.handle,
    on: (
      channel: string,
      handler: (event: unknown, sessionId: string) => void,
    ) => {
      electronMocks.on(channel, handler)
      electronMocks.handlers.set(channel, handler)
    },
  },
  shell: { openPath: electronMocks.openPath },
}))

import {
  broadcastProviderDebug,
  registerProviderDebugIpcHandlers,
} from './provider-debug.ipc'
import { ProviderDebugService } from './provider-debug.service'

describe('provider debug IPC', () => {
  it('broadcasts only matching events while a renderer is subscribed', () => {
    const service = new ProviderDebugService({ broadcast: vi.fn() })
    registerProviderDebugIpcHandlers(service)

    const sender = {
      id: 7,
      isDestroyed: vi.fn(() => false),
      once: vi.fn(),
      send: vi.fn(),
    } as unknown as WebContents
    const event = { sender }
    const subscribe = electronMocks.handlers.get('provider:debug:subscribe')
    const unsubscribe = electronMocks.handlers.get('provider:debug:unsubscribe')

    expect(subscribe).toBeDefined()
    expect(unsubscribe).toBeDefined()

    broadcastProviderDebug('provider:debug:event', { sessionId: 's1' })
    expect(sender.send).not.toHaveBeenCalled()

    subscribe?.(event, 's1')
    broadcastProviderDebug('provider:debug:event', { sessionId: 's2' })
    broadcastProviderDebug('provider:debug:event', { sessionId: 's1' })
    expect(sender.send).toHaveBeenCalledOnce()

    unsubscribe?.(event, 's1')
    broadcastProviderDebug('provider:debug:event', { sessionId: 's1' })
    expect(sender.send).toHaveBeenCalledOnce()
  })
})
