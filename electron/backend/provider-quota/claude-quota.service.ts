import { execFile } from 'child_process'
import { createRequire } from 'module'
import { CLAUDE_QUOTA_CACHE_TTL_MS } from './claude-quota.constants'
import {
  buildClaudeQuotaUnavailableSnapshot,
  mapClaudeUsagePayloadsToQuotaSnapshot,
  resolveCcusageNativeBinaryPath,
  resolveCcusageNativePackageName,
} from './claude-quota.pure'
import type { ProviderQuotaSnapshot } from './provider-quota.types'

type CcusageRunner = (args: string[]) => Promise<unknown>

const requireFromHere = createRequire(import.meta.url)

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
    return requireFromHere.resolve(`${packageName}/${binaryPath}`)
  } catch {
    return 'ccusage'
  }
}

function runCcusage(args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    execFile(
      resolveCcusageBinary(),
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

  constructor(private readonly ccusage: CcusageRunner = runCcusage) {}

  async getQuota(options: { forceRefresh?: boolean } = {}) {
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
