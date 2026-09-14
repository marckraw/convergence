import { randomUUID } from 'crypto'
import { promises as nodeFs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { spawn } from 'child_process'
import {
  CodexAccountHistoryService,
  codexHistoryFs,
  type CodexHistoryFs,
} from './provider-account-codex-history.service'
import {
  reconcileAccountClaudeConfig,
  isRecord,
} from './provider-account-claude-config.pure'
import { attestAccountIdentity } from './provider-account-attestation.pure'
import {
  buildCodexAccountLoginCommand,
  buildCodexAccountLogoutCommand,
  readCodexIdentityFromAuth,
  CODEX_AUTH_FILE_MODE,
  CODEX_AUTH_FILE_NAME,
  CODEX_HOME_DIR_MODE,
} from './provider-account-codex.pure'
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
  providerAccountCredentialLayout,
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

export interface ProviderAccountFs extends CodexHistoryFs {
  mkdir: (path: string) => Promise<void>
  /** Codex writes its credential as a plaintext file; permissions are ours. */
  chmod: (path: string, mode: number) => Promise<void>
  readdir: (path: string) => Promise<string[]>
  symlink: (target: string, path: string) => Promise<void>
  readFile: (path: string) => Promise<string>
  writeFile: (
    path: string,
    contents: string,
    options?: { flag: 'wx' },
  ) => Promise<void>
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
  ...codexHistoryFs,
  mkdir: async (path) => {
    await nodeFs.mkdir(path, { recursive: true })
  },
  chmod: (path, mode) => nodeFs.chmod(path, mode),
  readdir: (path) => nodeFs.readdir(path),
  symlink: (target, path) => nodeFs.symlink(target, path),
  readFile: (path) => nodeFs.readFile(path, 'utf8'),
  writeFile: (path, contents, options) =>
    nodeFs.writeFile(path, contents, { encoding: 'utf8', ...options }),
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
  /** Provider binaries by registry id, e.g. `{ 'claude-code': '/usr/bin/claude' }`. */
  binaryPaths?: Readonly<Record<string, string | null>>
  /** Holds the account's resident-server admission gate through credential IO. */
  claudeMaintenance?: {
    run<T>(account: ProviderAccount, work: () => Promise<T>): Promise<T>
  }
  codexMaintenance?: {
    run<T>(
      account: ProviderAccount,
      work: () => Promise<T>,
      retire?: boolean,
    ): Promise<T>
  }
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
  private readonly binaryPaths = new Map<string, string>()
  private readonly codexMaintenance: ProviderAccountEnrolmentDeps['codexMaintenance']
  private readonly claudeMaintenance: ProviderAccountEnrolmentDeps['claudeMaintenance']
  private readonly codexHistory: CodexAccountHistoryService

  constructor(deps: ProviderAccountEnrolmentDeps) {
    this.repository = deps.repository
    this.fs = deps.fs ?? defaultFs
    this.runCommand = deps.runCommand ?? defaultRunCommand
    this.homeDir = deps.homeDir ?? homedir()
    this.baseEnv = deps.baseEnv ?? process.env
    this.newAccountId = deps.newAccountId ?? (() => randomUUID())
    this.codexMaintenance = deps.codexMaintenance
    this.claudeMaintenance = deps.claudeMaintenance
    this.codexHistory = new CodexAccountHistoryService({
      homeDir: this.homeDir,
      fs: this.fs,
    })
    for (const [providerId, path] of Object.entries(deps.binaryPaths ?? {})) {
      if (path) this.binaryPaths.set(providerId, path)
    }
  }

  /**
   * Wired from provider detection in main, mirroring the quota services. Kept
   * per provider: enrolling a Codex account must run `codex`, and running the
   * Claude binary instead would authorise a credential store nobody asked for.
   */
  setBinaryPath(providerId: string, binaryPath: string | null): void {
    if (binaryPath) {
      this.binaryPaths.set(providerId, binaryPath)
    } else {
      this.binaryPaths.delete(providerId)
    }
  }

  private get sharedDir(): string {
    return join(this.homeDir, '.claude')
  }

  private get sharedConfigPath(): string {
    return join(this.homeDir, '.claude.json')
  }

  private requireBinaryPath(providerId: string): string {
    const binaryPath = this.binaryPaths.get(providerId)
    if (!binaryPath) {
      throw new Error(
        `${providerId} is not available on PATH, so accounts cannot be enrolled.`,
      )
    }
    return binaryPath
  }

  async scanSharedSettings(): Promise<ProviderAccountSettingsWarning[]> {
    const settings = await this.readJson(join(this.sharedDir, 'settings.json'))
    return scanSharedSettingsForCredentials(settings)
  }

  async enrol(
    input: EnrolProviderAccountInput,
  ): Promise<EnrolProviderAccountResult> {
    const providerId = input.providerId ?? DEFAULT_PROVIDER_ID
    if (providerAccountCredentialLayout(providerId) === 'config-home') {
      return this.enrolCodexAccount(input, providerId)
    }

    const binaryPath = this.requireBinaryPath(providerId)
    const email = input.email.trim()
    if (!email) {
      throw new Error('Enrolment requires the email address of the account.')
    }

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
      throw new Error('Claude sign-in did not complete. Try connecting again.')
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

  /**
   * Signs an existing account in again, in place.
   *
   * The two directories are reused rather than re-derived: both are hashed into
   * the keychain service name, so a reconnect that minted fresh paths would
   * authorise a slot no spawn ever looks in. The identity is then re-attested
   * against the enrolled one and the account is refused if it comes back as
   * somebody else — signing into the wrong browser session is the easy mistake
   * here, and rebinding the row would retroactively falsify every turn PA4
   * attributed to this account.
   */
  async reconnect(accountId: string): Promise<ProviderAccount> {
    const account = this.repository.get(accountId)
    if (!account) {
      throw new Error(`Provider account ${accountId} is not enrolled.`)
    }

    if (providerAccountCredentialLayout(account.providerId) === 'config-home') {
      return this.reconnectCodexAccount(account)
    }

    const email = account.email?.trim()
    if (!email) {
      throw new Error(
        `${account.label} has no recorded email to sign in as. Remove it and enrol again.`,
      )
    }

    const binaryPath = this.requireBinaryPath(account.providerId)

    return this.withClaudeAccountStopped(account, async () => {
      const configPath = join(account.configDir, '.claude.json')
      let originalConfig: string | null
      try {
        originalConfig = await this.fs.readFile(configPath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new Error(
            'The account config could not be read. Reconnect was not started; no credentials were changed.',
            { cause: error },
          )
        }
        originalConfig = null
      }
      this.repository.setStatus(accountId, 'unavailable', null)
      // Re-seeded because a shared entry added since enrolment would otherwise
      // stay unlinked, and an existing link is left alone.
      await this.seedSymlinks(account.configDir)

      let result: ProviderAccountCommandResult
      try {
        result = await this.runCommand(
          buildProviderAccountLoginCommand({
            binaryPath,
            configDir: account.configDir,
            credentialDir: account.credentialDir,
            email,
            baseEnv: this.baseEnv,
          }),
        )
      } catch {
        return this.refuseClaudeReconnect(
          account,
          binaryPath,
          originalConfig,
          'Claude sign-in could not complete.',
        )
      }

      if (result.code !== 0) {
        return this.refuseClaudeReconnect(
          account,
          binaryPath,
          originalConfig,
          'Claude sign-in did not complete. Try reconnecting again.',
        )
      }

      const identity = readClaudeIdentityFromConfig(
        await this.readJson(join(account.configDir, '.claude.json')),
      )
      const verdict = attestAccountIdentity({
        enrolled: { email: account.email, orgId: account.orgId },
        observed: identity,
      })
      if (verdict.outcome !== 'verified' || !identity) {
        return this.refuseClaudeReconnect(
          account,
          binaryPath,
          originalConfig,
          'Login did not verify the originally enrolled Claude account. Choose that account and organization in the browser.',
        )
      }

      this.repository.saveIdentity(accountId, {
        email: identity.email ?? account.email,
        orgId: identity.orgId ?? account.orgId,
        plan: identity.plan,
        status: 'connected',
        lastValidatedAt: new Date().toISOString(),
      })

      const reconnected = this.repository.get(accountId)
      if (!reconnected) {
        throw new Error(`Failed to read back provider account ${accountId}`)
      }
      return reconnected
    })
  }

  private async refuseClaudeReconnect(
    account: ProviderAccount,
    binaryPath: string,
    originalConfig: string | null,
    reason: string,
  ): Promise<never> {
    let discarded = false
    let restored = false
    try {
      await this.runLogout(binaryPath, account.credentialDir, account.id)
      discarded = true
    } catch {
      // Never surface command output: OAuth output can contain credentials.
    }
    try {
      const configPath = join(account.configDir, '.claude.json')
      if (originalConfig === null) await this.fs.rm(configPath)
      else await this.fs.writeFile(configPath, originalConfig)
      restored = true
    } catch {
      // A failed restore must not mask a failed credential discard.
    }
    throw new Error(
      `${reason} ${discarded ? 'The unverified login was discarded.' : 'The foreign credential could NOT be removed; retry reconnect or removal.'} ${restored ? '' : 'The previous account config could NOT be restored. '}The account remains unavailable.`,
    )
  }

  private async withClaudeAccountStopped<T>(
    account: ProviderAccount,
    work: () => Promise<T>,
  ): Promise<T> {
    if (account.executionHostId !== 'local')
      throw new Error(
        'Claude account management is available on this machine only.',
      )
    if (!this.claudeMaintenance)
      throw new Error(
        'Claude account maintenance is unavailable. No credentials were changed.',
      )
    return this.claudeMaintenance.run(account, work)
  }

  private async withCodexAccountStopped<T>(
    account: ProviderAccount,
    work: () => Promise<T>,
    retire = false,
  ): Promise<T> {
    if (account.executionHostId !== 'local') {
      throw new Error(
        'OpenAI account management is available on this machine only.',
      )
    }
    if (!this.codexMaintenance) {
      throw new Error(
        'Codex account maintenance is unavailable. No credentials were changed.',
      )
    }
    return this.codexMaintenance.run(account, work, retire)
  }

  private async reconnectCodexAccount(
    account: ProviderAccount,
  ): Promise<ProviderAccount> {
    const binaryPath = this.requireBinaryPath(account.providerId)
    if (!account.orgId) {
      throw new Error(
        'This OpenAI account has no recorded ChatGPT account ID. Enrol it again to verify its identity.',
      )
    }
    return this.withCodexAccountStopped(account, async () => {
      // A browser can return a different workspace for the same email. Never
      // relabel historical turns to that new identity, even when login succeeds.
      this.repository.setStatus(account.id, 'unavailable', null)
      await this.fs.chmod(account.configDir, CODEX_HOME_DIR_MODE)
      const result = await this.runCommand(
        buildCodexAccountLoginCommand({
          binaryPath,
          configDir: account.configDir,
          baseEnv: this.baseEnv,
        }),
      )
      if (result.code !== 0) {
        throw new Error(
          `codex login failed: ${result.stderr.trim() || `exit code ${result.code}`}`,
        )
      }
      const authPath = join(account.configDir, CODEX_AUTH_FILE_NAME)
      await this.fs.chmod(authPath, CODEX_AUTH_FILE_MODE)
      const identity = readCodexIdentityFromAuth(await this.readJson(authPath))
      if (!identity?.orgId) {
        return this.refuseCodexReconnect(
          authPath,
          'Login completed but the Codex home reported no ChatGPT account ID.',
        )
      }
      if (identity.orgId !== account.orgId) {
        return this.refuseCodexReconnect(
          authPath,
          'Login selected a different ChatGPT account or workspace. Reconnect the originally enrolled account; its historical identity was not changed.',
        )
      }
      this.repository.saveIdentity(account.id, {
        ...identity,
        status: 'connected',
        lastValidatedAt: new Date().toISOString(),
      })
      await this.codexHistory.migrate(account.configDir)
      const reconnected = this.repository.get(account.id)
      if (!reconnected)
        throw new Error('The OpenAI account was removed while reconnecting.')
      return reconnected
    })
  }

  private async refuseCodexReconnect(
    authPath: string,
    reason: string,
  ): Promise<never> {
    try {
      await this.fs.rm(authPath)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(
        `${reason} The foreign credential could NOT be removed: ${detail}. The account remains unavailable.`,
        { cause: error },
      )
    }
    throw new Error(
      `${reason} The unverified login was discarded; the account remains unavailable.`,
    )
  }

  /**
   * Codex enrolment (ADR 0007, PA9).
   *
   * Same model, same seams, same attestation net — the differences are
   * genuinely Codex's: `codex login` takes no email because it authorises
   * whatever ChatGPT session the browser holds. Credentials and runtime state
   * remain private; only the reviewed conversation entries join shared storage.
   * File credential storage is explicit, so the observed identity and the
   * runtime use the same store; managed-policy conflicts remain CLI failures.
   */
  private async enrolCodexAccount(
    input: EnrolProviderAccountInput,
    providerId: string,
  ): Promise<EnrolProviderAccountResult> {
    if (input.executionHostId && input.executionHostId !== 'local') {
      throw new Error(
        'OpenAI account enrollment is available on this machine only.',
      )
    }
    const binaryPath = this.requireBinaryPath(providerId)
    const accountId = this.newAccountId()
    const configDir = deriveProviderAccountConfigDir({
      homeDir: this.homeDir,
      providerId,
      accountId,
    })

    await this.fs.mkdir(configDir)
    // MAR-2207: owner-only home, not just an owner-only credential file.
    await this.fs.chmod(configDir, CODEX_HOME_DIR_MODE)
    const configPath = join(configDir, 'config.toml')
    await this.fs.writeFile(
      configPath,
      'cli_auth_credentials_store = "file"\n',
      { flag: 'wx' },
    )
    await this.fs.chmod(configPath, CODEX_AUTH_FILE_MODE)
    const historyLayout = await this.codexHistory.migrate(configDir)

    const result = await this.runCommand(
      buildCodexAccountLoginCommand({
        binaryPath,
        configDir,
        baseEnv: this.baseEnv,
      }),
    )

    if (result.code !== 0) {
      throw new Error(
        `codex login failed: ${result.stderr.trim() || `exit code ${result.code}`}`,
      )
    }

    const authPath = join(configDir, CODEX_AUTH_FILE_NAME)
    const identity = readCodexIdentityFromAuth(await this.readJson(authPath))
    if (!identity) {
      // Directories stay behind for the sweep to reclaim. Guessing an identity
      // here is exactly the mistake the ADR forbids.
      throw new Error(
        'Login completed but the Codex home reported no identity. ' +
          'The account was not enrolled.',
      )
    }

    // The keychain does this for Claude. Here it is the filesystem's job, and
    // a world-readable auth.json is a credential anyone on the box can copy.
    await this.fs.chmod(authPath, CODEX_AUTH_FILE_MODE)

    const account = this.repository.create({
      id: accountId,
      providerId,
      label: deriveProviderAccountLabel(
        identity.email ?? (input.email.trim() || accountId),
        input.label,
      ),
      authKind: 'subscription-oauth',
      configDir,
      // Codex keeps the credential inside the home. Recording a second,
      // permanently empty directory would describe a namespace that is not
      // there.
      credentialDir: configDir,
      executionHostId: input.executionHostId ?? 'local',
      email: identity.email,
      orgId: identity.orgId,
      plan: identity.plan,
      status: 'connected',
      lastValidatedAt: new Date().toISOString(),
    })

    return {
      account,
      warnings: historyLayout.warnings.map((message) => ({
        kind: 'native-history-layout',
        key: 'codex.history',
        message,
      })),
    }
  }

  async remove(accountId: string): Promise<void> {
    const account = this.repository.get(accountId)
    if (!account) return

    const layout = providerAccountCredentialLayout(account.providerId)
    if (layout === 'config-home' && account.executionHostId === 'local') {
      return this.withCodexAccountStopped(
        account,
        async () => {
          this.repository.setStatus(account.id, 'unavailable', null)
          await this.removeAccount(account)
        },
        true,
      )
    }
    if (layout === 'config-home' || account.executionHostId !== 'local')
      return this.removeAccount(account)
    return this.withClaudeAccountStopped(account, async () => {
      this.repository.setStatus(account.id, 'unavailable', null)
      await this.removeAccount(account)
    })
  }

  private async removeAccount(account: ProviderAccount): Promise<void> {
    const accountId = account.id
    const layout = providerAccountCredentialLayout(account.providerId)
    const binaryPath =
      layout === 'config-home'
        ? this.binaryPaths.get(account.providerId)
        : this.requireBinaryPath(account.providerId)

    if (binaryPath) {
      if (layout === 'config-home') {
        // Scoped to this account's own home, so the shared `~/.codex` login is
        // untouched — the Codex equivalent of the throwaway-config-dir rule.
        await this.runCommand(
          buildCodexAccountLogoutCommand({
            binaryPath,
            configDir: account.configDir,
            baseEnv: this.baseEnv,
          }),
        )
      } else {
        await this.runLogout(binaryPath, account.credentialDir, accountId)
      }
    }

    this.repository.remove(accountId)

    const configRoot = deriveProviderAccountConfigRoot(
      this.homeDir,
      account.providerId,
    )
    assertRemovableAccountDir(account.configDir, configRoot)
    await this.fs.rm(account.configDir)

    if (layout === 'config-home') return

    const credentialRoot = deriveProviderAccountCredentialRoot(
      this.homeDir,
      account.providerId,
    )
    assertRemovableAccountDir(account.credentialDir, credentialRoot)
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

    const binaryPath = orphans.length
      ? this.requireBinaryPath(providerId)
      : null
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
      const result = await this.runCommand(
        buildProviderAccountLogoutCommand({
          binaryPath,
          throwawayConfigDir,
          credentialDir,
          baseEnv: this.baseEnv,
        }),
      )
      if (result.code !== 0)
        throw new Error(
          'Claude sign-out failed. The account remains unavailable; retry reconnect or removal.',
        )
    } catch {
      throw new Error(
        'Claude sign-out failed. The account remains unavailable; retry reconnect or removal.',
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
