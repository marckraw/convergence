import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { CachingSkillAdapter } from './caching-skill-adapter'
import { SkillCatalogRepository } from './skill-catalog-cache.repository'
import type { SkillProviderCatalogAdapter } from './skills.service'
import type {
  ProviderSkillCatalog,
  SkillCatalogOptions,
  SkillProviderId,
} from './skills.types'

function makeCatalog(
  providerId: SkillProviderId,
  name: string,
  error: string | null = null,
): ProviderSkillCatalog {
  return {
    providerId,
    providerName: providerId,
    catalogSource: 'filesystem',
    invocationSupport: 'native-command',
    activationConfirmation: 'none',
    skills: error
      ? []
      : [
          {
            id: `${providerId}:${name}`,
            providerId,
            providerName: providerId,
            name,
            displayName: name,
            description: name,
            shortDescription: name,
            path: `/skills/${name}/SKILL.md`,
            scope: 'user',
            rawScope: 'user',
            sourceLabel: 'User',
            enabled: true,
            dependencies: [],
            warnings: [],
          },
        ],
    error,
  }
}

class FakeFsAdapter implements SkillProviderCatalogAdapter {
  listCalls = 0
  fingerprintCalls = 0
  fingerprintValue = 'fp-1'
  lastOptions: SkillCatalogOptions | undefined
  constructor(private catalog: ProviderSkillCatalog) {}

  async list(
    _projectPath: string,
    options: SkillCatalogOptions = {},
  ): Promise<ProviderSkillCatalog> {
    this.listCalls++
    this.lastOptions = options
    return this.catalog
  }

  async fingerprint(_projectPath: string): Promise<string> {
    this.fingerprintCalls++
    return this.fingerprintValue
  }
}

class FakeRpcAdapter implements SkillProviderCatalogAdapter {
  listCalls = 0
  lastOptions: SkillCatalogOptions | undefined
  constructor(private catalog: ProviderSkillCatalog) {}

  async list(
    _projectPath: string,
    options: SkillCatalogOptions = {},
  ): Promise<ProviderSkillCatalog> {
    this.listCalls++
    this.lastOptions = options
    return this.catalog
  }
}

describe('CachingSkillAdapter', () => {
  let repository: SkillCatalogRepository
  let clock: number

  beforeEach(() => {
    repository = new SkillCatalogRepository(getDatabase())
    clock = 1000
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  function fsAdapter(inner: FakeFsAdapter): CachingSkillAdapter {
    return new CachingSkillAdapter(inner, repository, 'claude-code', {
      ttlMs: 5000,
      now: () => clock,
    })
  }

  function rpcAdapter(inner: FakeRpcAdapter): CachingSkillAdapter {
    return new CachingSkillAdapter(inner, repository, 'codex', {
      ttlMs: 5000,
      now: () => clock,
    })
  }

  describe('filesystem providers (fingerprint)', () => {
    it('serves the cached catalog while the fingerprint is unchanged', async () => {
      const inner = new FakeFsAdapter(makeCatalog('claude-code', 'review'))
      const adapter = fsAdapter(inner)

      const first = await adapter.list('/repo')
      const second = await adapter.list('/repo')

      expect(first).toEqual(second)
      expect(inner.listCalls).toBe(1)
    })

    it('rescans when the fingerprint changes', async () => {
      const inner = new FakeFsAdapter(makeCatalog('claude-code', 'review'))
      const adapter = fsAdapter(inner)

      await adapter.list('/repo')
      inner.fingerprintValue = 'fp-2'
      await adapter.list('/repo')

      expect(inner.listCalls).toBe(2)
    })

    it('keeps per-scan-root cache entries independent', async () => {
      const inner = new FakeFsAdapter(makeCatalog('claude-code', 'review'))
      const adapter = fsAdapter(inner)

      await adapter.list('/repo-a')
      await adapter.list('/repo-b')
      await adapter.list('/repo-a')

      // Two distinct roots scanned once each; the third call hits cache.
      expect(inner.listCalls).toBe(2)
    })
  })

  describe('RPC providers (TTL)', () => {
    it('serves the cached catalog until the TTL expires', async () => {
      const inner = new FakeRpcAdapter(makeCatalog('codex', 'codex-skill'))
      const adapter = rpcAdapter(inner)

      await adapter.list('/repo')
      clock = 2000 // within ttl (expires at 6000)
      await adapter.list('/repo')
      expect(inner.listCalls).toBe(1)

      clock = 7000 // past ttl
      await adapter.list('/repo')
      expect(inner.listCalls).toBe(2)
    })
  })

  describe('forceReload', () => {
    it('bypasses a fresh cache and propagates the flag to the inner adapter', async () => {
      const inner = new FakeFsAdapter(makeCatalog('claude-code', 'review'))
      const adapter = fsAdapter(inner)

      await adapter.list('/repo')
      await adapter.list('/repo', { forceReload: true })

      expect(inner.listCalls).toBe(2)
      expect(inner.lastOptions?.forceReload).toBe(true)
    })
  })

  describe('error policy', () => {
    it('does not cache an errored catalog', async () => {
      const inner = new FakeRpcAdapter(
        makeCatalog('codex', 'codex-skill', 'app-server timed out'),
      )
      const adapter = rpcAdapter(inner)

      const result = await adapter.list('/repo')
      expect(result.error).toBe('app-server timed out')
      expect(repository.get('codex /repo')).toBeNull()

      // The next open retries instead of serving the stale failure.
      await adapter.list('/repo')
      expect(inner.listCalls).toBe(2)
    })
  })
})
