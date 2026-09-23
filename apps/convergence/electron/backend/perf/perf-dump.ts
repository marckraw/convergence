import { join } from 'node:path'

export type PerfDumpReason = 'quit' | 'usr2'

type PerfDumpProbe = {
  report: (payload: { source: 'installed'; reason: PerfDumpReason }) => unknown
}

export type PerfDumpDeps = {
  dir: string
  now: () => Date
  writeFile: (path: string, data: string) => void | Promise<void>
  mkdir: (path: string, options: { recursive: true }) => void | Promise<void>
  onSignal: (
    signal: NodeJS.Signals,
    handler: () => void | Promise<void>,
  ) => void
  onQuit: (handler: () => void | Promise<void>) => void
  log: (line: string) => void
}

function perfReportStamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
  ].join('-')
}

function isPromise(value: unknown): value is Promise<void> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Promise<void>).then === 'function'
  )
}

function failureLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `perf dump failed: ${message.replace(/\s+/g, ' ')}`
}

/**
 * Composition function: registers quit and SIGUSR2 dumps on injected clock
 * and filesystem IO so this module never imports Electron.
 */
export function installPerfDump(
  probe: PerfDumpProbe,
  deps: PerfDumpDeps,
): void {
  const dump = (reason: PerfDumpReason): Promise<void> => {
    const body = JSON.stringify(
      probe.report({ source: 'installed', reason }),
      null,
      2,
    )
    const path = join(
      deps.dir,
      `perf-report-${perfReportStamp(deps.now())}-${reason}.json`,
    )
    const wrote = (written: void | Promise<void>): Promise<void> => {
      if (isPromise(written)) {
        return written.then(
          () => {
            deps.log(path)
          },
          (error: unknown) => {
            deps.log(failureLine(error))
          },
        )
      }
      deps.log(path)
      return Promise.resolve()
    }
    const finish = (): Promise<void> => {
      try {
        return wrote(deps.writeFile(path, body))
      } catch (error) {
        deps.log(failureLine(error))
        return Promise.resolve()
      }
    }
    try {
      const made = deps.mkdir(deps.dir, { recursive: true })
      if (isPromise(made)) {
        return made.then(finish, (error: unknown) => {
          deps.log(failureLine(error))
        })
      }
      return finish()
    } catch (error) {
      deps.log(failureLine(error))
      return Promise.resolve()
    }
  }

  deps.onQuit(() => dump('quit'))
  deps.onSignal('SIGUSR2', () => dump('usr2'))
}

/** Pure check: the install call sits inside the `CONVERGENCE_PERF` gate. */
export function perfDumpLivesInsideProbeGate(source: string): boolean {
  const calls = [...source.matchAll(/installPerfDump\(/g)].map(
    (match) => match.index ?? -1,
  )
  if (calls.length !== 1) return false
  const call = calls[0]!
  const gate = source.indexOf('if (perfProbe)')
  if (gate < 0 || call < gate) return false
  const open = source.indexOf('{', gate)
  if (open < 0 || call < open) return false
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return call < index
    }
  }
  return false
}
