import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { STUDIO_CHANNELS } from '../backend/studio-channels'
import type {
  ConversationEvent,
  ConversationSnapshot,
  ConversationSummary,
  SendMessageOutcome,
  StartConversationOutcome,
  StudioApi,
  StudioStartup,
} from '../../src/shared/studio-api/studio-api.types'

/**
 * The bridge (MAR-2770).
 *
 * It forwards and nothing more: no state, no caching, no defaults filled in on
 * the way past. Everything the window is allowed to know goes through here, and
 * the shape is the shared `StudioApi` rather than a second description of it —
 * so a channel the main process stopped answering is a type error here rather
 * than an undefined at runtime.
 *
 * The daemon's URL and token have no member on this object, by construction:
 * they exist only in the main process (constitution law 6).
 */
const api: StudioApi = {
  platform: process.platform,
  getStartup: (): Promise<StudioStartup> =>
    ipcRenderer.invoke(STUDIO_CHANNELS.getStartup) as Promise<StudioStartup>,
  listConversations: (): Promise<ConversationSummary[]> =>
    ipcRenderer.invoke(STUDIO_CHANNELS.listConversations) as Promise<
      ConversationSummary[]
    >,
  startConversation: (text: string): Promise<StartConversationOutcome> =>
    ipcRenderer.invoke(
      STUDIO_CHANNELS.startConversation,
      text,
    ) as Promise<StartConversationOutcome>,
  sendMessage: (
    conversationId: string,
    text: string,
  ): Promise<SendMessageOutcome> =>
    ipcRenderer.invoke(
      STUDIO_CHANNELS.sendMessage,
      conversationId,
      text,
    ) as Promise<SendMessageOutcome>,
  getTranscript: (
    conversationId: string,
  ): Promise<ConversationSnapshot | null> =>
    ipcRenderer.invoke(
      STUDIO_CHANNELS.getTranscript,
      conversationId,
    ) as Promise<ConversationSnapshot | null>,
  onConversationEvent: (listener) => {
    const forward = (_event: IpcRendererEvent, payload: ConversationEvent) => {
      listener(payload)
    }
    ipcRenderer.on(STUDIO_CHANNELS.conversationEvent, forward)
    // The unsubscribe is returned rather than assumed: React mounts an effect
    // twice in development, and a listener added twice with no way to remove
    // one of them delivers every snapshot twice.
    return () => {
      ipcRenderer.off(STUDIO_CHANNELS.conversationEvent, forward)
    }
  },
}

contextBridge.exposeInMainWorld('backpackStudio', api)
