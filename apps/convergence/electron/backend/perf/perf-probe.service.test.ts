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
    expect(Number.isFinite(report.main.cpuPercent)).toBe(true)
    expect(report.processes[0].measured).toBe(false)
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

it('M1b R4 flag-off getConversation performs no timing or serialization', async () => {
  const { SessionService } = await import('../session/session.service')
  const { LocalExecutionHost } =
    await import('../provider/execution-host/local-execution-host')
  const { ProviderRegistry } = await import('../provider/provider-registry')
  const db = getDatabase()
  const sessions = new SessionService(
    db,
    new LocalExecutionHost(new ProviderRegistry()),
  )
  const probe = createPerfProbe(true)!
  probe.observeConversations()
  vi.stubEnv('CONVERGENCE_PERF', undefined)
  const clock = vi.spyOn(performance, 'now')
  try {
    clock.mockClear()
    expect(sessions.getConversation('missing')).toEqual([])
    expect(clock).not.toHaveBeenCalled()
    expect(probe.conversationReads).toEqual([])
    vi.stubEnv('CONVERGENCE_PERF', '1')
    sessions.getConversation('missing')
    expect(clock).toHaveBeenCalled()
    expect(probe.conversationReads).toHaveLength(1)
    expect(probe.conversationReads[0]!.replyBytes).toBeGreaterThan(0)
  } finally {
    clock.mockRestore()
    vi.unstubAllEnvs()
    probe.dispose()
    closeDatabase()
  }
})

it.each(['busy', 'open', 'stream-into-open'])(
  'M1b R1/R2/R3 %s copies a 300-conversation fixture and preserves its hash',
  async (scenario) => {
    const { createHash } = await import('node:crypto')
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join, resolve } = await import('node:path')
    const { spawnSync } = await import('node:child_process')
    const root = mkdtempSync(join(tmpdir(), 'm1b-fixture-'))
    const source = join(root, 'input.db')
    const out = join(root, 'report.json')
    const hash = () =>
      createHash('sha256').update(readFileSync(source)).digest('hex')
    try {
      const db = getDatabase(source)
      db.prepare(
        "INSERT INTO projects (id, name, repository_path) VALUES ('project', 'Generated fixture', ?)",
      ).run(root)
      const session = db.prepare(
        "INSERT INTO sessions (id, project_id, provider_id, name, working_directory, last_sequence) VALUES (?, 'project', 'fixture-provider', ?, ?, ?)",
      )
      const item = db.prepare(
        "INSERT INTO session_conversation_items (id, session_id, sequence, kind, state, payload_json, created_at, updated_at) VALUES (?, ?, ?, 'message', 'complete', ?, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z')",
      )
      db.transaction(() => {
        for (let i = 0; i < 300; i++) {
          const count = i < 3 ? 2000 + i : 1
          const id = `session-${i}`
          session.run(id, id, root, count)
          for (let j = 1; j <= count; j++)
            item.run(
              `${id}-${j}`,
              id,
              j,
              JSON.stringify({
                role: j % 2 ? 'user' : 'assistant',
                text: 'Generated fixture message ' + j,
              }),
            )
        }
      })()
      closeDatabase()
      const before = hash()
      const overwrite = spawnSync(
        process.execPath,
        [
          resolve('tools/perf-busy-day.mjs'),
          '--node',
          '--db',
          source,
          '--out',
          source,
        ],
        { encoding: 'utf8', timeout: 30000 },
      )
      expect(overwrite.status).not.toBe(0)
      expect(overwrite.stderr).toContain(
        '--out must not overwrite the input database',
      )
      expect(hash()).toBe(before)
      const run = spawnSync(
        process.execPath,
        [
          resolve('tools/perf-busy-day.mjs'),
          '--node',
          '--db',
          source,
          '--scenario',
          scenario,
          '--open',
          'biggest',
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
      expect(hash()).toBe(before)
      const report = JSON.parse(readFileSync(out, 'utf8'))
      const numeric = (value: unknown) => {
        expect(typeof value).toBe('number')
        expect(Number.isFinite(value)).toBe(true)
      }
      numeric(report.main.cpuPercent)
      expect(report.main.cpuPercent).toBeGreaterThanOrEqual(0)
      expect(report.processes).toEqual([
        { type: 'Browser', cpuPercent: 0, workingSetKb: 0, measured: false },
      ])
      expect(report.scenario.targetId).toBe('session-2')
      expect(report.scenario.name).toBe(scenario)
      if (scenario === 'open') {
        expect(report.open.targetId).toBe('session-2')
        expect(report.open.runs).toHaveLength(5)
        numeric(report.open.replyBytes)
        expect(report.open.replyBytes).toBeGreaterThan(2000)
        for (const key of ['select', 'parse', 'replySize', 'firstPaint']) {
          expect(report.open[key].samples).toBe(5)
          numeric(report.open[key].p50)
          numeric(report.open[key].p95)
        }
        for (const sample of report.open.runs) {
          expect(sample.sessionId).toBe('session-2')
          for (const key of [
            'selectMs',
            'parseMs',
            'replyBytes',
            'firstPaintMs',
          ])
            numeric(sample[key])
        }
        expect(report.open.firstPaint.measured).toBe(false)
        expect(report.scenario.emittedDeltas).toBe(0)
      } else {
        expect(report.scenario.emittedDeltas).toBeGreaterThan(0)
        if (scenario === 'stream-into-open')
          expect(report.scenario.streamingIds).toEqual([
            'session-2',
            'session-1',
          ])
      }
      for (const key of ['count', 'perMinute', 'totalMs'])
        numeric(report.renderer.commits.transcript[key])
    } finally {
      closeDatabase()
      rmSync(root, { recursive: true, force: true })
    }
  },
  40000,
)
