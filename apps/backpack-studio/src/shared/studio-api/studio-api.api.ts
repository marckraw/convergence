import type {
  ConversationEvent,
  ConversationSnapshot,
  ConversationSummary,
  SendMessageOutcome,
  StartConversationOutcome,
  StudioApi,
  StudioStartup,
} from './studio-api.types'

/**
 * The renderer's only door to the main process (MAR-2770).
 *
 * Every preload call goes through this file, so a component never touches
 * `window` and the boundary has exactly one place to be found, stubbed or
 * changed. The wrapper adds nothing of its own — no caching, no retries, no
 * shape-fixing — because a door that quietly repairs what it is handed hides
 * the defect from the side that can fix it.
 */
function bridge(): StudioApi {
  const api = window.backpackStudio
  if (!api) {
    throw new Error(
      'Backpack Studio: the preload bridge is missing. The window was opened without it.',
    )
  }
  return api
}

export function getStartup(): Promise<StudioStartup> {
  return bridge().getStartup()
}

export function listConversations(): Promise<ConversationSummary[]> {
  return bridge().listConversations()
}

export function startConversation(
  text: string,
): Promise<StartConversationOutcome> {
  return bridge().startConversation(text)
}

export function sendMessage(
  conversationId: string,
  text: string,
): Promise<SendMessageOutcome> {
  return bridge().sendMessage(conversationId, text)
}

export function getTranscript(
  conversationId: string,
): Promise<ConversationSnapshot | null> {
  return bridge().getTranscript(conversationId)
}

export function onConversationEvent(
  listener: (event: ConversationEvent) => void,
): () => void {
  return bridge().onConversationEvent(listener)
}
