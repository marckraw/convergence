import type { ProviderRegistry } from '../../provider/provider-registry'
import type { AppSettingsService } from '../../app-settings/app-settings.service'
import type { WorkspaceService } from '../../workspace/workspace.service'
import type { SessionService } from '../session.service'
import type { Session, SessionSummary } from '../session.types'
import {
  buildExtractionPrompt,
  extractArtifactsByRegex,
  mergeArtifacts,
  parseAndValidateSummary,
  renderFullSeed,
  RETRY_SUFFIX,
  serializeConversationItems,
} from './session-fork.pure'
import type {
  ForkFullInput,
  ForkSummary,
  ForkSummaryInput,
  WorkspaceMode,
} from './session-fork.types'

export interface SessionForkDeps {
  sessions: SessionService
  providers: ProviderRegistry
  appSettings: AppSettingsService
  workspaces: WorkspaceService
}

export class SessionForkExtractionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'SessionForkExtractionError'
  }
}

const SUMMARY_EXTRACTION_TIMEOUT_MS = 180_000

export class SessionForkService {
  constructor(private readonly deps: SessionForkDeps) {}

  async previewSummary(
    parentId: string,
    requestId?: string,
  ): Promise<ForkSummary> {
    const parent = this.deps.sessions.getSummaryById(parentId)
    if (!parent) throw new Error(`Parent session not found: ${parentId}`)
    const conversation = this.deps.sessions.getConversation(parentId)

    const provider = this.deps.providers.get(parent.providerId)
    if (!provider || !provider.oneShot) {
      throw new SessionForkExtractionError(
        `Provider ${parent.providerId} does not support one-shot extraction`,
      )
    }

    const modelId = await this.deps.appSettings.resolveExtractionModel(
      parent.providerId,
    )
    if (!modelId) {
      throw new SessionForkExtractionError(
        `No extraction model available for provider ${parent.providerId}`,
      )
    }

    const serialized = serializeConversationItems(conversation)
    const basePrompt = buildExtractionPrompt(serialized)

    const firstRaw = await provider.oneShot({
      prompt: basePrompt,
      modelId,
      workingDirectory: parent.workingDirectory,
      timeoutMs: SUMMARY_EXTRACTION_TIMEOUT_MS,
      requestId,
    })
    const firstResult = parseAndValidateSummary(firstRaw.text)
    if (firstResult.ok) {
      return mergeWithRegex(firstResult.value, serialized)
    }

    const retryRaw = await provider.oneShot({
      prompt: basePrompt + RETRY_SUFFIX,
      modelId,
      workingDirectory: parent.workingDirectory,
      timeoutMs: SUMMARY_EXTRACTION_TIMEOUT_MS,
      requestId,
    })
    const retryResult = parseAndValidateSummary(retryRaw.text)
    if (retryResult.ok) {
      return mergeWithRegex(retryResult.value, serialized)
    }

    throw new SessionForkExtractionError(
      `Extraction failed after retry: ${retryResult.error.message}`,
    )
  }

  async forkFull(input: ForkFullInput): Promise<Session> {
    const parent = this.deps.sessions.getSummaryById(input.parentSessionId)
    if (!parent) {
      throw new Error(`Parent session not found: ${input.parentSessionId}`)
    }
    const conversation = this.deps.sessions.getConversation(
      input.parentSessionId,
    )

    const serialized = serializeConversationItems(conversation)
    const seed = renderFullSeed({
      serializedTranscript: serialized,
      parentName: parent.name,
      additionalInstruction: input.additionalInstruction,
    })

    return this.createAndStart({
      parent,
      name: input.name,
      providerId: input.providerId,
      modelId: input.modelId,
      effort: input.effort,
      workspaceMode: input.workspaceMode,
      workspaceBranchName: input.workspaceBranchName,
      strategy: 'full',
      seed,
    })
  }

  async forkSummary(input: ForkSummaryInput): Promise<Session> {
    const parent = this.deps.sessions.getSummaryById(input.parentSessionId)
    if (!parent) {
      throw new Error(`Parent session not found: ${input.parentSessionId}`)
    }

    return this.createAndStart({
      parent,
      name: input.name,
      providerId: input.providerId,
      modelId: input.modelId,
      effort: input.effort,
      workspaceMode: input.workspaceMode,
      workspaceBranchName: input.workspaceBranchName,
      strategy: 'summary',
      seed: input.seedMarkdown,
    })
  }

  private async createAndStart(args: {
    parent: SessionSummary
    name: string
    providerId: string
    modelId: string
    effort: Session['effort']
    workspaceMode: WorkspaceMode
    workspaceBranchName: string | null
    strategy: 'full' | 'summary'
    seed: string
  }): Promise<Session> {
    const workspaceId = await this.resolveChildWorkspace(
      args.parent,
      args.workspaceMode,
      args.workspaceBranchName,
    )

    const child = this.deps.sessions.create({
      projectId: args.parent.projectId,
      workspaceId,
      providerId: args.providerId,
      model: args.modelId,
      effort: args.effort,
      name: args.name,
      parentSessionId: args.parent.id,
      forkStrategy: args.strategy,
    })

    await this.deps.sessions.start(child.id, { text: args.seed })
    return this.deps.sessions.getSummaryById(child.id) ?? child
  }

  private async resolveChildWorkspace(
    parent: SessionSummary,
    mode: WorkspaceMode,
    branchName: string | null,
  ): Promise<string | null> {
    if (mode === 'reuse') return parent.workspaceId

    if (!branchName || branchName.trim().length === 0) {
      throw new Error(
        'workspaceBranchName is required when workspaceMode is "fork"',
      )
    }

    const workspace = await this.deps.workspaces.create({
      projectId: parent.projectId,
      branchName: branchName.trim(),
    })
    return workspace.id
  }
}

function mergeWithRegex(summary: ForkSummary, serialized: string): ForkSummary {
  const regexArtifacts = extractArtifactsByRegex(serialized)
  return {
    ...summary,
    artifacts: mergeArtifacts(summary.artifacts, regexArtifacts),
  }
}
