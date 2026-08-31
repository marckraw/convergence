import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { AnalyticsProfileService } from './analytics-profile.service'
import type { GeneratedWorkProfileSnapshotPayload } from './analytics.types'

const payload: GeneratedWorkProfileSnapshotPayload = {
  version: 1,
  title: 'Contextual Builder',
  summary: 'You tend to explore before implementing.',
  themes: [
    {
      label: 'Planning',
      description: 'Sessions often start with codebase exploration.',
    },
  ],
  caveats: ['Based on local aggregate usage only.'],
}

describe('AnalyticsProfileService', () => {
  let db: Database.Database
  let service: AnalyticsProfileService

  beforeEach(() => {
    db = getDatabase()
    service = new AnalyticsProfileService(db)
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('creates and reads the latest profile snapshot for a range', () => {
    const older = service.createProfileSnapshot({
      rangePreset: '30d',
      rangeStartDate: '2026-04-01',
      rangeEndDate: '2026-04-30',
      providerId: 'codex',
      model: 'gpt-5.4',
      payload,
      createdAt: '2026-04-30T10:00:00.000Z',
    })
    const latest = service.createProfileSnapshot({
      rangePreset: '30d',
      rangeStartDate: '2026-04-01',
      rangeEndDate: '2026-04-30',
      providerId: 'claude-code',
      model: 'sonnet',
      payload: { ...payload, title: 'Focused Implementer' },
      createdAt: '2026-04-30T11:00:00.000Z',
    })
    service.createProfileSnapshot({
      rangePreset: '7d',
      rangeStartDate: '2026-04-24',
      rangeEndDate: '2026-04-30',
      providerId: 'codex',
      model: 'gpt-5.4',
      payload: { ...payload, title: 'Seven Day Profile' },
      createdAt: '2026-04-30T12:00:00.000Z',
    })

    expect(older.id).not.toBe(latest.id)
    expect(service.getLatestProfileSnapshot('30d')).toMatchObject({
      id: latest.id,
      rangePreset: '30d',
      rangeStartDate: '2026-04-01',
      rangeEndDate: '2026-04-30',
      providerId: 'claude-code',
      model: 'sonnet',
      payload: { title: 'Focused Implementer' },
      createdAt: '2026-04-30T11:00:00.000Z',
    })
  })

  it('returns null when a range has no generated profile', () => {
    expect(service.getLatestProfileSnapshot('90d')).toBeNull()
  })

  it('deletes only the selected profile snapshot', () => {
    const keep = service.createProfileSnapshot({
      rangePreset: '30d',
      rangeStartDate: '2026-04-01',
      rangeEndDate: '2026-04-30',
      providerId: 'codex',
      model: 'gpt-5.4',
      payload,
      createdAt: '2026-04-30T10:00:00.000Z',
    })
    const remove = service.createProfileSnapshot({
      rangePreset: '30d',
      rangeStartDate: '2026-04-01',
      rangeEndDate: '2026-04-30',
      providerId: 'codex',
      model: 'gpt-5.4',
      payload: { ...payload, title: 'Remove me' },
      createdAt: '2026-04-30T11:00:00.000Z',
    })

    service.deleteProfileSnapshot(remove.id)

    expect(service.getLatestProfileSnapshot('30d')?.id).toBe(keep.id)
  })

  it('throws when stored payload JSON is not a profile payload', () => {
    db.prepare(
      `
        INSERT INTO analytics_profile_snapshots (
          id,
          range_preset,
          range_start_date,
          range_end_date,
          profile_json,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(
      'invalid',
      '30d',
      '2026-04-01',
      '2026-04-30',
      JSON.stringify({ version: 1, title: 'Missing fields' }),
      '2026-04-30T12:00:00.000Z',
    )

    expect(() => service.getLatestProfileSnapshot('30d')).toThrow(
      'Invalid analytics profile snapshot payload: invalid',
    )
  })
})
