import type { AppSettingsService } from '../app-settings/app-settings.service'
import type { ProviderRegistry } from '../provider/provider-registry'
import type { SessionService } from '../session/session.service'
import { serializeConversationItems } from '../session/fork/session-fork.pure'
import type { SpaceService } from './space.service'
import {
  buildSpaceSynthesisPrompt,
  INITIATIVE_SYNTHESIS_RETRY_SUFFIX,
  parseAndValidateSpaceSynthesis,
} from './space-synthesis.pure'
import type {
  SpaceSynthesisAttemptContext,
  SpaceSynthesisResult,
} from './space-synthesis.types'

export interface SpaceSynthesisDeps {
  spaces: SpaceService
  sessions: SessionService
  providers: ProviderRegistry
  appSettings: AppSettingsService
}

export class SpaceSynthesisError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'SpaceSynthesisError'
  }
}

const INITIATIVE_SYNTHESIS_TIMEOUT_MS = 180_000

export class SpaceSynthesisService {
  constructor(private readonly deps: SpaceSynthesisDeps) {}

  async synthesize(
    spaceId: string,
    requestId?: string,
  ): Promise<SpaceSynthesisResult> {
    const space = this.deps.spaces.getById(spaceId)
    if (!space) throw new Error(`Space not found: ${spaceId}`)

    const attempts = this.deps.spaces.listAttempts(spaceId)
    if (attempts.length === 0) {
      throw new SpaceSynthesisError(
        'Synthesis needs at least one linked Attempt',
      )
    }

    const contexts = attempts.flatMap((attempt) => {
      const session = this.deps.sessions.getSummaryById(attempt.sessionId)
      if (!session || session.providerId === 'shell') return []
      return [
        {
          attempt,
          session,
          transcript: serializeConversationItems(
            this.deps.sessions.getConversation(session.id),
          ),
        },
      ]
    })

    const providerContext = this.selectProviderContext(contexts)
    const modelId = await this.deps.appSettings.resolveExtractionModel(
      providerContext.provider.id,
    )
    if (!modelId) {
      throw new SpaceSynthesisError(
        `No extraction model available for provider ${providerContext.provider.id}`,
      )
    }

    const artifacts = this.deps.spaces
      .listArtifacts(spaceId)
      .map((artifact) => ({
        kind: artifact.kind,
        label: artifact.label,
        value: artifact.value,
        status: artifact.status,
        sourceSessionId: artifact.sourceSessionId,
      }))

    const prompt = buildSpaceSynthesisPrompt({
      space,
      attempts: contexts,
      artifacts,
    })

    const firstRaw = await providerContext.provider.oneShot!({
      prompt,
      modelId,
      workingDirectory: providerContext.session.workingDirectory,
      timeoutMs: INITIATIVE_SYNTHESIS_TIMEOUT_MS,
      requestId,
    })
    const firstResult = parseAndValidateSpaceSynthesis(firstRaw.text)
    if (firstResult.ok) return firstResult.value

    const retryRaw = await providerContext.provider.oneShot!({
      prompt: prompt + INITIATIVE_SYNTHESIS_RETRY_SUFFIX,
      modelId,
      workingDirectory: providerContext.session.workingDirectory,
      timeoutMs: INITIATIVE_SYNTHESIS_TIMEOUT_MS,
      requestId,
    })
    const retryResult = parseAndValidateSpaceSynthesis(retryRaw.text)
    if (retryResult.ok) return retryResult.value

    throw new SpaceSynthesisError(
      `Synthesis failed after retry: ${retryResult.error.message}`,
    )
  }

  private selectProviderContext(contexts: SpaceSynthesisAttemptContext[]) {
    const candidates = [...contexts].sort((a, b) => {
      if (a.attempt.isPrimary === b.attempt.isPrimary) return 0
      return a.attempt.isPrimary ? -1 : 1
    })

    // Prefer the provider that created the Attempt when it is currently
    // available. If that provider is unavailable, use any configured provider
    // with one-shot support to synthesize over the linked Attempt context.
    for (const context of candidates) {
      const provider = this.deps.providers.get(context.session.providerId)
      if (provider?.oneShot) {
        return { ...context, provider }
      }
    }

    const fallbackProvider = this.deps.providers
      .getAll()
      .find((provider) => provider.oneShot)
    const fallbackContext = candidates[0]
    if (fallbackProvider && fallbackContext) {
      return { ...fallbackContext, provider: fallbackProvider }
    }

    throw new SpaceSynthesisError(
      'No configured provider supports one-shot synthesis',
    )
  }
}
