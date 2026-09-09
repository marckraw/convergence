import type {
  ClaudePermissionRequest,
  ClaudePermissionResult,
} from './claude-permission.types'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

export interface ClaudeTransportExit {
  code: number | null
  signal: string | null
  error?: string
}

/** Adapter: the seam where Claude's wire meets its process; SDK types stay here. */
export interface ClaudeTransport {
  readonly canStopTasks: boolean
  write(userLine: string): void
  stopTask(id: string): Promise<void>
  interrupt(): Promise<unknown>
  setModel(model: string | null, effort?: string | null): Promise<void>
  setPermissionMode(mode: string): Promise<void>
  close(): Promise<void>
}

export function createClaudeTransport(input: {
  binaryPath: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  onMessage: (raw: unknown) => void
  onExit: (exit: ClaudeTransportExit) => void
  onStderr: (data: string) => void
  onSpawn?: (pid: number) => void
  onPermissionRequest: (
    request: ClaudePermissionRequest,
  ) => Promise<ClaudePermissionResult>
}): ClaudeTransport {
  const value = (name: string) => {
    const index = input.args.indexOf(name)
    return index < 0 ? undefined : input.args[index + 1]
  }
  const messages: SDKUserMessage[] = []
  let wake: (() => void) | undefined
  let closed = false
  let spawnedProcess: ChildProcessWithoutNullStreams | undefined
  let finishExit: (() => void) | undefined
  const exited = new Promise<void>((resolve) => {
    finishExit = resolve
  })
  let exit: ClaudeTransportExit = { code: null, signal: null }
  async function* stream() {
    while (!closed) {
      const message = messages.shift()
      if (message) yield message
      else
        await new Promise<void>((resolve) => {
          wake = resolve
        })
    }
  }
  const mode = value('--permission-mode')
  const runner = query({
    prompt: stream(),
    options: {
      cwd: input.cwd,
      env: input.env,
      pathToClaudeCodeExecutable: input.binaryPath,
      model: value('--model'),
      resume: value('--resume'),
      includePartialMessages: true,
      forwardSubagentText: true,
      canUseTool: (toolName, inputValue, options) =>
        input.onPermissionRequest({ toolName, input: inputValue, ...options }),
      permissionMode: mode as
        | 'default'
        | 'acceptEdits'
        | 'bypassPermissions'
        | 'plan',
      allowDangerouslySkipPermissions: mode === 'bypassPermissions',
      extraArgs: {
        ...(value('--effort') ? { effort: value('--effort')! } : {}),
      },
      spawnClaudeCodeProcess: (options) => {
        const child = spawn(input.binaryPath, options.args, {
          cwd: options.cwd,
          env: options.env,
          stdio: ['pipe', 'pipe', 'pipe'],
          signal: options.signal,
        })
        spawnedProcess = child
        if (child.pid !== undefined) input.onSpawn?.(child.pid)
        child.stderr.on('data', (chunk: Buffer) =>
          input.onStderr(chunk.toString()),
        )
        child.on('exit', (code, signal) => {
          exit = { code, signal }
        })
        return child
      },
    },
  })
  void (async () => {
    try {
      for await (const event of runner) input.onMessage(event)
    } catch (error) {
      exit.error = error instanceof Error ? error.message : String(error)
    } finally {
      closed = true
      wake?.()
      try {
        input.onExit(exit)
      } finally {
        finishExit?.()
      }
    }
  })()
  return {
    get canStopTasks() {
      return typeof runner.stopTask === 'function'
    },
    write: (line) => {
      if (closed) throw new Error('Claude connection has ended')
      messages.push(JSON.parse(line) as SDKUserMessage)
      wake?.()
    },
    stopTask: async (id) => {
      if (typeof runner.stopTask !== 'function')
        throw new Error('Stop is not available on this Claude Code version')
      await runner.stopTask(id)
    },
    interrupt: () => runner.interrupt(),
    setModel: async (model, effort) => {
      await runner.setModel(model ?? undefined)
      if (effort !== undefined)
        await runner.applyFlagSettings({
          effortLevel: effort as
            | 'low'
            | 'medium'
            | 'high'
            | 'xhigh'
            | 'max'
            | null,
        })
    },
    setPermissionMode: (next) =>
      runner.setPermissionMode(
        next as 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan',
      ),
    close: async () => {
      closed = true
      wake?.()
      // Drain resolved permission callbacks before the SDK closes its input.
      await new Promise<void>((resolve) => setImmediate(resolve))
      runner.close()
      const force = setTimeout(() => spawnedProcess?.kill('SIGKILL'), 5000)
      force.unref?.()
      return exited.finally(() => clearTimeout(force))
    },
  }
}
