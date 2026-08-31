import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { AnalyticsProfileSnapshotRow } from '../database/database.types'
import { snapshotFromRow } from './analytics-profile.pure'
import type {
  AnalyticsRangePreset,
  CreateGeneratedWorkProfileSnapshotInput,
  GeneratedWorkProfileSnapshot,
} from './analytics.types'

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
