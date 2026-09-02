import { BrowserWindow, ipcMain } from 'electron'
import type {
  ConversationEvent,
  ConversationSnapshot,
  ConversationSummary,
  SendMessageOutcome,
  StartConversationOutcome,
  StudioStartup,
} from '../../src/shared/studio-api/studio-api.types'
import type { ConversationService } from './conversation/conversation.service'
import { STUDIO_CHANNELS } from './studio-channels'

export interface StudioIpcDeps {
  /**
   * Resolves what the window should be told about startup. Asynchronous
   * because the handshake is a network round trip, and memoised by the caller
   * so opening a second window does not probe the daemon again.
   */
  getStartup: () => Promise<StudioStartup>
  /**
   * The service, or null when Studio is misconfigured and there is nothing to
   * talk to. Every conversation call answers honestly in that state rather
   * than throwing across the boundary.
   */
  service: ConversationService | null
}

/**
 * Registers Studio's whole main-process surface.
 *
 * Five calls and one push — the list the run was given, and nothing else. What
 * crosses is what the window draws: no base URL, no token, no daemon internals.
 */
export function registerStudioIpc(deps: StudioIpcDeps): void {
  ipcMain.handle(
    STUDIO_CHANNELS.getStartup,
    (): Promise<StudioStartup> => deps.getStartup(),
  )

  ipcMain.handle(
    STUDIO_CHANNELS.listConversations,
    (): ConversationSummary[] => deps.service?.list() ?? [],
  )

  ipcMain.handle(
    STUDIO_CHANNELS.getTranscript,
    (_event, conversationId: string): ConversationSnapshot | null =>
      deps.service?.snapshot(conversationId) ?? null,
  )

  ipcMain.handle(
    STUDIO_CHANNELS.startConversation,
    (_event, text: string): Promise<StartConversationOutcome> =>
      deps.service
        ? deps.service.start(text)
        : Promise.resolve({
            kind: 'refused',
            conversationId: '',
            reason: UNCONFIGURED,
          }),
  )

  ipcMain.handle(
    STUDIO_CHANNELS.sendMessage,
    (
      _event,
      conversationId: string,
      text: string,
    ): Promise<SendMessageOutcome> =>
      deps.service
        ? deps.service.send(conversationId, text)
        : Promise.resolve({ kind: 'refused', reason: UNCONFIGURED }),
  )
}

const UNCONFIGURED = 'Backpack Studio is not configured to reach a daemon yet.'

/**
 * Pushes a snapshot to every open window.
 *
 * Sent to all of them rather than to the one that asked, because a conversation
 * belongs to the app rather than to a window: a second window showing a
 * transcript that stopped growing would be showing a stale truth.
 */
export function broadcastConversationEvent(event: ConversationEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    window.webContents.send(STUDIO_CHANNELS.conversationEvent, event)
  }
}
