/**
 * The IPC channel names, in one module both sides import (MAR-2770).
 *
 * Its own file, with no imports at all, because the preload needs these names
 * and must not reach the handlers that use them: `studio-ipc.ts` imports
 * `ipcMain` and `BrowserWindow`, neither of which exists in a preload, and a
 * bundler that ever stopped tree-shaking that away would put main-process code
 * in the bridge.
 *
 * A channel is a string on both sides of a boundary the compiler does not
 * cross. Naming it twice is naming it wrong once, eventually.
 */
export const STUDIO_CHANNELS = {
  getStartup: 'studio:get-startup',
  listConversations: 'studio:list-conversations',
  startConversation: 'studio:start-conversation',
  sendMessage: 'studio:send-message',
  getTranscript: 'studio:get-transcript',
  conversationEvent: 'studio:conversation-event',
  daemonStatus: 'studio:daemon-status',
} as const
