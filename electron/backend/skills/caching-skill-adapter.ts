import { resolve } from 'path'
import type { SkillProviderCatalogAdapter } from './skills.service'
import type { SkillCatalogRepository } from './skill-catalog-cache.repository'
import type {
  ProviderSkillCatalog,
  SkillCatalogOptions,
  SkillProviderId,
} from './skills.types'

/**
 * Filesystem adapters implement `fingerprint` so the cache can detect added,
 * removed, or edited skills with a cheap stat-walk instead of a full rescan.
 * RPC adapters (Codex, Cursor) omit it and fall back to a TTL.
 */
export interface FingerprintableSkillAdapter extends SkillProviderCatalogAdapter {
  fingerprint: (projectPath: string) => Promise<string>
}

export function isFingerprintable(
  adapter: SkillProviderCatalogAdapter,
): adapter is FingerprintableSkillAdapter {
  return (
    'fingerprint' in adapter &&
    typeof (adapter as FingerprintableSkillAdapter).fingerprint === 'function'
  )
}

export interface CachingSkillAdapterOptions {
  /** TTL applied to providers without a fingerprint (RPC providers). */
  ttlMs: number
  /** Injectable clock (ms) for deterministic tests. */
  now: () => number
}

/**
 * Cache-aside decorator over a provider adapter, persisted to SQLite.
 *
 * - Filesystem providers: serve cached iff a freshly computed content
 *   fingerprint matches the stored one; otherwise rescan. New/removed/edited
 *   skills are detected on the next open.
 * - RPC providers: serve cached until the stored TTL expires; otherwise rescan.
 *
 * Only successful scans (`error === null`) are persisted, mirroring the
 * Codex success-only policy so a transient failure never sticks as a stale
 * cached error. A manual refresh (`forceReload`) bypasses the cache and
 * propagates the flag to the inner adapter, then re-persists the fresh result.
 */
export class CachingSkillAdapter implements SkillProviderCatalogAdapter {
  constructor(
    private inner: SkillProviderCatalogAdapter,
    private repository: SkillCatalogRepository,
    private providerId: SkillProviderId,
    private options: CachingSkillAdapterOptions,
  ) {}

  async list(
    projectPath: string,
    options: SkillCatalogOptions = {},
  ): Promise<ProviderSkillCatalog> {
    const scanRoot = resolve(projectPath)
    const cacheKey = `${this.providerId} ${scanRoot}`

    if (!options.forceReload) {
      const cached = this.repository.get(cacheKey)
      if (
        cached &&
        (await this.isFresh(cached.fingerprint, cached.expiresAt, scanRoot))
      ) {
        return cached.catalog
      }
    }

    return this.revalidate(cacheKey, scanRoot, options)
  }

  private async isFresh(
    cachedFingerprint: string | null,
    cachedExpiresAt: string | null,
    scanRoot: string,
  ): Promise<boolean> {
    if (isFingerprintable(this.inner)) {
      if (cachedFingerprint === null) {
        return false
      }
      const current = await this.inner.fingerprint(scanRoot)
      return current === cachedFingerprint
    }

    if (!cachedExpiresAt) {
      return false
    }
    const expiresAt = Date.parse(cachedExpiresAt)
    return Number.isFinite(expiresAt) && this.options.now() < expiresAt
  }

  private async revalidate(
    cacheKey: string,
    scanRoot: string,
    options: SkillCatalogOptions,
  ): Promise<ProviderSkillCatalog> {
    // Fingerprint BEFORE scanning so a change that lands mid-scan yields a
    // fingerprint older than the catalog — the next open then detects a
    // mismatch and rescans rather than masking the edit.
    const fingerprint = isFingerprintable(this.inner)
      ? await this.inner.fingerprint(scanRoot)
      : null

    const catalog = await this.inner.list(scanRoot, options)

    if (catalog.error === null) {
      const now = this.options.now()
      this.repository.put({
        cacheKey,
        providerId: this.providerId,
        scanRoot,
        catalog,
        fingerprint,
        // Filesystem providers invalidate by fingerprint, so they get no TTL;
        // RPC providers (no fingerprint) expire after the TTL window.
        expiresAt:
          fingerprint === null
            ? new Date(now + this.options.ttlMs).toISOString()
            : null,
        updatedAt: new Date(now).toISOString(),
      })
    }

    return catalog
  }
}
