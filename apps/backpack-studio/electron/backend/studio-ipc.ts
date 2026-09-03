import { BrowserWindow, ipcMain } from 'electron'
import type {
  ConversationEvent,
  ConversationSnapshot,
  ConversationSummary,
  DaemonStatusView,
  SendMessageOutcome,
  StartConversationOutcome,
  StudioStartup,
} from '../../src/shared/studio-api/studio-api.types'
import type { ConversationService } from './conversation/conversation.service'
import { STUDIO_CHANNELS } from './studio-channels'
import { readIpcString } from './studio-ipc.pure'

export interface StudioIpcDeps {
  /**
   * Resolves what the window should be told about startup: the configuration,
   * and the record once it has been read back off disk. It does NOT wait for
   * the daemon — that answer arrives later, on its own channel.
   */
  getStartup: () => Promise<StudioStartup>
  /**
   * Resolves when the record has been hydrated, so a conversation call never
   * answers about a service that has not read its own files yet.
   *
   * The list handler used to answer immediately, and the window asks for it in
   * parallel with startup — so on a slow disk the sidebar was told, honestly
   * and wrongly, that there were no conversations at all, and nothing arrived
   * afterwards to correct it.
   */
  whenRecordReady: () => Promise<void>
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
 * Five calls and two pushes — the list the run was given, and nothing else.
 * What crosses is what the window draws: no base URL, no token, no daemon
 * internals.
 *
 * Every argument is read through `readIpcString` rather than trusted. A channel
 * is a boundary the compiler does not cross, so the declared parameter type is
 * a description of what the renderer means to send, never a guarantee of what
 * arrived.
 */
export function registerStudioIpc(deps: StudioIpcDeps): void {
  ipcMain.handle(
    STUDIO_CHANNELS.getStartup,
    (): Promise<StudioStartup> => deps.getStartup(),
  )

  ipcMain.handle(
    STUDIO_CHANNELS.listConversations,
    async (): Promise<ConversationSummary[]> => {
      await deps.whenRecordReady()
      return deps.service?.list() ?? []
    },
  )

  ipcMain.handle(
    STUDIO_CHANNELS.getTranscript,
    async (
      _event,
      conversationId: unknown,
    ): Promise<ConversationSnapshot | null> => {
      const id = readIpcString(conversationId)
      if (id === null) return null
      await deps.whenRecordReady()
      return deps.service?.snapshot(id) ?? null
    },
  )

  ipcMain.handle(
    STUDIO_CHANNELS.startConversation,
    (_event, text: unknown): Promise<StartConversationOutcome> => {
      const sentence = readIpcString(text)
      if (sentence === null) {
        return Promise.resolve({
          kind: 'refused',
          conversationId: '',
          reason: MALFORMED,
        })
      }
      return deps.service
        ? deps.service.start(sentence)
        : Promise.resolve({
            kind: 'refused',
            conversationId: '',
            reason: UNCONFIGURED,
          })
    },
  )

  ipcMain.handle(
    STUDIO_CHANNELS.sendMessage,
    (
      _event,
      conversationId: unknown,
      text: unknown,
    ): Promise<SendMessageOutcome> => {
      const id = readIpcString(conversationId)
      const sentence = readIpcString(text)
      if (id === null || sentence === null) {
        return Promise.resolve({ kind: 'refused', reason: MALFORMED })
      }
      return deps.service
        ? deps.service.send(id, sentence)
        : Promise.resolve({ kind: 'refused', reason: UNCONFIGURED })
    },
  )
}

const UNCONFIGURED = 'Backpack Studio is not configured to reach a daemon yet.'
const MALFORMED = 'Backpack Studio could not read that request.'

/**
 * Pushes a snapshot to every open window.
 *
 * Sent to all of them rather than to the one that asked, because a conversation
 * belongs to the app rather than to a window: a second window showing a
 * transcript that stopped growing would be showing a stale truth.
 */
export function broadcastConversationEvent(event: ConversationEvent): void {
  broadcast(STUDIO_CHANNELS.conversationEvent, event)
}

/**
 * Pushes the daemon handshake to every open window, when it finally lands.
 *
 * A push rather than part of startup: the handshake is two network probes with
 * a fifteen-second cap each, and the window's whole reason to exist — the
 * conversations already on disk — does not depend on it. Waiting made a
 * black-holed host look like an app that would not open.
 */
export function broadcastDaemonStatus(daemon: DaemonStatusView): void {
  broadcast(STUDIO_CHANNELS.daemonStatus, daemon)
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    window.webContents.send(channel, payload)
  }
}
