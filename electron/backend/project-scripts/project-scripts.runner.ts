import { spawn, type ChildProcessByStdio } from 'child_process'
import type { Readable } from 'stream'
import type { ProjectScriptsService } from './project-scripts.service'
import type {
  ProjectScriptRun,
  ProjectScriptRunOutput,
  RunProjectScriptInput,
} from './project-scripts.types'

interface ActiveProcess {
  child: ChildProcessByStdio<null, Readable, Readable>
  stopping: boolean
  outputSequence: number
}

export interface ProjectScriptsRunnerOptions {
  service: ProjectScriptsService
  broadcast: (channel: string, payload: unknown) => void
  shell?: string
}

export class ProjectScriptsRunner {
  private readonly active = new Map<string, ActiveProcess>()
  private readonly service: ProjectScriptsService
  private readonly broadcast: (channel: string, payload: unknown) => void
  private readonly shell?: string

  constructor(options: ProjectScriptsRunnerOptions) {
    this.service = options.service
    this.broadcast = options.broadcast
    this.shell = options.shell
  }

  run(scriptId: string, input?: RunProjectScriptInput): ProjectScriptRun {
    const run = this.service.createRunRecord({
      scriptId,
      status: 'queued',
      cwd: input?.cwd,
    })

    try {
      const running = this.service.markRunRunning(run.id)
      this.broadcastRunUpdated(running)

      const child = spawn(running.command, {
        cwd: running.cwd,
        shell: this.shell ?? true,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        env: process.env,
      })

      const active: ActiveProcess = {
        child,
        stopping: false,
        outputSequence: 0,
      }
      this.active.set(running.id, active)

      child.stdout.on('data', (chunk: Buffer) => {
        this.recordOutput(running.id, active, 'stdout', chunk.toString())
      })

      child.stderr.on('data', (chunk: Buffer) => {
        this.recordOutput(running.id, active, 'stderr', chunk.toString())
      })

      child.on('error', (error) => {
        this.finishRun(running.id, {
          status: 'failed',
          exitCode: null,
          signal: null,
          errorMessage: error.message,
        })
      })

      child.on('exit', (code, signal) => {
        const current = this.active.get(running.id)
        const stopped = current?.stopping ?? false
        const status = stopped ? 'stopped' : code === 0 ? 'succeeded' : 'failed'
        this.finishRun(running.id, {
          status,
          exitCode: code,
          signal,
          errorMessage: null,
        })
      })

      return running
    } catch (error) {
      return this.service.finishRun({
        id: run.id,
        status: 'failed',
        errorMessage:
          error instanceof Error ? error.message : 'Failed to start script',
      })
    }
  }

  stop(runId: string): ProjectScriptRun {
    const active = this.active.get(runId)
    if (!active) {
      const existing = this.service.getRun(runId)
      if (!existing) {
        throw new Error(`Project script run not found: ${runId}`)
      }
      return existing
    }

    active.stopping = true
    if (process.platform === 'win32') {
      active.child.kill()
    } else if (typeof active.child.pid === 'number') {
      try {
        process.kill(-active.child.pid, 'SIGTERM')
      } catch {
        active.child.kill('SIGTERM')
      }
    } else {
      active.child.kill('SIGTERM')
    }

    return this.service.getRun(runId)!
  }

  disposeAll(): void {
    for (const runId of this.active.keys()) {
      this.stop(runId)
    }
  }

  private recordOutput(
    runId: string,
    active: ActiveProcess,
    stream: 'stdout' | 'stderr',
    text: string,
  ): void {
    const updated = this.tryAppendRunOutput(runId, stream, text)
    if (!updated) {
      return
    }

    const output: ProjectScriptRunOutput = {
      runId,
      stream,
      text,
      sequence: active.outputSequence,
      emittedAt: new Date().toISOString(),
    }
    active.outputSequence += 1
    this.broadcast('project-script-run:output', output)
    this.broadcastRunUpdated(updated)
  }

  private finishRun(
    runId: string,
    input: {
      status: 'succeeded' | 'failed' | 'stopped'
      exitCode?: number | null
      signal?: string | null
      errorMessage?: string | null
    },
  ): void {
    this.active.delete(runId)
    const updated = this.tryFinishRun({
      id: runId,
      status: input.status,
      exitCode: input.exitCode,
      signal: input.signal,
      errorMessage: input.errorMessage,
    })
    if (!updated) {
      return
    }
    this.broadcastRunUpdated(updated)
  }

  private broadcastRunUpdated(run: ProjectScriptRun): void {
    this.broadcast('project-script-run:updated', run)
  }

  private tryAppendRunOutput(
    runId: string,
    stream: 'stdout' | 'stderr',
    text: string,
  ): ProjectScriptRun | null {
    try {
      return this.service.appendRunOutput(runId, stream, text)
    } catch (error) {
      if (isMissingRunError(error)) {
        this.active.delete(runId)
        return null
      }
      throw error
    }
  }

  private tryFinishRun(input: {
    id: string
    status: 'succeeded' | 'failed' | 'stopped'
    exitCode?: number | null
    signal?: string | null
    errorMessage?: string | null
  }): ProjectScriptRun | null {
    try {
      return this.service.finishRun(input)
    } catch (error) {
      if (isMissingRunError(error)) {
        return null
      }
      throw error
    }
  }
}

function isMissingRunError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith('Project script run not found:')
  )
}
