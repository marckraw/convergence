import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { AnalyticsProfileSnapshotRow } from '../database/database.types'
import type {
  AnalyticsRangePreset,
  CreateGeneratedWorkProfileSnapshotInput,
  GeneratedWorkProfileSnapshot,
  GeneratedWorkProfileSnapshotPayload,
} from './analytics.types'

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

function parseProfilePayload(
  row: AnalyticsProfileSnapshotRow,
): GeneratedWorkProfileSnapshotPayload {
  const parsed = JSON.parse(row.profile_json) as unknown

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== 1 ||
    typeof (parsed as { title?: unknown }).title !== 'string' ||
    typeof (parsed as { summary?: unknown }).summary !== 'string' ||
    !Array.isArray((parsed as { themes?: unknown }).themes) ||
    !Array.isArray((parsed as { caveats?: unknown }).caveats)
  ) {
    throw new Error(`Invalid analytics profile snapshot payload: ${row.id}`)
  }

  return parsed as GeneratedWorkProfileSnapshotPayload
}

function snapshotFromRow(
  row: AnalyticsProfileSnapshotRow,
): GeneratedWorkProfileSnapshot {
  return {
    id: row.id,
    rangePreset: parseRangePreset(row.range_preset),
    rangeStartDate: row.range_start_date,
    rangeEndDate: row.range_end_date,
    providerId: row.provider_id,
    model: row.model,
    payload: parseProfilePayload(row),
    createdAt: row.created_at,
  }
}

export class AnalyticsProfileService {
  constructor(private readonly db: Database.Database) {}

  getLatestProfileSnapshot(
    rangePreset: AnalyticsRangePreset,
  ): GeneratedWorkProfileSnapshot | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            range_preset,
            range_start_date,
            range_end_date,
            provider_id,
            model,
            profile_json,
            created_at
          FROM analytics_profile_snapshots
          WHERE range_preset = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `,
      )
      .get(rangePreset) as AnalyticsProfileSnapshotRow | undefined

    return row ? snapshotFromRow(row) : null
  }

  createProfileSnapshot(
    input: CreateGeneratedWorkProfileSnapshotInput,
  ): GeneratedWorkProfileSnapshot {
    const id = randomUUID()
    const createdAt = input.createdAt ?? new Date().toISOString()

    this.db
      .prepare(
        `
          INSERT INTO analytics_profile_snapshots (
            id,
            range_preset,
            range_start_date,
            range_end_date,
            provider_id,
            model,
            profile_json,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        id,
        input.rangePreset,
        input.rangeStartDate,
        input.rangeEndDate,
        input.providerId,
        input.model,
        JSON.stringify(input.payload),
        createdAt,
      )

    return {
      id,
      rangePreset: input.rangePreset,
      rangeStartDate: input.rangeStartDate,
      rangeEndDate: input.rangeEndDate,
      providerId: input.providerId,
      model: input.model,
      payload: input.payload,
      createdAt,
    }
  }

  deleteProfileSnapshot(id: string): void {
    this.db
      .prepare('DELETE FROM analytics_profile_snapshots WHERE id = ?')
      .run(id)
  }
}
