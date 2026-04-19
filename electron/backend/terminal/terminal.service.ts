import { randomUUID } from 'crypto'
import { exec } from 'child_process'
import { createRingBuffer } from './ring-buffer.pure'
import { resolveDefaultShell } from './shell-resolver.pure'
import {
  findForegroundDescendant,
  parsePsOutput,
  type ForegroundProcess,
} from './foreground-process.pure'
import type {
  AttachTerminalResult,
  CreateTerminalInput,
  CreateTerminalResult,
  PtyFactory,
  TerminalExitPayload,
  TerminalHandle,
} from './terminal.types'

export type TerminalEventEmitter = (channel: string, payload: unknown) => void
export type PsRunner = () => Promise<string>

const defaultPsRunner: PsRunner = () =>
  new Promise((resolve, reject) => {
    exec('ps -A -o pid,ppid,comm', (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })

export class TerminalService {
  private handles = new Map<string, TerminalHandle>()

  constructor(
    private readonly ptyFactory: PtyFactory,
    private readonly emit: TerminalEventEmitter,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly psRunner: PsRunner = defaultPsRunner,
  ) {}

  create(input: CreateTerminalInput): CreateTerminalResult {
    const { shell, args } = resolveDefaultShell(this.env)
    const pty = this.ptyFactory.spawn({
      shell,
      args,
      cwd: input.cwd,
      env: this.env,
      cols: Math.max(1, Math.floor(input.cols)),
      rows: Math.max(1, Math.floor(input.rows)),
    })

    const id = randomUUID()
    const buffer = createRingBuffer()

    const dataDisposable = pty.onData((data) => {
      buffer.append(data)
      this.emit(dataChannel(id), data)
    })

    const exitDisposable = pty.onExit((payload: TerminalExitPayload) => {
      this.emit(exitChannel(id), payload)
      this.cleanup(id)
    })

    this.handles.set(id, {
      id,
      sessionId: input.sessionId,
      cwd: input.cwd,
      shell,
      pid: pty.pid,
      pty,
      buffer,
      dataDisposable,
      exitDisposable,
    })

    return {
      id,
      pid: pty.pid,
      shell,
      initialBuffer: '',
    }
  }

  attach(id: string): AttachTerminalResult {
    const handle = this.handles.get(id)
    if (!handle) {
      return { initialBuffer: '' }
    }
    return { initialBuffer: handle.buffer.snapshot() }
  }

  write(id: string, data: string): void {
    const handle = this.handles.get(id)
    if (!handle) return
    handle.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const handle = this.handles.get(id)
    if (!handle) return
    const safeCols = Math.max(1, Math.floor(cols))
    const safeRows = Math.max(1, Math.floor(rows))
    handle.pty.resize(safeCols, safeRows)
  }

  dispose(id: string): void {
    const handle = this.handles.get(id)
    if (!handle) return
    try {
      handle.pty.kill()
    } catch {
      // pty already gone
    }
    this.cleanup(id)
  }

  disposeAll(): void {
    for (const id of Array.from(this.handles.keys())) {
      this.dispose(id)
    }
  }

  async getForegroundProcess(id: string): Promise<ForegroundProcess | null> {
    const handle = this.handles.get(id)
    if (!handle) return null
    let output: string
    try {
      output = await this.psRunner()
    } catch {
      return null
    }
    const rows = parsePsOutput(output)
    const result = findForegroundDescendant(rows, handle.pid)
    if (!result) return null
    const shellBasename = handle.shell.split('/').pop() ?? handle.shell
    if (result.name === shellBasename) return null
    return result
  }

  has(id: string): boolean {
    return this.handles.has(id)
  }

  size(): number {
    return this.handles.size
  }

  private cleanup(id: string): void {
    const handle = this.handles.get(id)
    if (!handle) return
    try {
      handle.dataDisposable.dispose()
    } catch {
      // noop
    }
    try {
      handle.exitDisposable.dispose()
    } catch {
      // noop
    }
    this.handles.delete(id)
  }
}

export function dataChannel(id: string): string {
  return `terminal:data:${id}`
}

export function exitChannel(id: string): string {
  return `terminal:exit:${id}`
}
