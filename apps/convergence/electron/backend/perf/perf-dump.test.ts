import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  installPerfDump,
  perfDumpLivesInsideProbeGate,
  type PerfDumpDeps,
} from './perf-dump'

const dir = '/virtual/perf'
const stamp = '20260924-010203'

function harness(overrides: Partial<PerfDumpDeps> = {}): {
  files: Map<string, string>
  log: ReturnType<typeof vi.fn>
  quit: () => void | Promise<void>
  signal: () => void | Promise<void>
} {
  const files = new Map<string, string>()
  let dirMade = false
  const log = vi.fn()
  let quit: () => void | Promise<void> = () => undefined
  let signal: () => void | Promise<void> = () => undefined
  installPerfDump(
    {
      report: (payload) => ({ renderer: payload, elapsedSeconds: 1 }),
    },
    {
      dir,
      now: () => new Date(2026, 8, 24, 1, 2, 3),
      mkdir: () => {
        dirMade = true
      },
      writeFile: (path, data) => {
        if (!dirMade) throw new Error('ENOENT')
        files.set(path, data)
      },
      onSignal: (name, handler) => {
        expect(name).toBe('SIGUSR2')
        signal = handler
      },
      onQuit: (handler) => {
        quit = handler
      },
      log,
      ...overrides,
    },
  )
  return { files, log, quit, signal }
}

describe('installed perf dump', () => {
  it('R1 writes a readable quit file and a differently named usr2 file', async () => {
    const { files, log, quit, signal } = harness()
    await quit()
    await signal()
    const quitPath = join(dir, `perf-report-${stamp}-quit.json`)
    const usr2Path = join(dir, `perf-report-${stamp}-usr2.json`)
    expect(quitPath).not.toBe(usr2Path)
    expect(JSON.parse(files.get(quitPath)!)).toMatchObject({
      renderer: { source: 'installed', reason: 'quit' },
    })
    expect(JSON.parse(files.get(usr2Path)!)).toMatchObject({
      renderer: { source: 'installed', reason: 'usr2' },
    })
    expect(log).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenNthCalledWith(1, quitPath)
    expect(log).toHaveBeenNthCalledWith(2, usr2Path)
  })

  it('R2 a failed write resolves and logs once', async () => {
    const { log, quit } = harness({
      writeFile: () => {
        throw new Error('disk full')
      },
    })
    await expect(quit()).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('perf dump failed: disk full')
  })

  it('R3 installs the dump only inside the perf probe gate', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../main/index.ts'),
      'utf8',
    )
    expect(perfDumpLivesInsideProbeGate(source)).toBe(true)
  })
})
