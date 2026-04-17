import type { ProviderRegistry } from '../../provider/provider-registry'
import type { AppSettingsService } from '../../app-settings/app-settings.service'
import type { Session } from '../session.types'
import { buildNamingPrompt, sanitizeTitle } from './session-naming.pure'

export interface SessionNamingDeps {
  providers: ProviderRegistry
  appSettings: AppSettingsService
}

export class SessionNamingService {
  constructor(private readonly deps: SessionNamingDeps) {}

  async generateName(session: Session): Promise<string | null> {
    const provider = this.deps.providers.get(session.providerId)
    if (!provider || !provider.oneShot) return null

    const firstUser = session.transcript.find((entry) => entry.type === 'user')
    const firstAssistant = session.transcript.find(
      (entry) => entry.type === 'assistant',
    )
    if (!firstUser || !firstAssistant) return null

    const userText = firstUser.type === 'user' ? firstUser.text : ''
    const assistantText =
      firstAssistant.type === 'assistant' ? firstAssistant.text : ''
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
      })
      return sanitizeTitle(result.text)
    } catch {
      return null
    }
  }
}
