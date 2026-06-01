import { randomUUID } from 'crypto'
import type { ProviderRegistry } from '../../provider/provider-registry'
import type { AppSettingsService } from '../../app-settings/app-settings.service'
import type { ConversationItem } from '../conversation-item.types'
import type { SessionSummary } from '../session.types'
import {
  buildNamingPrompt,
  isAssistantMessageItem,
  isUserMessageItem,
  sanitizeTitle,
} from './session-naming.pure'

export interface SessionNamingDeps {
  providers: ProviderRegistry
  appSettings: AppSettingsService
}

export class SessionNamingService {
  constructor(private readonly deps: SessionNamingDeps) {}

  async generateName(
    session: SessionSummary,
    conversation: ConversationItem[],
    options: { requestId?: string } = {},
  ): Promise<string | null> {
    if (session.providerId === 'shell') return null
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
        requestId: options.requestId ?? randomUUID(),
        permissionConfig: session.permissionConfig,
      })
      return sanitizeTitle(result.text)
    } catch {
      return null
    }
  }
}
