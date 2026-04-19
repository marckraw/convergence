export interface CreateTerminalInput {
  sessionId: string
  cwd: string
  cols: number
  rows: number
}

export interface CreateTerminalResult {
  id: string
  pid: number
  shell: string
  initialBuffer: string
}

export interface AttachTerminalResult {
  initialBuffer: string
}

export interface TerminalExitPayload {
  exitCode: number
  signal: number | null
}

export interface PtyProcess {
  pid: number
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
  onData(cb: (data: string) => void): { dispose: () => void }
  onExit(cb: (payload: TerminalExitPayload) => void): { dispose: () => void }
}

export interface PtySpawnOptions {
  shell: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  cols: number
  rows: number
}

export interface PtyFactory {
  spawn(options: PtySpawnOptions): PtyProcess
}

export interface TerminalHandle {
  id: string
  sessionId: string
  cwd: string
  shell: string
  pid: number
  pty: PtyProcess
  buffer: RingBuffer
  dataDisposable: { dispose: () => void }
  exitDisposable: { dispose: () => void }
}

export interface RingBuffer {
  append(chunk: string): void
  snapshot(): string
}
