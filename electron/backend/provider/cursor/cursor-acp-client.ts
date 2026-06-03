import { spawn, type ChildProcess, type SpawnOptions } from 'child_process'
import {
  CURSOR_ACP_LOGIN_METHOD_ID,
  CURSOR_ACP_MODEL_CONFIG_ID,
} from './cursor-acp-contract.pure'
import {
  CursorAcpJsonRpcClient,
  type CursorAcpTransportDebugHandler,
} from './cursor-acp-jsonrpc'

export type CursorAcpSpawn = (
  binaryPath: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess

export interface CursorAcpProcessClientOptions {
  requestTimeoutMs?: number
  operationTimeoutMs?: number
  timeoutMs?: number
  spawnProcess?: CursorAcpSpawn
  onDebug?: CursorAcpTransportDebugHandler
  env?: NodeJS.ProcessEnv
}

export interface CursorAcpInitializeParams {
  protocolVersion: 1
  clientCapabilities: {
    fs: {
      readTextFile: boolean
      writeTextFile: boolean
    }
    terminal: boolean
  }
  clientInfo: {
    name: string
    version: string
  }
}

export interface CursorAcpSessionParams {
  cwd: string
  mcpServers: unknown[]
}

export interface CursorAcpCommandDiscoveryOptions {
  forceReload?: boolean
  waitMs?: number
}

const DEFAULT_COMMAND_DISCOVERY_WAIT_MS = 500

export function buildCursorAcpInitializeParams(): CursorAcpInitializeParams {
  return {
    protocolVersion: 1,
    clientCapabilities: {
      fs: {
        readTextFile: false,
        writeTextFile: false,
      },
      terminal: false,
    },
    clientInfo: {
      name: 'convergence',
      version: '0.0.0',
    },
  }
}

export function buildCursorAcpSessionParams(
  cwd: string,
): CursorAcpSessionParams {
  return {
    cwd,
    mcpServers: [],
  }
}

export function readCursorAcpSessionId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const sessionId = (value as { sessionId?: unknown }).sessionId
  return typeof sessionId === 'string' && sessionId.trim()
    ? sessionId.trim()
    : null
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
  const details = truncateForError(stderr.trim())
  return new Error(`Cursor ACP ${reason}${details ? `: ${details}` : ''}`)
}

function truncateForError(value: string): string {
  const max = 4000
  return value.length > max
    ? `${value.slice(0, max)}... [truncated ${value.length - max} chars]`
    : value
}

export class CursorAcpProcessClient {
  private requestTimeoutMs: number
  private operationTimeoutMs: number
  private spawnProcess: CursorAcpSpawn
  private onDebug: CursorAcpTransportDebugHandler | null
  private env: NodeJS.ProcessEnv

  constructor(
    private binaryPath: string,
    options: CursorAcpProcessClientOptions = {},
  ) {
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? options.timeoutMs ?? 30_000
    this.operationTimeoutMs =
      options.operationTimeoutMs ??
      Math.max(this.requestTimeoutMs * 4, this.requestTimeoutMs)
    this.spawnProcess = options.spawnProcess ?? spawn
    this.onDebug = options.onDebug ?? null
    this.env = options.env ?? process.env
  }

  async createSession(cwd: string): Promise<unknown> {
    return this.withAuthenticatedConnection(cwd, (rpc) =>
      rpc.request('session/new', buildCursorAcpSessionParams(cwd)),
    )
  }

  async listAvailableCommands(
    cwd: string,
    options: CursorAcpCommandDiscoveryOptions = {},
  ): Promise<unknown> {
    return this.withAuthenticatedConnection(cwd, async (rpc) => {
      const notifications: Array<{ method: string; params: unknown }> = []
      rpc.onNotification((method, params) => {
        notifications.push({ method, params })
      })

      const session = await rpc.request(
        'session/new',
        buildCursorAcpSessionParams(cwd),
      )
      const waitMs = options.waitMs ?? DEFAULT_COMMAND_DISCOVERY_WAIT_MS
      if (waitMs > 0) {
        await delay(waitMs)
      }

      return {
        session,
        notifications,
      }
    })
  }

  async listSessions(cwd: string): Promise<unknown> {
    return this.withAuthenticatedConnection(cwd, (rpc) =>
      rpc.request('session/list', { cwd }),
    )
  }

  async loadSession(cwd: string, sessionId: string): Promise<unknown> {
    return this.withAuthenticatedConnection(cwd, (rpc) =>
      rpc.request('session/load', {
        sessionId,
        ...buildCursorAcpSessionParams(cwd),
      }),
    )
  }

  async setMode(
    cwd: string,
    sessionId: string,
    modeId: string,
  ): Promise<unknown> {
    return this.withAuthenticatedConnection(cwd, (rpc) =>
      rpc.request('session/set_mode', { sessionId, modeId }),
    )
  }

  async setModel(
    cwd: string,
    sessionId: string,
    modelId: string,
  ): Promise<unknown> {
    return this.withAuthenticatedConnection(cwd, (rpc) =>
      rpc.request('session/set_config_option', {
        sessionId,
        configId: CURSOR_ACP_MODEL_CONFIG_ID,
        value: modelId,
      }),
    )
  }

  async withAuthenticatedConnection<T>(
    cwd: string,
    run: (rpc: CursorAcpJsonRpcClient) => Promise<T>,
  ): Promise<T> {
    return this.withConnection(cwd, async (rpc) => {
      await rpc.request('initialize', buildCursorAcpInitializeParams())
      await rpc.request('authenticate', {
        methodId: CURSOR_ACP_LOGIN_METHOD_ID,
      })
      return run(rpc)
    })
  }

  async withConnection<T>(
    cwd: string,
    run: (rpc: CursorAcpJsonRpcClient) => Promise<T>,
  ): Promise<T> {
    const child = this.spawnProcess(this.binaryPath, ['acp'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...this.env },
    })
    let stderr = ''
    let timeout: NodeJS.Timeout | null = null

    if (!child.stdin || !child.stdout) {
      child.kill('SIGTERM')
      throw new Error('Cursor ACP did not expose stdio pipes')
    }

    const rpc = new CursorAcpJsonRpcClient(child.stdin, child.stdout, {
      requestTimeoutMs: this.requestTimeoutMs,
      onDebug: this.onDebug ?? undefined,
    })

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString()
      stderr += text
      this.onDebug?.({
        direction: 'in',
        channel: 'stderr',
        bytes: Buffer.byteLength(text),
      })
    })

    const onExit = (
      code: number | null,
      signal: NodeJS.Signals | null,
    ): void => {
      exitReject?.(formatExitError(code, signal, stderr))
    }
    const onError = (error: Error): void => {
      exitReject?.(error)
    }
    let exitReject: ((error: Error) => void) | null = null

    const exit = new Promise<never>((_resolve, reject) => {
      exitReject = reject
      child.once('error', onError)
      child.once('exit', onExit)
    })

    const operation = run(rpc)
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        terminateProcess(child)
        reject(
          new Error(
            `Cursor ACP operation timed out after ${this.operationTimeoutMs}ms`,
          ),
        )
      }, this.operationTimeoutMs)
    })

    try {
      return await Promise.race([operation, exit, timeoutPromise])
    } finally {
      if (timeout) clearTimeout(timeout)
      child.off('error', onError)
      child.off('exit', onExit)
      rpc.destroy()
      child.stdin.end()
      terminateProcess(child)
    }
  }
}

function terminateProcess(child: ChildProcess): void {
  if (child.exitCode !== null || child.killed) return
  try {
    child.kill('SIGTERM')
  } catch {
    // Process may already be gone.
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
