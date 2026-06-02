import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { AppSettingsService } from '../app-settings/app-settings.service'
import type { CodeReviewService } from '../code-review/code-review.service'
import type { CodeReviewGuideRow } from '../database/database.types'
import type { ProviderRegistry } from '../provider/provider-registry'
import type { Provider } from '../provider/provider.types'
import type { SessionService } from '../session/session.service'
import {
  buildCodeReviewGuideCacheKey,
  buildCodeReviewGuidePrompt,
  CODE_REVIEW_GUIDE_RETRY_SUFFIX,
  buildDeterministicCodeReviewGuideDraft,
  normalizeCodeReviewGuideDraft,
  parseAndValidateAgentGuide,
} from './code-review-guide.pure'
import {
  codeReviewGuideFromRow,
  type CodeReviewGuide,
  type CodeReviewGuideGenerateRequest,
  type CodeReviewGuideLookupRequest,
  type CodeReviewGuidePromptPatch,
} from './code-review-guide.types'

interface CodeReviewGuideServiceDeps {
  providers: ProviderRegistry
  appSettings: Pick<AppSettingsService, 'resolveGuidedReviewModel'>
  sessions: Pick<SessionService, 'getSummaryById'>
  codeReview: Pick<CodeReviewService, 'getFilePatch'>
}

const GUIDE_GENERATION_TIMEOUT_MS = 600_000
const PATCH_FILE_LIMIT = 20
const PATCH_EXCERPT_LIMIT = 1200
const TOTAL_PATCH_EXCERPT_LIMIT = 18000

export class CodeReviewGuideGenerationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'CodeReviewGuideGenerationError'
  }
}

export class CodeReviewGuideService {
  constructor(
    private db: Database.Database,
    private deps?: CodeReviewGuideServiceDeps,
  ) {}

  getGuide(input: CodeReviewGuideLookupRequest): CodeReviewGuide | null {
    const row = this.db
      .prepare(
        `SELECT * FROM code_review_guides
         WHERE target_id = ?
           AND mode = ?
           AND cache_key = ?
         LIMIT 1`,
      )
      .get(
        input.target.id,
        input.mode,
        buildCodeReviewGuideCacheKey(input.cacheIdentity),
      ) as CodeReviewGuideRow | undefined

    return row ? codeReviewGuideFromRow(row) : null
  }

  async generateGuide(
    input: CodeReviewGuideGenerateRequest,
  ): Promise<CodeReviewGuide> {
    if (this.deps) {
      return this.generateAgentGuide(input)
    }
    return this.generateDeterministicGuide(input)
  }

  async refreshGuide(
    input: CodeReviewGuideGenerateRequest,
  ): Promise<CodeReviewGuide> {
    return this.generateGuide(input)
  }

  private generateDeterministicGuide(
    input: CodeReviewGuideGenerateRequest,
  ): CodeReviewGuide {
    const draft = normalizeCodeReviewGuideDraft({
      draft: buildDeterministicCodeReviewGuideDraft(input.files),
      files: input.files,
    })

    return this.upsertGuide(input, {
      status: 'ready',
      overview: draft.overview,
      generatedBy: draft.generatedBy,
      sectionsJson: JSON.stringify(draft.sections),
      error: null,
    })
  }

  private async generateAgentGuide(
    input: CodeReviewGuideGenerateRequest,
  ): Promise<CodeReviewGuide> {
    const providerContext = this.selectProvider(input)
    if (!providerContext) {
      return this.generateDeterministicGuide(input)
    }

    const modelDefaults = await this.deps!.appSettings.resolveGuidedReviewModel(
      providerContext.provider.id,
    )
    if (!modelDefaults) {
      return this.generateDeterministicGuide(input)
    }

    const patches = await this.buildPatchExcerpts(input)
    const prompt = buildCodeReviewGuidePrompt({
      target: input.target,
      mode: input.mode,
      files: input.files,
      patches,
    })
    const requestId = randomUUID()

    const firstRaw = await providerContext.provider.oneShot!({
      prompt,
      modelId: modelDefaults.modelId,
      effort: modelDefaults.effortId,
      workingDirectory: providerContext.workingDirectory,
      timeoutMs: GUIDE_GENERATION_TIMEOUT_MS,
      requestId,
    })
    const firstResult = parseAndValidateAgentGuide(firstRaw.text, input.files)
    if (firstResult.ok) {
      return this.upsertGuide(input, {
        status: 'ready',
        overview: firstResult.value.overview,
        generatedBy: 'agent',
        sectionsJson: JSON.stringify(firstResult.value.sections),
        error: null,
      })
    }

    const retryRaw = await providerContext.provider.oneShot!({
      prompt: prompt + CODE_REVIEW_GUIDE_RETRY_SUFFIX,
      modelId: modelDefaults.modelId,
      effort: modelDefaults.effortId,
      workingDirectory: providerContext.workingDirectory,
      timeoutMs: GUIDE_GENERATION_TIMEOUT_MS,
      requestId,
    })
    const retryResult = parseAndValidateAgentGuide(retryRaw.text, input.files)
    if (retryResult.ok) {
      return this.upsertGuide(input, {
        status: 'ready',
        overview: retryResult.value.overview,
        generatedBy: 'agent',
        sectionsJson: JSON.stringify(retryResult.value.sections),
        error: null,
      })
    }

    const message = `Guide generation failed after retry: ${retryResult.error.message}`
    this.upsertGuide(input, {
      status: 'failed',
      overview: '',
      generatedBy: 'agent',
      sectionsJson: '[]',
      error: message,
    })
    throw new CodeReviewGuideGenerationError(message, retryResult.error)
  }

  private selectProvider(input: CodeReviewGuideGenerateRequest): {
    provider: Provider
    workingDirectory: string
  } | null {
    const session = input.target.sessionId
      ? (this.deps?.sessions.getSummaryById(input.target.sessionId) ?? null)
      : null
    const sessionProvider = session
      ? this.deps?.providers.get(session.providerId)
      : null
    if (sessionProvider?.oneShot) {
      return {
        provider: sessionProvider,
        workingDirectory:
          session?.workingDirectory ?? input.target.repositoryPath,
      }
    }

    const fallbackProvider = this.deps?.providers
      .getAll()
      .find((provider) => provider.oneShot)
    if (!fallbackProvider) return null
    return {
      provider: fallbackProvider,
      workingDirectory:
        session?.workingDirectory ?? input.target.repositoryPath,
    }
  }

  private async buildPatchExcerpts(
    input: CodeReviewGuideGenerateRequest,
  ): Promise<CodeReviewGuidePromptPatch[]> {
    const patches: CodeReviewGuidePromptPatch[] = []
    let totalLength = 0

    for (const file of input.files.slice(0, PATCH_FILE_LIMIT)) {
      if (totalLength >= TOTAL_PATCH_EXCERPT_LIMIT) break

      let diff: string
      try {
        diff = await this.deps!.codeReview.getFilePatch({
          target: input.target,
          mode: input.mode,
          filePath: file.file,
          cacheIdentity: input.cacheIdentity,
        })
      } catch {
        diff = ''
      }

      const remaining = TOTAL_PATCH_EXCERPT_LIMIT - totalLength
      const cap = Math.min(PATCH_EXCERPT_LIMIT, remaining)
      const excerpt = diff.length > cap ? diff.slice(0, cap) : diff
      totalLength += excerpt.length
      patches.push({
        filePath: file.file,
        status: file.status,
        diffExcerpt: excerpt,
        truncated: diff.length > excerpt.length,
      })
    }

    return patches
  }

  private upsertGuide(
    input: CodeReviewGuideGenerateRequest,
    guide: {
      status: 'ready' | 'failed'
      overview: string
      generatedBy: 'deterministic' | 'agent'
      sectionsJson: string
      error: string | null
    },
  ): CodeReviewGuide {
    const id = randomUUID()
    const cacheKey = buildCodeReviewGuideCacheKey(input.cacheIdentity)
    const cacheIdentityJson = JSON.stringify(input.cacheIdentity)

    this.db
      .prepare(
        `INSERT INTO code_review_guides (
           id,
           project_id,
           target_id,
           mode,
           cache_key,
           cache_identity_json,
           status,
           overview,
           generated_by,
           sections_json,
           error
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(target_id, mode, cache_key) DO UPDATE SET
           project_id = excluded.project_id,
           cache_identity_json = excluded.cache_identity_json,
           status = excluded.status,
           overview = excluded.overview,
           generated_by = excluded.generated_by,
           sections_json = excluded.sections_json,
           error = excluded.error,
           updated_at = datetime('now')`,
      )
      .run(
        id,
        input.target.projectId,
        input.target.id,
        input.mode,
        cacheKey,
        cacheIdentityJson,
        guide.status,
        guide.overview,
        guide.generatedBy,
        guide.sectionsJson,
        guide.error,
      )

    const stored = this.getGuide(input)
    if (!stored) {
      throw new Error('Failed to persist code review guide')
    }
    return stored
  }
}
