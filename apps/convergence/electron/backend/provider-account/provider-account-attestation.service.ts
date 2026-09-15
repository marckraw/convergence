import { promises as nodeFs } from 'fs'
import type { ClaudeAccountMaintenance } from '../provider/claude-code/claude-account-maintenance.service'
import {
  resolveClaudeHealthStatus,
  type ClaudeCredentialHealth,
} from './provider-account-credential-health.pure'
import type { ProviderAccount } from './provider-account.types'
import type { CodexAccountHistoryService } from './provider-account-codex-history.service'
import type { ClaudeAccountHistoryService } from './provider-account-claude-history.service'
import type { ClaudeAccountLayout } from './provider-account-manifest.pure'
import { homedir } from 'os'
import { join } from 'path'
import {
  attestAccountIdentity,
  isAttestationDue,
  type AttestationOutcome,
} from './provider-account-attestation.pure'
import {
  readCodexIdentityFromAuth,
  CODEX_AUTH_FILE_NAME,
} from './provider-account-codex.pure'
import { readClaudeIdentityFromConfig } from './provider-account-enrolment.pure'
import { detectAccountDirDrift } from './provider-account-manifest.pure'
import {
  scanSharedSettingsForCredentials,
  type ProviderAccountSettingsWarning,
} from './provider-account-settings-scan.pure'
import { providerAccountCredentialLayout } from './provider-account.pure'
import type { ProviderAccountRepository } from './provider-account.repository'
import type { ProviderAccountStatus } from './provider-account.types'

/**
 * The net under the undocumented mechanism (PA7).
 *
 * Runs on Claude version change and periodically thereafter. Everything that
 * decides *when* is a seam, so the suite drives the clock instead of waiting on
 * one, and nothing here reaches a real `~/.claude` unless a real app is running
 * it.
 */

export interface ProviderAccountAttestationFs {
  readdir: (path: string) => Promise<string[]>
  readFile: (path: string) => Promise<string>
}

const defaultFs: ProviderAccountAttestationFs = {
  readdir: (path) => nodeFs.readdir(path),
  readFile: (path) => nodeFs.readFile(path, 'utf8'),
}

export interface ProviderAccountAttestationResult {
  accountId: string
  label: string
  email: string | null
  outcome: AttestationOutcome
  identityOutcome?: AttestationOutcome
  credentialHealth?: ClaudeCredentialHealth
  status: ProviderAccountStatus
  detail: string | null
  /** Account-directory entries the manifest does not account for. */
  unknownEntries: string[]
  /** Shared entries that never got linked in. */
  missingLinks: string[]
  nativeHistoryWarnings?: string[]
  claudeHistory?: ClaudeAccountLayout
}

export interface ProviderAccountHealthReport {
  checkedAt: string | null
  claudeVersion: string | null
  accounts: ProviderAccountAttestationResult[]
  /**
   * The channel no environment boundary can close. Re-scanned here rather than
   * only at enrolment, because shared settings change after an account exists.
   */
  settingsWarnings: ProviderAccountSettingsWarning[]
}

const EMPTY_REPORT: ProviderAccountHealthReport = {
  checkedAt: null,
  claudeVersion: null,
  accounts: [],
  settingsWarnings: [],
}

/** Daily drivers, so a day is the natural period. */
export const PROVIDER_ACCOUNT_ATTESTATION_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface ProviderAccountAttestationDeps {
  repository: ProviderAccountRepository
  fs?: ProviderAccountAttestationFs
  homeDir?: string
  now?: () => number
  intervalMs?: number
  claudeVersion?: () => string | null
  codexHistory?: Pick<CodexAccountHistoryService, 'inspect'>
  claudeHistory?: Pick<ClaudeAccountHistoryService, 'inspect'>
  claudeMaintenance?: Pick<ClaudeAccountMaintenance, 'acquire'>
  credentialHealth?: {
    inspect(account: ProviderAccount): Promise<ClaudeCredentialHealth>
  }
}

export class ProviderAccountAttestationService {
  private readonly repository: ProviderAccountRepository
  private readonly fs: ProviderAccountAttestationFs
  private readonly homeDir: string
  private readonly now: () => number
  private readonly intervalMs: number
  private claudeVersion: () => string | null

  private lastCheckedAt: number | null = null
  private lastVersion: string | null = null
  private report: ProviderAccountHealthReport = EMPTY_REPORT
  private revision = 0
  private inFlight: Promise<ProviderAccountHealthReport> | null = null

  constructor(private readonly deps: ProviderAccountAttestationDeps) {
    this.repository = deps.repository
    this.fs = deps.fs ?? defaultFs
    this.homeDir = deps.homeDir ?? homedir()
    this.now = deps.now ?? (() => Date.now())
    this.intervalMs =
      deps.intervalMs ?? PROVIDER_ACCOUNT_ATTESTATION_INTERVAL_MS
    this.claudeVersion = deps.claudeVersion ?? (() => null)
  }

  setClaudeVersion(version: string | null): void {
    this.claudeVersion = () => version
  }

  getHealth(): ProviderAccountHealthReport {
    return this.report
  }

  /** Cheap to call often: returns the previous report unless a check is due. */
  async attestIfDue(): Promise<ProviderAccountHealthReport> {
    const due = isAttestationDue({
      currentVersion: this.claudeVersion(),
      lastVersion: this.lastVersion,
      lastCheckedAt: this.lastCheckedAt,
      now: this.now(),
      intervalMs: this.intervalMs,
    })

    return due ? this.attestAll() : this.report
  }

  /** Hourly wake-up; attestIfDue retains the daily/version-change policy. */
  startMonitoring(onError: () => void = () => {}): () => void {
    const check = () => {
      void this.attestIfDue().catch(onError)
    }
    check()
    const timer = setInterval(check, 60 * 60 * 1000)
    timer.unref?.()
    return () => clearInterval(timer)
  }

  invalidate(accountId: string): void {
    this.revision++
    this.lastCheckedAt = null
    this.report = {
      ...this.report,
      accounts: this.report.accounts.filter(
        (account) => account.accountId !== accountId,
      ),
    }
  }

  attestAll(): Promise<ProviderAccountHealthReport> {
    if (this.inFlight) return this.inFlight
    this.inFlight = this.attestWithRetry().finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  /**
   * An invalidation mid-run discards that collection, but the report must not
   * stay stale until the next hourly tick: collect once more, coalescing any
   * number of invalidations into a single re-run. If invalidations keep
   * arriving through three consecutive re-runs, keep the freshest collection
   * and stamp it, so an invalidate storm cannot starve the report forever.
   */
  private async attestWithRetry(): Promise<ProviderAccountHealthReport> {
    const MAX_RERUNS = 3
    let collected = await this.collectReport()
    let reruns = 0
    while (collected.invalidated) {
      if (reruns >= MAX_RERUNS) return this.commitReport(collected)
      reruns++
      collected = await this.collectReport()
    }
    return collected.report
  }

  private commitReport(collected: {
    report: ProviderAccountHealthReport
    checkedAtMs: number
  }): ProviderAccountHealthReport {
    // One version read per collection, captured when it started: the report
    // and lastVersion must describe the probes that ran, not a version that
    // landed while they were in flight.
    this.lastCheckedAt = collected.checkedAtMs
    this.lastVersion = collected.report.claudeVersion
    this.report = collected.report
    return collected.report
  }

  private async collectReport(): Promise<{
    report: ProviderAccountHealthReport
    checkedAtMs: number
    invalidated: boolean
  }> {
    const revision = this.revision
    const claudeVersion = this.claudeVersion()
    const accounts = this.repository.list()
    const sharedEntries = await this.readdirSafe(join(this.homeDir, '.claude'))
    const checkedAtMs = this.now()

    const results: ProviderAccountAttestationResult[] = []
    for (const snapshot of accounts) {
      let release = () => {}
      if (
        snapshot.providerId === 'claude-code' &&
        this.deps.claudeMaintenance
      ) {
        try {
          release = this.deps.claudeMaintenance.acquire(snapshot.id)
        } catch {
          const current = this.repository.get(snapshot.id)
          if (current)
            results.push({
              accountId: current.id,
              label: current.label,
              email: current.email,
              outcome: 'unreadable',
              identityOutcome: 'unreadable',
              credentialHealth: 'unknown',
              status: current.status,
              detail:
                'Account maintenance is in progress. Health was not checked.',
              unknownEntries: [],
              missingLinks: [],
            })
          continue
        }
      }
      try {
        const account = this.repository.get(snapshot.id)
        if (!account) continue
        // Persisted identity is metadata, not proof of a live credential.
        // Claude health below probes both selected namespaces separately.
        const isConfigHome =
          providerAccountCredentialLayout(account.providerId) === 'config-home'
        const observed = isConfigHome
          ? readCodexIdentityFromAuth(
              await this.readJson(
                join(account.configDir, CODEX_AUTH_FILE_NAME),
              ),
            )
          : readClaudeIdentityFromConfig(
              await this.readJson(join(account.configDir, '.claude.json')),
            )
        const verdict = attestAccountIdentity({
          enrolled: { email: account.email, orgId: account.orgId },
          observed,
        })

        const credentialHealth = !isConfigHome
          ? await (this.deps.credentialHealth?.inspect(account) ??
              Promise.resolve('unknown' as const))
          : undefined
        const latest = this.repository.get(account.id)
        if (!latest) continue
        const status = isConfigHome
          ? (verdict.status ?? latest.status)
          : resolveClaudeHealthStatus(
              latest.status,
              verdict.outcome,
              credentialHealth ?? 'unknown',
            )
        const checkedAt = new Date(checkedAtMs).toISOString()
        if (verdict.outcome === 'verified' && observed) {
          this.repository.saveIdentity(account.id, {
            email: observed.email ?? latest.email,
            orgId: observed.orgId ?? latest.orgId,
            plan: observed.plan,
            status,
            lastValidatedAt: checkedAt,
          })
        } else if (status !== latest.status || verdict.status) {
          this.repository.setStatus(account.id, status, checkedAt)
        }

        // Each provider has a different sharing manifest. Codex's recomputable
        // history warning describes layout, independently of credential identity.
        const drift = isConfigHome
          ? { unknownEntries: [], missingLinks: [] }
          : detectAccountDirDrift({
              sharedEntries,
              accountEntries: await this.readdirSafe(account.configDir),
            })

        results.push({
          accountId: account.id,
          label: account.label,
          email: account.email,
          outcome: verdict.outcome,
          status,
          ...(!isConfigHome
            ? { identityOutcome: verdict.outcome, credentialHealth }
            : {}),
          detail: verdict.detail,
          unknownEntries: drift.unknownEntries,
          missingLinks: drift.missingLinks,
          ...(!isConfigHome && this.deps.claudeHistory
            ? {
                claudeHistory: await this.deps.claudeHistory.inspect(
                  account.configDir,
                ),
              }
            : {}),
          ...(isConfigHome && this.deps.codexHistory
            ? {
                nativeHistoryWarnings: (
                  await this.deps.codexHistory.inspect(account.configDir)
                ).warnings,
              }
            : {}),
        })
      } finally {
        release()
      }
    }

    const settingsWarnings = scanSharedSettingsForCredentials(
      await this.readJson(join(this.homeDir, '.claude', 'settings.json')),
    )
    const candidate: ProviderAccountHealthReport = {
      checkedAt: new Date(checkedAtMs).toISOString(),
      claudeVersion,
      accounts: results,
      settingsWarnings,
    }
    if (revision !== this.revision)
      return { report: candidate, checkedAtMs, invalidated: true }
    return {
      report: this.commitReport({ report: candidate, checkedAtMs }),
      checkedAtMs,
      invalidated: false,
    }
  }

  private async readJson(path: string): Promise<unknown> {
    try {
      return JSON.parse(await this.fs.readFile(path)) as unknown
    } catch {
      return null
    }
  }

  private async readdirSafe(path: string): Promise<string[]> {
    try {
      return await this.fs.readdir(path)
    } catch {
      return []
    }
  }
}
