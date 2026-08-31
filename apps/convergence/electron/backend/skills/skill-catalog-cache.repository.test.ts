import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { SkillCatalogRepository } from './skill-catalog-cache.repository'
import type { ProviderSkillCatalog } from './skills.types'

function catalog(name: string): ProviderSkillCatalog {
  return {
    providerId: 'claude-code',
    providerName: 'Claude Code',
    catalogSource: 'filesystem',
    invocationSupport: 'native-command',
    activationConfirmation: 'native-event',
    skills: [
      {
        id: `claude-code:${name}`,
        providerId: 'claude-code',
        providerName: 'Claude Code',
        name,
        displayName: name,
        description: `${name} description`,
        shortDescription: `${name} description`,
        path: `/skills/${name}/SKILL.md`,
        scope: 'user',
        rawScope: 'user',
        sourceLabel: 'User',
        enabled: true,
        dependencies: [],
        warnings: [],
      },
    ],
    error: null,
  }
}

describe('SkillCatalogRepository', () => {
  let repository: SkillCatalogRepository

  beforeEach(() => {
    repository = new SkillCatalogRepository(getDatabase())
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('returns null for a missing key', () => {
    expect(repository.get('claude-code /missing')).toBeNull()
  })

  it('round-trips a stored catalog with its fingerprint', () => {
    const stored = catalog('review')
    repository.put({
      cacheKey: 'claude-code /repo',
      providerId: 'claude-code',
      scanRoot: '/repo',
      catalog: stored,
      fingerprint: 'abc123',
      expiresAt: null,
      updatedAt: '2026-06-23T00:00:00.000Z',
    })

    const result = repository.get('claude-code /repo')
    expect(result).toEqual({
      catalog: stored,
      fingerprint: 'abc123',
      expiresAt: null,
    })
  })

  it('stores a TTL expiry for RPC providers', () => {
    repository.put({
      cacheKey: 'codex /repo',
      providerId: 'codex',
      scanRoot: '/repo',
      catalog: { ...catalog('codex-skill'), providerId: 'codex' },
      fingerprint: null,
      expiresAt: '2026-06-23T00:05:00.000Z',
      updatedAt: '2026-06-23T00:00:00.000Z',
    })

    const result = repository.get('codex /repo')
    expect(result?.fingerprint).toBeNull()
    expect(result?.expiresAt).toBe('2026-06-23T00:05:00.000Z')
  })

  it('overwrites an existing entry on conflict', () => {
    const put = (name: string, fingerprint: string) =>
      repository.put({
        cacheKey: 'claude-code /repo',
        providerId: 'claude-code',
        scanRoot: '/repo',
        catalog: catalog(name),
        fingerprint,
        expiresAt: null,
        updatedAt: '2026-06-23T00:00:00.000Z',
      })

    put('review', 'fp-1')
    put('plan', 'fp-2')

    const result = repository.get('claude-code /repo')
    expect(result?.fingerprint).toBe('fp-2')
    expect(result?.catalog.skills[0]?.name).toBe('plan')
  })

  it('deletes an entry', () => {
    repository.put({
      cacheKey: 'claude-code /repo',
      providerId: 'claude-code',
      scanRoot: '/repo',
      catalog: catalog('review'),
      fingerprint: 'abc',
      expiresAt: null,
      updatedAt: '2026-06-23T00:00:00.000Z',
    })

    repository.delete('claude-code /repo')
    expect(repository.get('claude-code /repo')).toBeNull()
  })

  it('drops and ignores a row with corrupt JSON', () => {
    const db = getDatabase()
    db.prepare(
      `INSERT INTO skill_catalog_cache
         (cache_key, provider_id, scan_root, catalog_json, fingerprint, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'claude-code /corrupt',
      'claude-code',
      '/corrupt',
      '{not valid json',
      'abc',
      null,
      '2026-06-23T00:00:00.000Z',
    )

    expect(repository.get('claude-code /corrupt')).toBeNull()
    // The corrupt row is evicted so a later scan can repopulate it.
    expect(repository.get('claude-code /corrupt')).toBeNull()
    const count = db
      .prepare('SELECT COUNT(*) AS count FROM skill_catalog_cache')
      .get() as { count: number }
    expect(count.count).toBe(0)
  })
})
