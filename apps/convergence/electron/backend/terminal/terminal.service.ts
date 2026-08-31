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
  TerminalActivityStatus,
  TerminalExitPayload,
  TerminalHandle,
  TerminalIdleEvent,
} from './terminal.types'

export type TerminalEventEmitter = (channel: string, payload: unknown) => void
export type PsRunner = () => Promise<string>
export interface TerminalSessionExitEvent {
  sessionId: string
  terminalId: string
  exitCode: number
  signal: number | null
}
export type TerminalSessionExitObserver = (
  event: TerminalSessionExitEvent,
) => void
export type TerminalIdleObserver = (event: TerminalIdleEvent) => void

interface TerminalActivityState {
  status: TerminalActivityStatus
  busySince: number | null
  lastProcessName: string | null
}

const defaultPsRunner: PsRunner = () =>
  new Promise((resolve, reject) => {
    exec('ps -A -o pid,ppid,comm', (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })

export class TerminalService {
  private handles = new Map<string, TerminalHandle>()
  private activityByTerminalId = new Map<string, TerminalActivityState>()
  private onSessionLastTerminalExit: TerminalSessionExitObserver | null = null
  private onTerminalIdle: TerminalIdleObserver | null = null
  private activityTimer: ReturnType<typeof setInterval> | null = null
  private activityPollInFlight = false

  constructor(
    private readonly ptyFactory: PtyFactory,
    private readonly emit: TerminalEventEmitter,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly psRunner: PsRunner = defaultPsRunner,
    private readonly now: () => number = () => Date.now(),
    private readonly activityPollMs = 1500,
  ) {}

  setSessionLastTerminalExitObserver(
    observer: TerminalSessionExitObserver | null,
  ): void {
    this.onSessionLastTerminalExit = observer
  }

  setTerminalIdleObserver(observer: TerminalIdleObserver | null): void {
    this.onTerminalIdle = observer
    if (observer && this.handles.size > 0) {
      this.ensureActivityMonitor()
    } else if (!observer) {
      this.stopActivityMonitor()
    }
  }

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
      const sessionId = input.sessionId
      this.cleanup(id)
      if (this.countHandlesForSession(sessionId) === 0) {
        this.onSessionLastTerminalExit?.({
          sessionId,
          terminalId: id,
          exitCode: payload.exitCode,
          signal: payload.signal,
        })
      }
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
    this.activityByTerminalId.set(id, {
      status: 'idle',
      busySince: null,
      lastProcessName: null,
    })
    this.ensureActivityMonitor()

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
    this.stopActivityMonitor()
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

  private ensureActivityMonitor(): void {
    if (!this.onTerminalIdle) return
    if (this.activityTimer || this.activityPollMs <= 0) return
    this.activityTimer = setInterval(() => {
      void this.pollTerminalActivity()
    }, this.activityPollMs)
  }

  private stopActivityMonitor(): void {
    if (!this.activityTimer) return
    clearInterval(this.activityTimer)
    this.activityTimer = null
  }

  private async pollTerminalActivity(): Promise<void> {
    if (this.activityPollInFlight || this.handles.size === 0) return
    this.activityPollInFlight = true
    try {
      let output: string
      try {
        output = await this.psRunner()
      } catch {
        return
      }
      const rows = parsePsOutput(output)
      for (const handle of this.handles.values()) {
        const foreground = this.resolveForegroundProcess(handle, rows)
        this.applyActivitySample(handle, foreground)
      }
    } finally {
      this.activityPollInFlight = false
    }
  }

  private resolveForegroundProcess(
    handle: TerminalHandle,
    rows: ReturnType<typeof parsePsOutput>,
  ): ForegroundProcess | null {
    const foreground = findForegroundDescendant(rows, handle.pid)
    if (!foreground) return null
    const shellBasename = handle.shell.split('/').pop() ?? handle.shell
    return foreground.name === shellBasename ? null : foreground
  }

  private applyActivitySample(
    handle: TerminalHandle,
    foreground: ForegroundProcess | null,
  ): void {
    const current = this.activityByTerminalId.get(handle.id)
    if (!current || current.status === 'exited') return

    if (foreground) {
      const busySince =
        current.status === 'busy' && current.busySince !== null
          ? current.busySince
          : this.now()
      this.activityByTerminalId.set(handle.id, {
        status: 'busy',
        busySince,
        lastProcessName: foreground.name,
      })
      return
    }

    if (current.status !== 'busy' || current.busySince === null) {
      this.activityByTerminalId.set(handle.id, {
        status: 'idle',
        busySince: null,
        lastProcessName: null,
      })
      return
    }

    const idleAt = this.now()
    const processName = current.lastProcessName ?? 'command'
    this.activityByTerminalId.set(handle.id, {
      status: 'idle',
      busySince: null,
      lastProcessName: null,
    })
    this.onTerminalIdle?.({
      sessionId: handle.sessionId,
      terminalId: handle.id,
      processName,
      busySince: new Date(current.busySince).toISOString(),
      idleAt: new Date(idleAt).toISOString(),
    })
  }

  private countHandlesForSession(sessionId: string): number {
    let count = 0
    for (const handle of this.handles.values()) {
      if (handle.sessionId === sessionId) count += 1
    }
    return count
  }

  private cleanup(id: string): void {
    const handle = this.handles.get(id)
    if (!handle) return
    this.activityByTerminalId.set(id, {
      status: 'exited',
      busySince: null,
      lastProcessName: null,
    })
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
    this.activityByTerminalId.delete(id)
    if (this.handles.size === 0) {
      this.stopActivityMonitor()
    }
  }
}

export function dataChannel(id: string): string {
  return `terminal:data:${id}`
}

export function exitChannel(id: string): string {
  return `terminal:exit:${id}`
}
