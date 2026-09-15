import { execFile } from 'child_process'
import { tmpdir } from 'os'
import { buildClaudeAccountEnv } from './provider-account-env.pure'
import type { ProviderAccountCommand } from './provider-account-enrolment.pure'
import type { ProviderAccount } from './provider-account.types'
import {
  classifyClaudeCredentialHealth,
  type ClaudeCredentialHealth,
} from './provider-account-credential-health.pure'

type StatusRunner = (
  command: ProviderAccountCommand,
) => Promise<{ code: number | null; stdout: string }>

/**
 * The Claude CLI treats its cwd as a project: it reads a `.claude/` tree there
 * and records `projects[<cwd>]` into `.claude.json`. Probing from inside an
 * account's own config dir would make the account a project of itself, so
 * the probe runs from a neutral directory outside every account's
 * config/credential dir and outside any repository.
 */
const NEUTRAL_PROBE_CWD = tmpdir()

const runStatus: StatusRunner = (command) =>
  new Promise((resolve) => {
    execFile(
      command.command,
      command.args,
      {
        env: command.env,
        cwd: command.cwd,
        timeout: 10_000,
        killSignal: 'SIGKILL',
        maxBuffer: 64 * 1024,
        encoding: 'utf8',
      },
      (error, stdout) => {
        // Numeric exit 1 is the CLI's documented logged-out result. Signals,
        // spawn failures and oversized output are unknown, never an auth failure.
        resolve({
          code: error
            ? typeof error.code === 'number' && !error.killed
              ? error.code
              : null
            : 0,
          stdout,
        })
      },
    )
  })

export class ClaudeCredentialHealthService {
  private binaryPath: string | null = null
  constructor(
    private readonly deps: {
      run?: StatusRunner
      baseEnv?: NodeJS.ProcessEnv
    } = {},
  ) {}
  setBinaryPath(path: string | null): void {
    this.binaryPath = path
  }

  async inspect(account: ProviderAccount): Promise<ClaudeCredentialHealth> {
    if (
      !account.configDir ||
      !account.credentialDir ||
      !this.binaryPath ||
      account.providerId !== 'claude-code' ||
      account.executionHostId !== 'local'
    )
      return 'unknown'
    try {
      const result = await (this.deps.run ?? runStatus)({
        command: this.binaryPath,
        args: ['auth', 'status'],
        cwd: NEUTRAL_PROBE_CWD,
        env: buildClaudeAccountEnv({
          baseEnv: this.deps.baseEnv ?? process.env,
          account: {
            configDir: account.configDir,
            credentialDir: account.credentialDir,
          },
        }),
      })
      return classifyClaudeCredentialHealth(result.code, result.stdout)
    } catch {
      return 'unknown'
    }
  }
}
