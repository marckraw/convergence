import { execFile } from 'child_process'
import { chmodSync, statSync } from 'fs'
import { createRequire } from 'module'
import { CLAUDE_QUOTA_CACHE_TTL_MS } from './claude-quota.constants'
import {
  buildClaudeQuotaUnavailableSnapshot,
  mapClaudeUsagePayloadsToQuotaSnapshot,
  resolveAsarUnpackedPath,
  resolveCcusageNativeBinaryPath,
  resolveCcusageNativePackageName,
} from './claude-quota.pure'
import type { ClaudeRateLimitState } from './claude-rate-limit.state'
import type { ProviderQuotaRequestOptions } from './provider-quota.service'
import type { ProviderQuotaSnapshot } from './provider-quota.types'

type CcusageRunner = (args: string[]) => Promise<unknown>

const requireFromHere = createRequire(import.meta.url)

interface CcusageBinaryExecutableDeps {
  chmod: (path: string, mode: number) => void
  platform: NodeJS.Platform
  stat: (path: string) => { mode: number }
}

const defaultExecutableDeps: CcusageBinaryExecutableDeps = {
  chmod: chmodSync,
  platform: process.platform,
  stat: statSync,
}

export function ensureCcusageBinaryExecutable(
  binaryPath: string,
  deps: CcusageBinaryExecutableDeps = defaultExecutableDeps,
): void {
  if (deps.platform === 'win32' || binaryPath === 'ccusage') return

  try {
    if ((deps.stat(binaryPath).mode & 0o111) !== 0) return
    deps.chmod(binaryPath, 0o755)
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Unable to prepare ccusage native binary.'
    throw new Error(`ccusage native binary is not executable: ${message}`, {
      cause: err,
    })
  }
}

function resolveCcusageBinary(): string {
  const packageName = resolveCcusageNativePackageName(
    process.platform,
    process.arch,
  )
  if (!packageName) {
    throw new Error(
      `ccusage is not available for ${process.platform}-${process.arch}.`,
    )
  }

  const binaryPath = resolveCcusageNativeBinaryPath(process.platform)
  try {
    return resolveAsarUnpackedPath(
      requireFromHere.resolve(`${packageName}/${binaryPath}`),
    )
  } catch {
    return 'ccusage'
  }
}

function runCcusage(args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let binaryPath: string
    try {
      binaryPath = resolveCcusageBinary()
      ensureCcusageBinaryExecutable(binaryPath)
    } catch (error) {
      reject(error)
      return
    }

    execFile(
      binaryPath,
      args,
      { maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.trim() || error.message
          reject(new Error(`ccusage failed: ${detail}`))
          return
        }

        try {
          resolve(JSON.parse(stdout) as unknown)
        } catch {
          reject(new Error('ccusage returned invalid JSON.'))
        }
      },
    )
  })
}

export class ClaudeQuotaService {
  private cached: ProviderQuotaSnapshot | null = null

  constructor(
    private readonly ccusage: CcusageRunner = runCcusage,
    /**
     * Claude's own per-account limit signal (PA8). Optional so a bare service
     * still works; when absent the snapshot simply carries no account-
     * authoritative reading, which is the truthful state.
     */
    private readonly rateLimits: ClaudeRateLimitState | null = null,
  ) {}

  /**
   * The ccusage half of this snapshot is deliberately **not** keyed by account.
   * ccusage reads `~/.claude/projects`, which ADR 0007 shares between every
   * account so conversations stay resumable across a swap — so those numbers
   * are machine-wide by construction, and keying their cache per account would
   * manufacture per-account spend figures that do not exist. The half that *is*
   * account-authoritative — what Claude told us about its own limits — is keyed
   * by `(executionHostId, providerAccountId)` and attached here.
   */
  async getQuota(options: ProviderQuotaRequestOptions = {}) {
    const snapshot = await this.readUsageLog(options)
    const rateLimit = options.scope ? this.rateLimits?.get(options.scope) : null

    return rateLimit ? { ...snapshot, rateLimit } : snapshot
  }

  private async readUsageLog(options: ProviderQuotaRequestOptions) {
    const now = Date.now()
    if (
      !options.forceRefresh &&
      this.cached &&
      now - Date.parse(this.cached.lastCheckedAt) < CLAUDE_QUOTA_CACHE_TTL_MS
    ) {
      return this.cached
    }

    try {
      const [weeklyPayload, blocksPayload] = await Promise.all([
        this.ccusage([
          'claude',
          'weekly',
          '--json',
          '--offline',
          '--timezone',
          'UTC',
        ]),
        this.ccusage(['blocks', '--active', '--json', '--offline']),
      ])
      const snapshot = mapClaudeUsagePayloadsToQuotaSnapshot(
        weeklyPayload,
        blocksPayload,
        new Date().toISOString(),
      )
      this.cached = snapshot
      return snapshot
    } catch (err) {
      if (this.cached?.status === 'available') {
        return { ...this.cached, stale: true }
      }

      const message =
        err instanceof Error ? err.message : 'Claude Code usage is unavailable.'
      this.cached = buildClaudeQuotaUnavailableSnapshot(
        message,
        new Date().toISOString(),
      )
      return this.cached
    }
  }
}
