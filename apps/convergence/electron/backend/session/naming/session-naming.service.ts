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

  /**
   * @param options.providerAccountId the account this name is billed to
   * (MAR-2824 R5). Required rather than optional: a session carries no account
   * of its own, so the only way to get this right is for the caller — which
   * knows the session's last turn — to say it, and `null` for the ambient
   * login has to be a statement rather than an omission.
   */
  async generateName(
    session: SessionSummary,
    conversation: ConversationItem[],
    options: { requestId?: string; providerAccountId: string | null },
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
        // Naming spends the subscription the session's own turns ran on, never
        // whichever account the ambient login happens to hold (MAR-2824 R5).
        providerAccountId: options.providerAccountId,
      })
      return sanitizeTitle(result.text)
    } catch {
      return null
    }
  }
}
