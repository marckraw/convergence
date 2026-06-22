import { CodexAppServerClient } from '../provider/codex/codex-app-server-client'
import { mapCodexSkillCatalog } from './codex-skills.mapper.pure'
import { buildProviderSkillErrorCatalog } from './skill-catalog.pure'
import type { ProviderSkillCatalog, SkillCatalogOptions } from './skills.types'

export interface CodexSkillsClient {
  listSkills: (
    projectPath: string,
    options?: SkillCatalogOptions,
  ) => Promise<unknown>
}

/**
 * Codex skill discovery spawns a fresh `codex app-server` and runs an
 * initialize + skills/list round-trip. Cold starts (config load, auth, network)
 * are the main cause of timeouts, so the budget is generous and a successful
 * scan is cached to avoid re-paying that cost on every dialog open.
 */
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_CACHE_TTL_MS = 5 * 60_000

interface CodexSkillsCacheEntry {
  catalog: ProviderSkillCatalog
  expiresAt: number
}

export interface CodexSkillsServiceOptions {
  client?: CodexSkillsClient
  now?: () => number
  cacheTtlMs?: number
  timeoutMs?: number
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Failed to inspect Codex skills'
}

export class CodexSkillsService {
  private client: CodexSkillsClient
  private now: () => number
  private cacheTtlMs: number
  private cache = new Map<string, CodexSkillsCacheEntry>()

  constructor(binaryPath: string, options: CodexSkillsServiceOptions = {}) {
    this.client =
      options.client ??
      new CodexAppServerClient(binaryPath, {
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      })
    this.now = options.now ?? (() => Date.now())
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  }

  async list(
    projectPath: string,
    options: SkillCatalogOptions = {},
  ): Promise<ProviderSkillCatalog> {
    const now = this.now()

    if (!options.forceReload) {
      const cached = this.cache.get(projectPath)
      if (cached && cached.expiresAt > now) {
        return cached.catalog
      }
    }

    try {
      const payload = await this.client.listSkills(projectPath, options)
      const catalog = mapCodexSkillCatalog(payload)
      // Only successful scans are cached; a timeout/error stays uncached so the
      // next open retries rather than serving a stale failure.
      this.cache.set(projectPath, {
        catalog,
        expiresAt: now + this.cacheTtlMs,
      })
      return catalog
    } catch (error) {
      return buildProviderSkillErrorCatalog({
        providerId: 'codex',
        providerName: 'Codex',
        catalogSource: 'native-rpc',
        invocationSupport: 'structured-input',
        activationConfirmation: 'none',
        error: errorMessage(error),
      })
    }
  }
}
