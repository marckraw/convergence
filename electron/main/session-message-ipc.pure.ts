import type { MidRunInputMode } from '../backend/provider/provider.types'
import type { SendMessageInput } from '../backend/session/session.service'
import type { InteractionResponse } from '../backend/session/conversation-item.types'
import type { SkillSelection } from '../backend/skills/skills.types'

export interface SendSessionMessageIpcInput {
  text: string
  attachmentIds?: string[]
  skillSelections?: SkillSelection[]
  deliveryMode?: string
  interactionResponse?: InteractionResponse
  contextItemIds?: string[]
  providerAccountId?: string | null
}

/**
 * Rebuilds the message explicitly rather than spreading, so a field added to
 * `SendMessageInput` fails a test instead of being silently dropped on the way
 * across the IPC boundary.
 */
export function sendSessionMessageInputFromIpc(
  input: SendSessionMessageIpcInput,
): SendMessageInput {
  return {
    text: input.text,
    attachmentIds: input.attachmentIds,
    skillSelections: input.skillSelections,
    deliveryMode: input.deliveryMode as MidRunInputMode | undefined,
    interactionResponse: input.interactionResponse,
    contextItemIds: input.contextItemIds,
    providerAccountId: input.providerAccountId,
  }
}
