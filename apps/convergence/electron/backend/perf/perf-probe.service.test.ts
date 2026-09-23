import { describe, expect, it, vi } from 'vitest'
import { createPerfProbe } from './perf-probe.service'
import { closeDatabase, getDatabase } from '../database/database'

describe('main perf recorder', () => {
  it('constructs no recorder and leaves original send untouched when off', () => {
    const original = vi.fn()
    const target = { send: original }
    const probe = createPerfProbe(false)
    probe?.wrapSend(target)
    expect(probe).toBeNull()
    expect(target.send).toBe(original)
  })
  it('counts a broadcast and restores the original send identity', () => {
    const original = vi.fn()
    const target = { send: original }
    const probe = createPerfProbe(true)!
    probe.wrapSend(target)
    target.send('session:summaryUpdated', { id: 'one' })
    expect(original).toHaveBeenCalledWith('session:summaryUpdated', {
      id: 'one',
    })
    expect(probe.report().main.ipc['session:summaryUpdated']).toMatchObject({
      sends: 1,
    })
    expect(
      probe.report().main.ipc['session:summaryUpdated']!.bytes,
    ).toBeGreaterThan(0)
    probe.dispose()
    expect(target.send).toBe(original)
  })
  it('records real statement execution, summary calls and timer ticks without changing their results', async () => {
    const db = getDatabase()
    const prepare = db.prepare
    const timer = globalThis.setTimeout
    const probe = createPerfProbe(true)!
    const target = { getSummaryById: (id: string) => ({ id }) }
    try {
      probe.wrapDatabase(db)
      probe.wrapSummary(target)
      probe.wrapTimers()
      expect(db.prepare('SELECT 7 AS value').get()).toEqual({ value: 7 })
      expect(target.getSummaryById('one')).toEqual({ id: 'one' })
      await new Promise<void>((resolve) => setTimeout(resolve, 1))
      const report = probe.report().main
      expect(report.sqlite[0]).toMatchObject({
        sql: 'SELECT 7 AS value',
        calls: 1,
      })
      expect(report.getSummaryById.calls).toBe(1)
      expect(
        Object.values(report.timers).reduce(
          (sum, value) => sum + value.ticks,
          0,
        ),
      ).toBe(1)
    } finally {
      probe.dispose()
      expect(db.prepare).toBe(prepare)
      expect(globalThis.setTimeout).toBe(timer)
      closeDatabase()
    }
  })
})

// The Node contract exercises the executable and its real fake-provider session path.
it('R1 short Node busy day writes every required numeric metric', async () => {
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join, resolve } = await import('node:path')
  const { spawnSync } = await import('node:child_process')
  const temp = mkdtempSync(join(tmpdir(), 'perf-contract-'))
  try {
    const out = join(temp, 'report.json')
    const run = spawnSync(
      process.execPath,
      [
        resolve('tools/perf-busy-day.mjs'),
        '--node',
        '--sessions',
        '2',
        '--streaming',
        '1',
        '--minutes',
        '0.1',
        '--out',
        out,
      ],
      { encoding: 'utf8', timeout: 30000 },
    )
    expect(run.status, run.stderr).toBe(0)
    const report = JSON.parse(readFileSync(out, 'utf8'))
    expect(report.parameters).toMatchObject({
      sessions: 2,
      streaming: 1,
      minutes: 0.1,
      keys: 60,
      keyMs: 80,
      tokenMs: 30,
    })
    expect(report.scenario.emittedDeltas).toBeGreaterThan(0)
    expect(report.scenario.trackerReads).toBeGreaterThan(0)
    const numeric = (value: unknown) => {
      expect(typeof value).toBe('number')
      expect(Number.isFinite(value)).toBe(true)
    }
    for (const entry of Object.values(report.main.ipc) as Record<
      string,
      number
    >[])
      for (const key of ['sends', 'bytes', 'sendsPerSecond', 'bytesPerSecond'])
        numeric(entry[key])
    expect(Object.keys(report.main.ipc)).toContain(
      'session:conversationPatched',
    )
    for (const timer of Object.values(report.main.timers) as Record<
      string,
      number
    >[])
      numeric(timer.ticks)
    for (const key of ['calls', 'ms']) numeric(report.main.getSummaryById[key])
    expect(report.main.sqlite).toHaveLength(10)
    for (const query of report.main.sqlite) {
      expect(query.sql).toEqual(expect.any(String))
      for (const key of ['calls', 'totalMs', 'maxMs']) numeric(query[key])
    }
    numeric(report.main.heap.start)
    numeric(report.main.heap.end)
    expect(report.renderer.measured).toBe(false)
    for (const key of ['samples', 'p50', 'p95'])
      numeric(report.renderer.keystrokeToPaint[key])
    numeric(report.renderer.longTasks.count)
    numeric(report.renderer.longTasks.totalMs)
    numeric(report.renderer.inputDelayP95)
    numeric(report.renderer.sessionsIdentityChanges)
    for (const root of ['composer', 'sidebar', 'wave-panel'])
      for (const key of ['count', 'perMinute', 'totalMs'])
        numeric(report.renderer.commits[root][key])
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}, 40000)
