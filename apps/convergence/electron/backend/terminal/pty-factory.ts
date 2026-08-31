import * as pty from 'node-pty'
import type { PtyFactory, PtyProcess, PtySpawnOptions } from './terminal.types'

export function createNodePtyFactory(): PtyFactory {
  return {
    spawn(options: PtySpawnOptions): PtyProcess {
      const proc = pty.spawn(options.shell, options.args, {
        cwd: options.cwd,
        env: options.env as { [key: string]: string },
        cols: options.cols,
        rows: options.rows,
        name: 'xterm-256color',
      })
      return {
        pid: proc.pid,
        write: (data) => proc.write(data),
        resize: (cols, rows) => proc.resize(cols, rows),
        kill: (signal) => proc.kill(signal),
        onData: (cb) => proc.onData((d) => cb(d)),
        onExit: (cb) =>
          proc.onExit(({ exitCode, signal }) =>
            cb({ exitCode, signal: signal ?? null }),
          ),
      }
    },
  }
}
