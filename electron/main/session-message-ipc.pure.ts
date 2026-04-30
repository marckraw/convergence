import type { MidRunInputMode } from '../backend/provider/provider.types'
import type { SendMessageInput } from '../backend/session/session.service'
import type { SkillSelection } from '../backend/skills/skills.types'

export interface SendSessionMessageIpcInput {
  text: string
  attachmentIds?: string[]
  skillSelections?: SkillSelection[]
  deliveryMode?: string
  contextItemIds?: string[]
}

export function sendSessionMessageInputFromIpc(
  input: SendSessionMessageIpcInput,
): SendMessageInput {
  return {
    text: input.text,
    attachmentIds: input.attachmentIds,
    skillSelections: input.skillSelections,
    deliveryMode: input.deliveryMode as MidRunInputMode | undefined,
    contextItemIds: input.contextItemIds,
  }
}
