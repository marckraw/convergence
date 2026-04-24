import type { AppSettingsService } from '../app-settings/app-settings.service'
import type { ProviderRegistry } from '../provider/provider-registry'
import type { SessionService } from '../session/session.service'
import { serializeConversationItems } from '../session/fork/session-fork.pure'
import type { InitiativeService } from './initiative.service'
import {
  buildInitiativeSynthesisPrompt,
  INITIATIVE_SYNTHESIS_RETRY_SUFFIX,
  parseAndValidateInitiativeSynthesis,
} from './initiative-synthesis.pure'
import type {
  InitiativeSynthesisAttemptContext,
  InitiativeSynthesisResult,
} from './initiative-synthesis.types'

export interface InitiativeSynthesisDeps {
  initiatives: InitiativeService
  sessions: SessionService
  providers: ProviderRegistry
  appSettings: AppSettingsService
}

export class InitiativeSynthesisError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'InitiativeSynthesisError'
  }
}

const INITIATIVE_SYNTHESIS_TIMEOUT_MS = 180_000

export class InitiativeSynthesisService {
  constructor(private readonly deps: InitiativeSynthesisDeps) {}

  async synthesize(
    initiativeId: string,
    requestId?: string,
  ): Promise<InitiativeSynthesisResult> {
    const initiative = this.deps.initiatives.getById(initiativeId)
    if (!initiative) throw new Error(`Initiative not found: ${initiativeId}`)

    const attempts = this.deps.initiatives.listAttempts(initiativeId)
    if (attempts.length === 0) {
      throw new InitiativeSynthesisError(
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
      throw new InitiativeSynthesisError(
        `No extraction model available for provider ${providerContext.provider.id}`,
      )
    }

    const outputs = this.deps.initiatives
      .listOutputs(initiativeId)
      .map((output) => ({
        kind: output.kind,
        label: output.label,
        value: output.value,
        status: output.status,
        sourceSessionId: output.sourceSessionId,
      }))

    const prompt = buildInitiativeSynthesisPrompt({
      initiative,
      attempts: contexts,
      outputs,
    })

    const firstRaw = await providerContext.provider.oneShot!({
      prompt,
      modelId,
      workingDirectory: providerContext.session.workingDirectory,
      timeoutMs: INITIATIVE_SYNTHESIS_TIMEOUT_MS,
      requestId,
    })
    const firstResult = parseAndValidateInitiativeSynthesis(firstRaw.text)
    if (firstResult.ok) return firstResult.value

    const retryRaw = await providerContext.provider.oneShot!({
      prompt: prompt + INITIATIVE_SYNTHESIS_RETRY_SUFFIX,
      modelId,
      workingDirectory: providerContext.session.workingDirectory,
      timeoutMs: INITIATIVE_SYNTHESIS_TIMEOUT_MS,
      requestId,
    })
    const retryResult = parseAndValidateInitiativeSynthesis(retryRaw.text)
    if (retryResult.ok) return retryResult.value

    throw new InitiativeSynthesisError(
      `Synthesis failed after retry: ${retryResult.error.message}`,
    )
  }

  private selectProviderContext(contexts: InitiativeSynthesisAttemptContext[]) {
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

    throw new InitiativeSynthesisError(
      'No configured provider supports one-shot synthesis',
    )
  }
}
