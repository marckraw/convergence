import { randomUUID } from 'crypto'
import type { ProviderRegistry } from '../../provider/provider-registry'
import type { AppSettingsService } from '../../app-settings/app-settings.service'
import type { ConversationItem } from '../conversation-item.types'
import type { SessionSummary } from '../session.types'
import { buildNamingPrompt, sanitizeTitle } from './session-naming.pure'

export interface SessionNamingDeps {
  providers: ProviderRegistry
  appSettings: AppSettingsService
}

type UserMessageItem = ConversationItem & {
  kind: 'message'
  actor: 'user'
  text: string
}
type AssistantMessageItem = ConversationItem & {
  kind: 'message'
  actor: 'assistant'
  text: string
}

function isUserMessageItem(item: ConversationItem): item is UserMessageItem {
  return item.kind === 'message' && item.actor === 'user'
}

function isAssistantMessageItem(
  item: ConversationItem,
): item is AssistantMessageItem {
  return item.kind === 'message' && item.actor === 'assistant'
}

export class SessionNamingService {
  constructor(private readonly deps: SessionNamingDeps) {}

  async generateName(
    session: SessionSummary,
    conversation: ConversationItem[],
  ): Promise<string | null> {
    const provider = this.deps.providers.get(session.providerId)
    if (!provider || !provider.oneShot) return null

    const firstUser = conversation.find(isUserMessageItem)
    const firstAssistant = conversation.find(isAssistantMessageItem)
    if (!firstUser || !firstAssistant) return null

    const userText = firstUser.text
    const assistantText = firstAssistant.text
    if (!userText || !assistantText) return null

    const modelId = await this.deps.appSettings.resolveNamingModel(
      session.providerId,
    )
    if (!modelId) return null

    const prompt = buildNamingPrompt({
      firstUserMessage: userText,
      firstAssistantResponse: assistantText,
    })

    try {
      const result = await provider.oneShot({
        prompt,
        modelId,
        workingDirectory: session.workingDirectory,
        requestId: randomUUID(),
      })
      return sanitizeTitle(result.text)
    } catch {
      return null
    }
  }
}
