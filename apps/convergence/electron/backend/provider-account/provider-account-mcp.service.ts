import { spawn } from 'child_process'
import { mapClaudeStatus, parseClaudeListEntries } from '../mcp/claude-mcp.pure'
import type { McpServerStatus } from '../mcp/mcp.types'
import {
  buildClaudeMcpListCommand,
  buildClaudeMcpLoginCommand,
  interpretClaudeMcpLoginOutcome,
} from './provider-account-mcp.pure'
import type { ProviderAccountCommandRunner } from './provider-account-enrolment.service'
import type {
  InteractiveCommandResult,
  ProviderAccountInteractiveRunner,
} from './provider-account-pty-runner'
import { resolveAccountForTurn } from './provider-account-resolution.pure'
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
}

export class ProviderAccountMcpService {
  private readonly repository: ProviderAccountRepository
  private readonly runCommand: ProviderAccountCommandRunner
  private readonly runInteractiveCommand: ProviderAccountInteractiveRunner
  private readonly baseEnv: NodeJS.ProcessEnv
  private readonly workingDirectory: () => string
  private binaryPath: string | null

  constructor(deps: ProviderAccountMcpDeps) {
    this.repository = deps.repository
    this.runCommand = deps.runCommand ?? defaultRunCommand
    this.runInteractiveCommand = deps.runInteractiveCommand
    this.baseEnv = deps.baseEnv ?? process.env
    this.binaryPath = deps.binaryPath ?? null
    this.workingDirectory = deps.workingDirectory ?? (() => process.cwd())
  }

  setBinaryPath(binaryPath: string | null): void {
    this.binaryPath = binaryPath
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
    const binaryPath = this.binaryPath
    if (!binaryPath) {
      return {
        providerAccountId: accountId,
        connectors: [],
        error: 'Claude Code is not available on PATH.',
      }
    }

    try {
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
      result = await this.runInteractiveCommand(command)
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
    return resolveAccountForTurn({
      accountId,
      account: accountId ? this.repository.get(accountId) : null,
    })
  }
}
