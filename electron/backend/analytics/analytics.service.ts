import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { AppSettingsService } from '../app-settings/app-settings.service'
import type { ProviderRegistry } from '../provider/provider-registry'
import { AnalyticsProfileService } from './analytics-profile.service'
import {
  buildWorkProfilePrompt,
  parseGeneratedWorkProfilePayload,
} from './analytics-profile.pure'
import { buildAnalyticsOverview } from './analytics.pure'
import type {
  AnalyticsAttachmentInput,
  AnalyticsConversationItemInput,
  AnalyticsConversationItemKind,
  AnalyticsFileChangeInput,
  AnalyticsOverview,
  AnalyticsRangePreset,
  AnalyticsSessionInput,
  AnalyticsTurnInput,
  GenerateWorkProfileInput,
} from './analytics.types'

interface AnalyticsServiceDeps {
  profileService?: AnalyticsProfileService
  providers?: ProviderRegistry
  appSettings?: AppSettingsService
  workingDirectory?: string
}

interface AnalyticsSessionRow {
  id: string
  project_id: string
  project_name: string | null
  provider_id: string
  status: string
  primary_surface: string
  archived_at: string | null
  created_at: string
  updated_at: string
}

interface AnalyticsConversationItemRow {
  id: string
  session_id: string
  kind: string
  payload_json: string
  created_at: string
}

interface AnalyticsTurnRow {
  id: string
  session_id: string
  status: string
  started_at: string
  ended_at: string | null
}

interface AnalyticsFileChangeRow {
  id: string
  session_id: string
  turn_id: string
  additions: number
  deletions: number
  created_at: string
}

interface AnalyticsAttachmentRow {
  id: string
  session_id: string
  created_at: string
}

function providerNameFromId(providerId: string): string {
  switch (providerId) {
    case 'claude-code':
      return 'Claude Code'
    case 'codex':
      return 'Codex'
    case 'pi':
      return 'Pi'
    case 'shell':
    case 'shell-provider':
      return 'Terminal'
    default:
      return providerId
  }
}

function parseRangePreset(value: string): AnalyticsRangePreset {
  switch (value) {
    case '7d':
    case '30d':
    case '90d':
    case 'all':
      return value
    default:
      throw new Error(`Invalid analytics range preset: ${value}`)
  }
}

function parsePayload(
  row: AnalyticsConversationItemRow,
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(row.payload_json)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function kindFromRow(value: string): AnalyticsConversationItemKind {
  switch (value) {
    case 'message':
    case 'thinking':
    case 'tool-call':
    case 'tool-result':
    case 'approval-request':
    case 'input-request':
    case 'note':
      return value
    default:
      return 'note'
  }
}

function textFromPayload(
  kind: AnalyticsConversationItemKind,
  payload: Record<string, unknown>,
): string {
  switch (kind) {
    case 'message':
    case 'thinking':
    case 'note':
      return typeof payload.text === 'string' ? payload.text : ''
    case 'tool-call':
      return typeof payload.inputText === 'string' ? payload.inputText : ''
    case 'tool-result':
      return typeof payload.outputText === 'string' ? payload.outputText : ''
    case 'approval-request':
      return typeof payload.description === 'string' ? payload.description : ''
    case 'input-request':
      return typeof payload.prompt === 'string' ? payload.prompt : ''
  }
}

function conversationItemFromRow(
  row: AnalyticsConversationItemRow,
): AnalyticsConversationItemInput {
  const kind = kindFromRow(row.kind)
  const payload = parsePayload(row)
  const actor =
    payload.actor === 'user' || payload.actor === 'assistant'
      ? payload.actor
      : null

  return {
    id: row.id,
    sessionId: row.session_id,
    kind,
    actor,
    text: textFromPayload(kind, payload),
    createdAt: row.created_at,
  }
}

export class AnalyticsService {
  private readonly profileService: AnalyticsProfileService
  private readonly providers: ProviderRegistry | null
  private readonly appSettings: AppSettingsService | null
  private readonly workingDirectory: string

  constructor(
    private readonly db: Database.Database,
    deps: AnalyticsServiceDeps = {},
  ) {
    this.profileService = deps.profileService ?? new AnalyticsProfileService(db)
    this.providers = deps.providers ?? null
    this.appSettings = deps.appSettings ?? null
    this.workingDirectory = deps.workingDirectory ?? process.cwd()
  }

  getOverview(
    rangePreset: string,
    now = new Date().toISOString(),
  ): AnalyticsOverview {
    const preset = parseRangePreset(rangePreset)
    return buildAnalyticsOverview({
      now,
      rangePreset: preset,
      sessions: this.listSessions(),
      conversationItems: this.listConversationItems(),
      turns: this.listTurns(),
      fileChanges: this.listFileChanges(),
      attachments: this.listAttachments(),
      generatedProfile: this.profileService.getLatestProfileSnapshot(preset),
    })
  }

  deleteWorkProfileSnapshot(id: string): void {
    this.profileService.deleteProfileSnapshot(id)
  }

  async generateWorkProfile(
    input: GenerateWorkProfileInput,
    now = new Date().toISOString(),
  ) {
    if (!this.providers || !this.appSettings) {
      throw new Error('Analytics profile generation is unavailable')
    }

    const rangePreset = parseRangePreset(input.rangePreset)
    const provider = this.providers.get(input.providerId)
    if (!provider) {
      throw new Error(`Unknown provider id: ${input.providerId}`)
    }
    if (!provider.oneShot) {
      throw new Error(
        `Provider does not support profile generation: ${input.providerId}`,
      )
    }

    const descriptor = await provider.describe()
    const modelId =
      input.model ??
      (await this.appSettings.resolveExtractionModel(provider.id))
    if (!modelId) {
      throw new Error(`No model available for provider ${provider.id}`)
    }
    if (!descriptor.modelOptions.some((option) => option.id === modelId)) {
      throw new Error(
        `Unknown model id for provider ${provider.id}: ${modelId}`,
      )
    }

    const overview = this.getOverview(rangePreset, now)
    const prompt = buildWorkProfilePrompt({
      ...overview,
      generatedProfile: null,
    })
    const result = await provider.oneShot({
      prompt,
      modelId,
      workingDirectory: this.workingDirectory,
      timeoutMs: 180_000,
      requestId: randomUUID(),
    })
    const payload = parseGeneratedWorkProfilePayload(result.text)

    return this.profileService.createProfileSnapshot({
      rangePreset,
      rangeStartDate: overview.range.startDate,
      rangeEndDate: overview.range.endDate,
      providerId: provider.id,
      model: modelId,
      payload,
    })
  }

  private listSessions(): AnalyticsSessionInput[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            sessions.id,
            sessions.project_id,
            projects.name AS project_name,
            sessions.provider_id,
            sessions.status,
            sessions.primary_surface,
            sessions.archived_at,
            sessions.created_at,
            sessions.updated_at
          FROM sessions
          LEFT JOIN projects ON projects.id = sessions.project_id
          ORDER BY sessions.created_at ASC
        `,
      )
      .all() as AnalyticsSessionRow[]

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      projectName: row.project_name ?? 'Unknown project',
      providerId: row.provider_id,
      providerName: providerNameFromId(row.provider_id),
      status: row.status,
      primarySurface: row.primary_surface,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  private listConversationItems(): AnalyticsConversationItemInput[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            kind,
            payload_json,
            created_at
          FROM session_conversation_items
          ORDER BY created_at ASC
        `,
      )
      .all() as AnalyticsConversationItemRow[]

    return rows.map(conversationItemFromRow)
  }

  private listTurns(): AnalyticsTurnInput[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            status,
            started_at,
            ended_at
          FROM session_turns
          ORDER BY started_at ASC
        `,
      )
      .all() as AnalyticsTurnRow[]

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    }))
  }

  private listFileChanges(): AnalyticsFileChangeInput[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            turn_id,
            additions,
            deletions,
            created_at
          FROM session_turn_file_changes
          ORDER BY created_at ASC
        `,
      )
      .all() as AnalyticsFileChangeRow[]

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      turnId: row.turn_id,
      additions: row.additions,
      deletions: row.deletions,
      createdAt: row.created_at,
    }))
  }

  private listAttachments(): AnalyticsAttachmentInput[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            created_at
          FROM attachments
          ORDER BY created_at ASC
        `,
      )
      .all() as AnalyticsAttachmentRow[]

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      createdAt: row.created_at,
    }))
  }
}
