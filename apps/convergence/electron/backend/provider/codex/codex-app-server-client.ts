import { spawn, type ChildProcess, type SpawnOptions } from 'child_process'
import {
  buildCodexAccountEnv,
  type CodexAccountEnvTarget,
} from '../../provider-account/provider-account-codex-env.pure'
import { buildCodexClientInfo } from './codex-client-info.pure'
import { JsonRpcClient } from './jsonrpc'

export interface CodexSkillsListOptions {
  forceReload?: boolean
}

export type CodexAppServerSpawn = (
  binaryPath: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess

export interface CodexAppServerClientOptions {
  timeoutMs?: number
  spawnProcess?: CodexAppServerSpawn
  /** Reported to Codex in the initialize handshake; feeds its compliance log. */
  appVersion?: string | null
  /**
   * The account whose `CODEX_HOME` this server should read (ADR 0007, PA9).
   * Null is the ambient `~/.codex` login, which is what every caller got before
   * accounts existed.
   */
  account?: CodexAccountEnvTarget | null
}

function formatExitError(
  code: number | null,
  signal: NodeJS.Signals | null,
  stderr: string,
): Error {
  const reason =
    code !== null
      ? `exited with code ${code}`
      : `exited with signal ${signal ?? 'unknown'}`
  const details = stderr.trim()
  return new Error(`codex app-server ${reason}${details ? `: ${details}` : ''}`)
}

export class CodexAppServerClient {
  private timeoutMs: number
  private spawnProcess: CodexAppServerSpawn
  private appVersion: string | null
  private account: CodexAccountEnvTarget | null

  constructor(
    private binaryPath: string,
    options: CodexAppServerClientOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.spawnProcess = options.spawnProcess ?? spawn
    this.appVersion = options.appVersion ?? null
    this.account = options.account ?? null
  }

  async listSkills(
    projectPath: string,
    options: CodexSkillsListOptions = {},
  ): Promise<unknown> {
    return this.withServer(projectPath, (rpc) =>
      rpc.request('skills/list', {
        cwds: [projectPath],
        forceReload: options.forceReload === true,
      }),
    )
  }

  /**
   * Official quota read. Codex answers this from its own authenticated
   * session, so Convergence never has to touch the user's raw token.
   */
  async readRateLimits(cwd: string = process.cwd()): Promise<unknown> {
    return this.withServer(cwd, (rpc) =>
      rpc.request('account/rateLimits/read', {}),
    )
  }

  private async withServer<T>(
    cwd: string,
    run: (rpc: JsonRpcClient) => Promise<T>,
  ): Promise<T> {
    const child = this.spawnProcess(this.binaryPath, ['app-server'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: buildCodexAccountEnv({
        baseEnv: process.env,
        account: this.account,
      }),
    })
    let stderr = ''
    let timeout: NodeJS.Timeout | null = null

    if (!child.stdin || !child.stdout) {
      throw new Error('codex app-server did not expose stdio pipes')
    }

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    const rpc = new JsonRpcClient(child.stdin, child.stdout)
    const operation = (async () => {
      await rpc.request('initialize', {
        clientInfo: buildCodexClientInfo(this.appVersion),
        capabilities: {
          experimentalApi: true,
        },
      })
      rpc.notify('initialized')
      return run(rpc)
    })()

    const exit = new Promise<never>((_resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        reject(formatExitError(code, signal, stderr))
      })
    })

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        try {
          child.kill('SIGTERM')
        } catch {
          // Process may have already exited.
        }
        reject(
          new Error(`codex app-server timed out after ${this.timeoutMs}ms`),
        )
      }, this.timeoutMs)
    })

    try {
      return await Promise.race([operation, exit, timeoutPromise])
    } finally {
      if (timeout) {
        clearTimeout(timeout)
      }
      rpc.destroy()
      if (child.exitCode === null && !child.killed) {
        try {
          child.kill('SIGTERM')
        } catch {
          // Process may have already exited.
        }
      }
    }
  }
}
