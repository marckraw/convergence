import { ipcMain, shell } from 'electron'
import type { WebContents } from 'electron'
import type {
  BroadcastFn,
  ProviderDebugService,
} from './provider-debug.service'

const subscriptions = new Map<
  number,
  { sender: WebContents; sessionCounts: Map<string, number> }
>()

export const broadcastProviderDebug: BroadcastFn = (channel, payload) => {
  const sessionId =
    payload &&
    typeof payload === 'object' &&
    'sessionId' in payload &&
    typeof payload.sessionId === 'string'
      ? payload.sessionId
      : null
  if (!sessionId) return

  for (const { sender, sessionCounts } of subscriptions.values()) {
    if (!sender.isDestroyed() && sessionCounts.has(sessionId)) {
      sender.send(channel, payload)
    }
  }
}

function subscribe(sender: WebContents, sessionId: string): void {
  if (!sessionId) return
  let entry = subscriptions.get(sender.id)
  if (!entry) {
    entry = { sender, sessionCounts: new Map() }
    subscriptions.set(sender.id, entry)
    sender.once('destroyed', () => {
      if (subscriptions.get(sender.id)?.sender === sender) {
        subscriptions.delete(sender.id)
      }
    })
  }
  entry.sessionCounts.set(
    sessionId,
    (entry.sessionCounts.get(sessionId) ?? 0) + 1,
  )
}

function unsubscribe(sender: WebContents, sessionId: string): void {
  const entry = subscriptions.get(sender.id)
  if (!entry) return
  const nextCount = (entry.sessionCounts.get(sessionId) ?? 0) - 1
  if (nextCount > 0) {
    entry.sessionCounts.set(sessionId, nextCount)
    return
  }
  entry.sessionCounts.delete(sessionId)
  if (entry.sessionCounts.size === 0) subscriptions.delete(sender.id)
}

export interface ProviderDebugIpcDeps {
  service: ProviderDebugService
  logsDirectory: string | null
}

export function registerProviderDebugIpcHandlers(
  deps: ProviderDebugService | ProviderDebugIpcDeps,
): void {
  const service = 'service' in deps ? deps.service : deps
  const logsDirectory = 'service' in deps ? deps.logsDirectory : null

  ipcMain.handle('provider:debug:list', (_event, sessionId: string) =>
    service.list(sessionId),
  )

  ipcMain.on('provider:debug:subscribe', (event, sessionId: string) => {
    subscribe(event.sender, sessionId)
  })

  ipcMain.on('provider:debug:unsubscribe', (event, sessionId: string) => {
    unsubscribe(event.sender, sessionId)
  })

  ipcMain.handle('provider:debug:openFolder', () => {
    if (!logsDirectory) return false
    void shell.openPath(logsDirectory)
    return true
  })
}
