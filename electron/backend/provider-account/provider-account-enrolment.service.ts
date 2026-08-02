import { randomUUID } from 'crypto'
import { promises as nodeFs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { spawn } from 'child_process'
import {
  reconcileAccountClaudeConfig,
  isRecord,
} from './provider-account-claude-config.pure'
import {
  buildProviderAccountLoginCommand,
  buildProviderAccountLogoutCommand,
  deriveProviderAccountLabel,
  findOrphanCredentialDirs,
  readClaudeIdentityFromConfig,
  type ProviderAccountCommand,
} from './provider-account-enrolment.pure'
import { planAccountDirEntries } from './provider-account-manifest.pure'
import {
  scanSharedSettingsForCredentials,
  type ProviderAccountSettingsWarning,
} from './provider-account-settings-scan.pure'
import {
  assertRemovableAccountDir,
  deriveProviderAccountConfigDir,
  deriveProviderAccountConfigRoot,
  deriveProviderAccountCredentialDir,
  deriveProviderAccountCredentialRoot,
} from './provider-account.pure'
import type { ProviderAccountRepository } from './provider-account.repository'
import type { ProviderAccount } from './provider-account.types'

/**
 * Enrolment, removal and orphan sweeping for provider accounts (ADR 0007, PA3).
 *
 * Every side effect this service performs — filesystem, subprocess, clock,
 * identifier — arrives through a seam, because the real versions are one-way
 * doors against a credential store. Tests drive the fakes; the real
 * `claude auth login` is only ever run by a person clicking enrol.
 *
 * **Keychain slots are bound to the macOS username.** The slot's account field
 * is `$USER`, so a new Mac, or the same Mac under a different username, cannot
 * see credentials enrolled elsewhere even with byte-identical directory paths.
 * Re-enrolment is the only path; the account rows and directories survive, but
 * the credentials behind them do not travel.
 */

export interface ProviderAccountFs {
  mkdir: (path: string) => Promise<void>
  readdir: (path: string) => Promise<string[]>
  symlink: (target: string, path: string) => Promise<void>
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, contents: string) => Promise<void>
  rm: (path: string) => Promise<void>
}

export interface ProviderAccountCommandResult {
  code: number
  stdout: string
  stderr: string
}

export type ProviderAccountCommandRunner = (
  command: ProviderAccountCommand,
) => Promise<ProviderAccountCommandResult>

const defaultFs: ProviderAccountFs = {
  mkdir: async (path) => {
    await nodeFs.mkdir(path, { recursive: true })
  },
  readdir: (path) => nodeFs.readdir(path),
  symlink: (target, path) => nodeFs.symlink(target, path),
  readFile: (path) => nodeFs.readFile(path, 'utf8'),
  writeFile: (path, contents) => nodeFs.writeFile(path, contents, 'utf8'),
  rm: async (path) => {
    await nodeFs.rm(path, { recursive: true, force: true })
  },
}

const defaultRunCommand: ProviderAccountCommandRunner = (command) =>
  new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: command.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })

export interface ProviderAccountEnrolmentDeps {
  repository: ProviderAccountRepository
  fs?: ProviderAccountFs
  runCommand?: ProviderAccountCommandRunner
  homeDir?: string
  baseEnv?: NodeJS.ProcessEnv
  newAccountId?: () => string
  binaryPath?: string | null
}

export interface EnrolProviderAccountInput {
  email: string
  label?: string | null
  providerId?: string
  executionHostId?: string
}

export interface EnrolProviderAccountResult {
  account: ProviderAccount
  /**
   * Shared-settings findings. Non-fatal by design: the user may have a reason,
   * and refusing to enrol would not remove the credential. Loud, not blocking.
   */
  warnings: ProviderAccountSettingsWarning[]
}

const DEFAULT_PROVIDER_ID = 'claude-code'

export class ProviderAccountEnrolmentService {
  private readonly repository: ProviderAccountRepository
  private readonly fs: ProviderAccountFs
  private readonly runCommand: ProviderAccountCommandRunner
  private readonly homeDir: string
  private readonly baseEnv: NodeJS.ProcessEnv
  private readonly newAccountId: () => string
  private binaryPath: string | null

  constructor(deps: ProviderAccountEnrolmentDeps) {
    this.repository = deps.repository
    this.fs = deps.fs ?? defaultFs
    this.runCommand = deps.runCommand ?? defaultRunCommand
    this.homeDir = deps.homeDir ?? homedir()
    this.baseEnv = deps.baseEnv ?? process.env
    this.newAccountId = deps.newAccountId ?? (() => randomUUID())
    this.binaryPath = deps.binaryPath ?? null
  }

  /** Wired from provider detection in main, mirroring the quota services. */
  setBinaryPath(binaryPath: string | null): void {
    this.binaryPath = binaryPath
  }

  private get sharedDir(): string {
    return join(this.homeDir, '.claude')
  }

  private get sharedConfigPath(): string {
    return join(this.homeDir, '.claude.json')
  }

  private requireBinaryPath(): string {
    if (!this.binaryPath) {
      throw new Error(
        'Claude Code is not available on PATH, so accounts cannot be enrolled.',
      )
    }
    return this.binaryPath
  }

  async scanSharedSettings(): Promise<ProviderAccountSettingsWarning[]> {
    const settings = await this.readJson(join(this.sharedDir, 'settings.json'))
    return scanSharedSettingsForCredentials(settings)
  }

  async enrol(
    input: EnrolProviderAccountInput,
  ): Promise<EnrolProviderAccountResult> {
    const binaryPath = this.requireBinaryPath()
    const email = input.email.trim()
    if (!email) {
      throw new Error('Enrolment requires the email address of the account.')
    }

    const providerId = input.providerId ?? DEFAULT_PROVIDER_ID
    const accountId = this.newAccountId()
    const dirInput = { homeDir: this.homeDir, providerId, accountId }
    const configDir = deriveProviderAccountConfigDir(dirInput)
    const credentialDir = deriveProviderAccountCredentialDir(dirInput)

    await this.fs.mkdir(configDir)
    await this.fs.mkdir(credentialDir)
    await this.seedSymlinks(configDir)
    await this.seedAccountConfig(configDir)

    const warnings = await this.scanSharedSettings()

    const result = await this.runCommand(
      buildProviderAccountLoginCommand({
        binaryPath,
        configDir,
        credentialDir,
        email,
        baseEnv: this.baseEnv,
      }),
    )

    if (result.code !== 0) {
      throw new Error(
        `claude auth login failed: ${result.stderr.trim() || `exit code ${result.code}`}`,
      )
    }

    const identity = readClaudeIdentityFromConfig(
      await this.readJson(join(configDir, '.claude.json')),
    )
    if (!identity) {
      // The directories stay behind deliberately: the sweep reclaims them, and
      // guessing an identity here is exactly the mistake the ADR forbids.
      throw new Error(
        'Login completed but the account directory reported no identity. ' +
          'The account was not enrolled.',
      )
    }

    const account = this.repository.create({
      id: accountId,
      providerId,
      label: deriveProviderAccountLabel(identity.email ?? email, input.label),
      authKind: 'subscription-oauth',
      configDir,
      credentialDir,
      executionHostId: input.executionHostId ?? 'local',
      email: identity.email,
      orgId: identity.orgId,
      plan: identity.plan,
      status: 'connected',
      lastValidatedAt: new Date().toISOString(),
    })

    return { account, warnings }
  }

  async remove(accountId: string): Promise<void> {
    const account = this.repository.get(accountId)
    if (!account) return

    const binaryPath = this.binaryPath
    if (binaryPath) {
      await this.runLogout(binaryPath, account.credentialDir, accountId)
    }

    this.repository.remove(accountId)

    const configRoot = deriveProviderAccountConfigRoot(
      this.homeDir,
      account.providerId,
    )
    const credentialRoot = deriveProviderAccountCredentialRoot(
      this.homeDir,
      account.providerId,
    )
    assertRemovableAccountDir(account.configDir, configRoot)
    assertRemovableAccountDir(account.credentialDir, credentialRoot)

    await this.fs.rm(account.configDir)
    await this.fs.rm(account.credentialDir)
  }

  /**
   * Credential namespaces with no row behind them — an abandoned login, or a
   * row removed while its slot survived. Each is logged out through the
   * documented command rather than by deleting a keychain entry directly.
   */
  async sweepOrphanCredentialNamespaces(
    providerId = DEFAULT_PROVIDER_ID,
  ): Promise<string[]> {
    const credentialRoot = deriveProviderAccountCredentialRoot(
      this.homeDir,
      providerId,
    )
    const entriesOnDisk = await this.readdirSafe(credentialRoot)
    const orphans = findOrphanCredentialDirs({
      credentialRoot,
      entriesOnDisk,
      enrolledCredentialDirs: this.repository
        .listByProvider(providerId)
        .map((account) => account.credentialDir),
    })

    const binaryPath = this.binaryPath
    const swept: string[] = []
    for (const orphan of orphans) {
      if (binaryPath) {
        await this.runLogout(binaryPath, orphan, `sweep-${swept.length}`)
      }
      await this.fs.rm(orphan)
      swept.push(orphan)
    }

    return swept
  }

  private async runLogout(
    binaryPath: string,
    credentialDir: string,
    scratchKey: string,
  ): Promise<void> {
    const throwawayConfigDir = join(
      this.homeDir,
      '.convergence',
      'tmp',
      `logout-${scratchKey}`,
    )
    await this.fs.mkdir(throwawayConfigDir)

    try {
      await this.runCommand(
        buildProviderAccountLogoutCommand({
          binaryPath,
          throwawayConfigDir,
          credentialDir,
          baseEnv: this.baseEnv,
        }),
      )
    } finally {
      await this.fs.rm(throwawayConfigDir)
    }
  }

  /**
   * Default-shared: every entry upstream is linked in unless the manifest keeps
   * it per-account. An entry that already exists is left alone — re-seeding
   * must never clobber real state.
   */
  private async seedSymlinks(configDir: string): Promise<void> {
    const sharedEntries = await this.readdirSafe(this.sharedDir)
    const plan = planAccountDirEntries(sharedEntries)

    for (const entry of plan.shared) {
      try {
        await this.fs.symlink(
          join(this.sharedDir, entry),
          join(configDir, entry),
        )
      } catch {
        // Already present, or the shared entry vanished between readdir and
        // symlink. Neither is worth failing an enrolment over.
      }
    }
  }

  /**
   * Seeds the account's own `.claude.json` with the shared server list. Trust
   * is deliberately left to the spawn-time reconciler, which knows the session's
   * working directory; there is no meaningful one at enrolment.
   */
  private async seedAccountConfig(configDir: string): Promise<void> {
    const sharedConfig = await this.readJson(this.sharedConfigPath)
    const reconciled = reconcileAccountClaudeConfig({
      accountConfig: null,
      sharedConfig: isRecord(sharedConfig) ? sharedConfig : null,
    })

    await this.fs.writeFile(
      join(configDir, '.claude.json'),
      `${JSON.stringify(reconciled.config, null, 2)}\n`,
    )
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
