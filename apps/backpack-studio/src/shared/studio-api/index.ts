/** The studio-api shared slice's public surface (MAR-2770). */
export {
  getStartup,
  getTranscript,
  listConversations,
  onConversationEvent,
  onDaemonStatus,
  sendMessage,
  startConversation,
} from './studio-api.api'
export type {
  ConversationEvent,
  ConversationSnapshot,
  ConversationStatus,
  ConversationSummary,
  DaemonStatusView,
  SendMessageOutcome,
  StartConversationOutcome,
  StudioApi,
  StudioStartup,
  TranscriptItem,
  TranscriptItemKind,
} from './studio-api.types'
