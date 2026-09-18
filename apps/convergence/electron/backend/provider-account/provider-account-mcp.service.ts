import { spawn } from 'child_process'
import { ClaudeAccountMaintenance } from '../provider/claude-code/claude-account-maintenance.service'
import { mapClaudeStatus, parseClaudeListEntries } from '../mcp/claude-mcp.pure'
import type { McpServerStatus } from '../mcp/mcp.types'
import {
  buildClaudeMcpListCommand,
  buildClaudeMcpLoginCommand,
  interpretClaudeMcpLoginOutcome,
  buildCodexMcpListCommand,
  buildCodexMcpLoginCommand,
  buildCodexMcpAddCommand,
  parseCodexMcpList,
} from './provider-account-mcp.pure'
import type { ProviderAccountCommandRunner } from './provider-account-enrolment.service'
import type { ProviderAccountCommand } from './provider-account-enrolment.pure'
import type {
  InteractiveCommandResult,
  ProviderAccountInteractiveRunner,
} from './provider-account-pty-runner'
import { resolveAccountForTurn } from './provider-account-resolution.pure'
import { resolveCodexAccountForTurn } from './provider-account-resolution.pure'
import type { CodexAccountEnvTarget } from './provider-account-codex-env.pure'
import type { ProviderAccountRepository } from './provider-account.repository'

/**
 * Per-account connector authorization (ADR 0007, PA11).
 *
 * Everything here runs the Claude binary *as one account*, because both
 * questions this service answers are account-scoped: "has this account
 * authorized this server" and "authorize this server for this account". The
 * ambient answer to either is a different account's answer.
 *
 * Side effects arrive through the same seam PA3 established — the real
 * `claude mcp login` opens a browser and writes to a keychain slot, so it is
 * only ever run by a person clicking authorize.
 *
 * The two questions need different kinds of child process, which is why there
 * are two runners here rather than one: reading a list is a pipe's job, while
 * authorizing is a terminal's — `claude mcp login` refuses piped stdio (PA11.1).
 */

export interface ProviderAccountConnector {
  transportType?: 'streamable_http' | 'stdio' | 'unknown'
  enabled?: boolean
  disabledReason?: string | null
  name: string
  status: McpServerStatus
  statusLabel: string
  description: string
  /** True when this account has to authorize before the tools work here. */
  needsAuthorization: boolean
}

export interface ProviderAccountConnectorsResult {
  providerAccountId: string | null
  connectors: ProviderAccountConnector[]
  /** Set when the list could not be read at all; connectors is then empty. */
  error: string | null
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

export interface ProviderAccountMcpDeps {
  repository: ProviderAccountRepository
  /** Reads. A pipe is the right shape for `mcp list`. */
  runCommand?: ProviderAccountCommandRunner
  /**
   * Writes. Required rather than defaulted, so no future call site can
   * accidentally authorize through pipes — the failure that shipped once.
   */
  runInteractiveCommand: ProviderAccountInteractiveRunner
  baseEnv?: NodeJS.ProcessEnv
  binaryPath?: string | null
  /**
   * Where to run from. MCP servers can be project-scoped, so the answer
   * genuinely depends on the directory.
   */
  workingDirectory?: () => string
  accountMaintenance?: ClaudeAccountMaintenance
  codexBinaryPath?: string | null
  codexMaintenance?: {
    run<T>(account: CodexAccountEnvTarget, work: () => Promise<T>): Promise<T>
  }
}

export class ProviderAccountMcpService {
  private readonly repository: ProviderAccountRepository
  private readonly runCommand: ProviderAccountCommandRunner
  private readonly runInteractiveCommand: ProviderAccountInteractiveRunner
  private readonly baseEnv: NodeJS.ProcessEnv
  private readonly workingDirectory: () => string
  private binaryPath: string | null
  private readonly accountMaintenance: ClaudeAccountMaintenance
  private codexBinaryPath: string | null
  private readonly codexMaintenance: ProviderAccountMcpDeps['codexMaintenance']

  constructor(deps: ProviderAccountMcpDeps) {
    this.codexBinaryPath = deps.codexBinaryPath ?? null
    this.codexMaintenance = deps.codexMaintenance
    this.repository = deps.repository
    this.runCommand = deps.runCommand ?? defaultRunCommand
    this.runInteractiveCommand = deps.runInteractiveCommand
    this.baseEnv = deps.baseEnv ?? process.env
    this.binaryPath = deps.binaryPath ?? null
    this.workingDirectory = deps.workingDirectory ?? (() => process.cwd())
    this.accountMaintenance =
      deps.accountMaintenance ?? new ClaudeAccountMaintenance()
  }

  setBinaryPath(binaryPath: string | null): void {
    this.binaryPath = binaryPath
  }

  setCodexBinaryPath(binaryPath: string | null): void {
    this.codexBinaryPath = binaryPath
  }

  private codexAccount(accountId: string | null): CodexAccountEnvTarget | null {
    const account = accountId ? this.repository.get(accountId) : null
    return account?.providerId === 'codex'
      ? resolveCodexAccountForTurn({ accountId, account })
      : null
  }

  private codexCommandInput(account: CodexAccountEnvTarget) {
    if (!this.codexBinaryPath)
      throw new Error('Codex is not available on PATH.')
    return {
      binaryPath: this.codexBinaryPath,
      configDir: account.configDir,
      baseEnv: this.baseEnv,
      workingDirectory: this.workingDirectory(),
    }
  }

  private async listCodexConnectors(
    account: CodexAccountEnvTarget,
  ): Promise<ProviderAccountConnector[]> {
    const result = await this.runCommand(
      buildCodexMcpListCommand(this.codexCommandInput(account)),
    )
    if (result.code !== 0)
      throw new Error(
        `Codex could not list connectors (exit code ${result.code}).`,
      )
    return parseCodexMcpList(result.stdout)
  }

  private async runCodexLogin(
    account: CodexAccountEnvTarget,
    serverName: string,
  ): Promise<InteractiveCommandResult> {
    return this.runCodexTerminal(
      buildCodexMcpLoginCommand({
        ...this.codexCommandInput(account),
        serverName,
      }),
    )
  }

  private async runCodexTerminal(
    command: ProviderAccountCommand,
  ): Promise<InteractiveCommandResult> {
    let confirmExit!: () => void
    const exited = new Promise<void>((resolve) => {
      confirmExit = resolve
    })
    const result = await this.runInteractiveCommand(command, {
      onExitConfirmed: confirmExit,
      awaitExitOnTimeout: true,
      redactOutput: true,
    })
    await exited
    if (result.code !== 0)
      throw new Error(
        `Codex connector ${command.args[1]} failed (exit code ${result.code}).`,
      )
    return { code: result.code, output: '' }
  }

  private withCodexMaintenance<T>(
    account: CodexAccountEnvTarget,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!this.codexMaintenance)
      throw new Error(
        'Codex account maintenance is unavailable. No connectors were changed.',
      )
    return this.codexMaintenance.run(account, work)
  }

  async connectLinear(accountId: string): Promise<InteractiveCommandResult> {
    const account = this.codexAccount(accountId)
    if (!account) throw new Error('Connect Linear requires a Codex account.')
    const connectors = await this.listCodexConnectors(account)
    return this.withCodexMaintenance(account, async () => {
      if (!connectors.some((connector) => connector.name === 'linear')) {
        // Codex add can initiate OAuth itself; it needs the same terminal and exit witness.
        await this.runCodexTerminal(
          buildCodexMcpAddCommand({
            ...this.codexCommandInput(account),
            serverName: 'linear',
            url: 'https://mcp.linear.app/mcp',
          }),
        )
      }
      return this.runCodexLogin(account, 'linear')
    })
  }

  /**
   * What this account can and cannot reach.
   *
   * The signal is the provider's own `mcp list` run under the account, rather
   * than the per-account `mcp-needs-auth-cache.json` or the `mcpOAuth` block
   * inside `.claude.json`. Both of those are undocumented internal shapes whose
   * expiry semantics Convergence would have to guess at; `mcp list` is the
   * answer Claude itself gives, and Convergence already parses it.
   */
  async listConnectors(
    accountId: string | null,
  ): Promise<ProviderAccountConnectorsResult> {
    try {
      const account = this.codexAccount(accountId)
      if (account)
        return {
          providerAccountId: accountId,
          connectors: await this.listCodexConnectors(account),
          error: null,
        }
    } catch (error) {
      return {
        providerAccountId: accountId,
        connectors: [],
        error:
          error instanceof Error
            ? error.message
            : 'Failed to list Codex connectors.',
      }
    }
    const binaryPath = this.binaryPath
    if (!binaryPath) {
      return {
        providerAccountId: accountId,
        connectors: [],
        error: 'Claude Code is not available on PATH.',
      }
    }

    let release: (() => void) | undefined
    try {
      release = await this.accountMaintenance.admit(accountId)
      const result = await this.runCommand(
        buildClaudeMcpListCommand({
          binaryPath,
          account: this.resolveAccount(accountId),
          baseEnv: this.baseEnv,
          workingDirectory: this.workingDirectory(),
        }),
      )

      return {
        providerAccountId: accountId,
        connectors: parseClaudeListEntries(result.stdout).map((entry) => {
          const status = mapClaudeStatus(entry.statusLabel)
          return {
            name: entry.name,
            status,
            statusLabel: entry.statusLabel,
            description: entry.description,
            needsAuthorization: status === 'needs-auth',
          }
        }),
        error: null,
      }
    } catch (error) {
      return {
        providerAccountId: accountId,
        connectors: [],
        error:
          error instanceof Error
            ? error.message
            : 'Failed to list connectors for this account.',
      }
    } finally {
      release?.()
    }
  }

  /**
   * Runs the real authorization. One-way door against a credential store: the
   * tokens it writes are namespaced to this account's slot and survive every
   * future swap, which is the whole point — and why running it under the wrong
   * environment would leave the account silently unauthorized.
   *
   * Runs on a terminal because the provider demands one: under pipes the CLI
   * answers "stdin isn't a terminal, so authentication can't be completed
   * here" and nothing is authorized (PA11.1). The browser handoff needs no
   * keystrokes, so nothing is written to it — the PTY exists to satisfy the
   * check, not to be typed into.
   */
  async authorizeConnector(input: {
    accountId: string | null
    serverName: string
    canOpenBrowser?: boolean
  }): Promise<InteractiveCommandResult> {
    const account = this.codexAccount(input.accountId)
    if (account) {
      this.codexCommandInput(account)
      return this.withCodexMaintenance(account, () =>
        this.runCodexLogin(account, input.serverName),
      )
    }
    const release = await this.accountMaintenance.admit(input.accountId)
    let launched = false
    try {
      return await this.runConnectorAuthorization(
        input,
        () => {
          launched = true
        },
        release,
      )
    } finally {
      if (!launched) release()
    }
  }

  private async runConnectorAuthorization(
    input: {
      accountId: string | null
      serverName: string
      canOpenBrowser?: boolean
    },
    launched: () => void,
    release: () => void,
  ): Promise<InteractiveCommandResult> {
    const binaryPath = this.binaryPath
    if (!binaryPath) {
      throw new Error(
        'Claude Code is not available on PATH, so connectors cannot be authorized.',
      )
    }

    const command = buildClaudeMcpLoginCommand({
      binaryPath,
      account: this.resolveAccount(input.accountId),
      serverName: input.serverName,
      baseEnv: this.baseEnv,
      canOpenBrowser: input.canOpenBrowser,
      workingDirectory: this.workingDirectory(),
    })

    let result: InteractiveCommandResult
    try {
      launched()
      result = await this.runInteractiveCommand(command, {
        onExitConfirmed: release,
      })
      release()
    } catch (error) {
      // A terminal that never opened or a ceremony nobody finished. Either way
      // the person needs to know which connector is still unauthorized.
      throw new Error(
        `Authorizing ${input.serverName} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      )
    }

    const outcome = interpretClaudeMcpLoginOutcome({
      exitCode: result.code,
      output: result.output,
    })
    if (!outcome.ok) {
      throw new Error(
        `Authorizing ${input.serverName} failed: ${outcome.message}`,
      )
    }

    return result
  }

  /**
   * Reuses PA4's resolver, so a removed or attestation-disabled account is
   * refused here exactly as it is at spawn — authorizing a connector for an
   * account that cannot serve turns would write tokens nothing will ever use.
   */
  private resolveAccount(accountId: string | null) {
    const account = accountId ? this.repository.get(accountId) : null
    if (account && account.providerId !== 'claude-code') {
      throw new Error(
        'Connector management is only available for Claude Code accounts.',
      )
    }
    return resolveAccountForTurn({
      accountId,
      account,
    })
  }
}
