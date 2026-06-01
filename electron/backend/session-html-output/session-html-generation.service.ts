import { randomUUID } from 'crypto'
import type { ProviderRegistry } from '../provider/provider-registry'
import type { ConversationItem } from '../session/conversation-item.types'
import type { SessionSummary } from '../session/session.types'
import type { SessionHtmlOutputService } from './session-html-output.service'
import type { SessionHtmlOutput } from './session-html-output.types'
import {
  buildSessionHtmlGenerationPrompt,
  normalizeGeneratedHtml,
} from './session-html-generation.pure'

export interface SessionHtmlGenerationDeps {
  providers: ProviderRegistry
  outputs: Pick<
    SessionHtmlOutputService,
    | 'saveHtml'
    | 'recordPending'
    | 'recordFailure'
    | 'listForSession'
    | 'readHtml'
  >
}

export interface SessionHtmlGenerationResult {
  snapshot: SessionHtmlOutput
  living: SessionHtmlOutput | null
}

export class SessionHtmlGenerationService {
  constructor(private readonly deps: SessionHtmlGenerationDeps) {}

  async generateForAssistantItem(input: {
    session: SessionSummary
    conversation: ConversationItem[]
    sourceItem: ConversationItem
  }): Promise<SessionHtmlGenerationResult> {
    const sourceItem = input.sourceItem
    if (
      sourceItem.kind !== 'message' ||
      sourceItem.actor !== 'assistant' ||
      sourceItem.state !== 'complete'
    ) {
      throw new Error('HTML generation requires a completed assistant message')
    }

    const provider = this.deps.providers.get(input.session.providerId)
    const snapshotRelativePath = `snapshots/turn-${sourceItem.sequence}.html`
    const pendingSnapshot = this.deps.outputs.recordPending({
      sessionId: input.session.id,
      sourceItemId: sourceItem.id,
      kind: 'snapshot',
      relativePath: snapshotRelativePath,
    })

    if (!provider?.oneShot) {
      return {
        snapshot: this.deps.outputs.recordFailure({
          sessionId: input.session.id,
          sourceItemId: sourceItem.id,
          kind: 'snapshot',
          error: `Provider ${input.session.providerId} does not support one-shot HTML generation`,
        }),
        living: this.getCurrentLivingOutput(input.session.id),
      }
    }

    const currentLivingHtml = await this.readCurrentLivingHtml(input.session.id)
    let generatedHtml: string

    try {
      const descriptor = await provider.describe()
      const modelId = input.session.model ?? descriptor.defaultModelId
      if (!modelId) {
        return {
          snapshot: this.deps.outputs.recordFailure({
            sessionId: input.session.id,
            sourceItemId: sourceItem.id,
            kind: 'snapshot',
            error: `No model available for provider ${input.session.providerId}`,
          }),
          living: this.getCurrentLivingOutput(input.session.id),
        }
      }

      const result = await provider.oneShot({
        prompt: buildSessionHtmlGenerationPrompt({
          session: input.session,
          conversation: input.conversation,
          sourceItem: sourceItem as Extract<
            ConversationItem,
            { kind: 'message' }
          > & { actor: 'assistant' },
          currentLivingHtml,
        }),
        modelId,
        workingDirectory: input.session.workingDirectory,
        timeoutMs: 180_000,
        requestId: randomUUID(),
        permissionConfig: input.session.permissionConfig,
      })

      generatedHtml = normalizeGeneratedHtml(result.text)
    } catch (error) {
      return {
        snapshot: this.deps.outputs.recordFailure({
          sessionId: input.session.id,
          sourceItemId: sourceItem.id,
          kind: 'snapshot',
          error: error instanceof Error ? error.message : String(error),
        }),
        living: this.getCurrentLivingOutput(input.session.id),
      }
    }

    const snapshot = await this.deps.outputs.saveHtml({
      sessionId: input.session.id,
      sourceItemId: sourceItem.id,
      kind: 'snapshot',
      relativePath: pendingSnapshot.relativePath ?? snapshotRelativePath,
      html: generatedHtml,
    })
    const living = await this.deps.outputs.saveHtml({
      sessionId: input.session.id,
      sourceItemId: sourceItem.id,
      kind: 'living',
      relativePath: 'index.html',
      html: generatedHtml,
    })

    return { snapshot, living }
  }

  private getCurrentLivingOutput(sessionId: string): SessionHtmlOutput | null {
    return (
      this.deps.outputs
        .listForSession(sessionId)
        .find(
          (output) => output.kind === 'living' && output.status === 'ready',
        ) ?? null
    )
  }

  private async readCurrentLivingHtml(
    sessionId: string,
  ): Promise<string | null> {
    const output = this.getCurrentLivingOutput(sessionId)
    if (!output) return null

    try {
      return await this.deps.outputs.readHtml(output.id)
    } catch {
      return null
    }
  }
}
