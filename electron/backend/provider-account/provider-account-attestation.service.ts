import { promises as nodeFs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import {
  attestAccountIdentity,
  isAttestationDue,
  type AttestationOutcome,
} from './provider-account-attestation.pure'
import { readClaudeIdentityFromConfig } from './provider-account-enrolment.pure'
import { detectAccountDirDrift } from './provider-account-manifest.pure'
import {
  scanSharedSettingsForCredentials,
  type ProviderAccountSettingsWarning,
} from './provider-account-settings-scan.pure'
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
  status: ProviderAccountStatus
  detail: string | null
  /** Account-directory entries the manifest does not account for. */
  unknownEntries: string[]
  /** Shared entries that never got linked in. */
  missingLinks: string[]
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

  constructor(deps: ProviderAccountAttestationDeps) {
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

  async attestAll(): Promise<ProviderAccountHealthReport> {
    const accounts = this.repository.list()
    const sharedEntries = await this.readdirSafe(join(this.homeDir, '.claude'))
    const checkedAtMs = this.now()

    const results: ProviderAccountAttestationResult[] = []
    for (const account of accounts) {
      const observed = readClaudeIdentityFromConfig(
        await this.readJson(join(account.configDir, '.claude.json')),
      )
      const verdict = attestAccountIdentity({
        enrolled: { email: account.email, orgId: account.orgId },
        observed,
      })

      // A null status means "no evidence" — an unreadable file must not
      // disable an account that is probably fine.
      if (verdict.status) {
        this.repository.setStatus(
          account.id,
          verdict.status,
          new Date(checkedAtMs).toISOString(),
        )
      }

      const drift = detectAccountDirDrift({
        sharedEntries,
        accountEntries: await this.readdirSafe(account.configDir),
      })

      results.push({
        accountId: account.id,
        label: account.label,
        email: account.email,
        outcome: verdict.outcome,
        status: verdict.status ?? account.status,
        detail: verdict.detail,
        unknownEntries: drift.unknownEntries,
        missingLinks: drift.missingLinks,
      })
    }

    this.lastCheckedAt = checkedAtMs
    this.lastVersion = this.claudeVersion()
    this.report = {
      checkedAt: new Date(checkedAtMs).toISOString(),
      claudeVersion: this.lastVersion,
      accounts: results,
      settingsWarnings: scanSharedSettingsForCredentials(
        await this.readJson(join(this.homeDir, '.claude', 'settings.json')),
      ),
    }

    return this.report
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
