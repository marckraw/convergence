import { spawn, type ChildProcess, type SpawnOptions } from 'child_process'
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

  constructor(
    private binaryPath: string,
    options: CodexAppServerClientOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.spawnProcess = options.spawnProcess ?? spawn
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

  private async withServer<T>(
    cwd: string,
    run: (rpc: JsonRpcClient) => Promise<T>,
  ): Promise<T> {
    const child = this.spawnProcess(this.binaryPath, ['app-server'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
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
        clientInfo: {
          name: 'convergence',
          title: 'Convergence',
          version: '0.0.0',
        },
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
