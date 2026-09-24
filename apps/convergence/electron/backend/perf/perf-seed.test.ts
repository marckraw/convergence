import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import Database from 'better-sqlite3'
import { build } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase } from '../database/database'
import { hasTokens } from './perf-seed.pure'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const script = join(appRoot, 'tools/perf-seed.mjs')
const roots: string[] = []
const tokens = [
  `lin_api_${'L'.repeat(50)}`,
  `sk-${'S'.repeat(24)}`,
  `ghp_${'G'.repeat(30)}`,
  ...['a', 'b', 'p'].map((kind) => `xox${kind}-${'SLACK-'.repeat(5)}`),
  `cvg_${'C'.repeat(20)}`,
  `AKIA${'A'.repeat(16)}`,
  '-----BEGIN RSA PRIVATE KEY-----\nFAKEKEYMATERIAL\n-----END RSA PRIVATE KEY-----',
  '-----BEGIN PRIVATE KEY-----🙂-----END PRIVATE KEY-----',
  `Authorization: Bearer ${'B'.repeat(20)}`,
  `github_pat_${'GH_'.repeat(12)}`,
  `glpat-${'GL-'.repeat(10)}`,
  ...['ant', 'or', 'proj'].map((kind) => `sk-${kind}-${'TEST_'.repeat(10)}`),
  `npm_${'N'.repeat(36)}`,
  `xai-${'X'.repeat(24)}`,
  ...['o', 'u', 's', 'r'].map((kind) => `gh${kind}_${'G'.repeat(24)}`),
  `AIza${'A_-'.repeat(11)}AA`,
  `hf_${'H'.repeat(24)}`,
  `gsk_${'G'.repeat(24)}`,
  ...['sk', 'rk'].map((kind) => `${kind}_live_${'L'.repeat(24)}`),
]
const deletedSecret = 'fake-secret-in-source-free-pages'
const jsonSecret = 'plainrandomvalue123'
const secretPayload = JSON.stringify({
  apiKey: jsonSecret,
  env: { MY_SECRET: 'fake-env-secret-"\\\n🙂' },
  max_tokens: 4096,
  input_tokens: 12,
  secret: false,
  token: null,
})
const planted = [
  ...tokens,
  'fake-resume-handle',
  'fake-state-key',
  'fake-extra-token',
  'fake-required-secret',
  deletedSecret,
  jsonSecret,
  'fake-env-secret',
]
const hash = (path: string) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`

function fixture(large = false) {
  const root = mkdtempSync(join(tmpdir(), 'mar-3381-fixture-'))
  roots.push(root)
  const source = join(root, 'source.db')
  const db = getDatabase(source)
  db.exec(`
    INSERT INTO sessions (id, context_kind, provider_id, name, working_directory, continuation_token)
      VALUES ('session', 'global', 'fixture', 'fixture', '/fixture', 'fake-resume-handle');
    CREATE TABLE workboard_tracker_sources (id TEXT PRIMARY KEY, auth_json TEXT NOT NULL);
    CREATE TABLE fixture_extra (id INTEGER PRIMARY KEY, extra_token TEXT, required_secret TEXT NOT NULL, body TEXT, dynamic_value);
    CREATE TABLE fixture_without_rowid (id TEXT PRIMARY KEY, body TEXT) WITHOUT ROWID;
    CREATE TABLE fixture_integer (id INTEGER PRIMARY KEY, body TEXT, exact INTEGER);
  `)
  db.prepare('INSERT INTO workboard_tracker_sources VALUES (?, ?)').run(
    'source',
    JSON.stringify({ token: tokens[0] }),
  )
  db.prepare('INSERT INTO app_state VALUES (?, ?)').run(
    'fixture',
    JSON.stringify({ nested: [{ apiKey: 'fake-state-key' }] }),
  )
  db.prepare('INSERT INTO fixture_extra VALUES (1, ?, ?, ?, ?)').run(
    'fake-extra-token',
    'fake-required-secret',
    tokens[2],
    secretPayload,
  )
  db.prepare('INSERT INTO fixture_without_rowid VALUES (?, ?)').run(
    tokens[10],
    tokens[11],
  )
  db.prepare('INSERT INTO fixture_integer VALUES (?, ?, ?)').run(
    9007199254740993n,
    tokens[0],
    9007199254740995n,
  )
  const insert = db.prepare(
    `INSERT INTO session_conversation_items (id, session_id, sequence, kind, state, payload_json, created_at, updated_at) VALUES (?, 'session', ?, 'text', 'complete', ?, 'fixture', 'fixture')`,
  )
  const lengths: number[] = []
  let payloadBytes = 0
  db.transaction(() => {
    const count = large ? 800 : tokens.length
    for (let index = 0; index < count; index++) {
      const payload = JSON.stringify({
        text: `${large ? 'ordinary words '.repeat(4369) : '🙂 '} ${tokens[index % tokens.length]}`,
        ...(index === 0 ? JSON.parse(secretPayload) : {}),
      })
      insert.run(`item-${index}`, index, payload)
      lengths.push([...payload].length)
      payloadBytes += Buffer.byteLength(payload)
    }
  })()
  closeDatabase()
  return { root, source, out: join(root, 'output'), lengths, payloadBytes }
}

function run(f: ReturnType<typeof fixture>, entry = script, timeout = 120_000) {
  return spawnSync(
    process.execPath,
    [entry, '--source', f.source, '--out', f.out],
    { encoding: 'utf8', timeout },
  )
}

async function mutant(replace: (source: string) => string) {
  // Keep module resolution inside the workspace, but never change the production tool.
  const out = join(appRoot, 'out')
  mkdirSync(out, { recursive: true })
  const root = mkdtempSync(join(out, 'perf-seed-mutation-'))
  roots.push(root)
  const path = join(root, 'mutant.mjs')
  const original = readFileSync(script, 'utf8')
  const contents = replace(original)
  expect(contents, 'mutation must change the production tool').not.toBe(
    original,
  )
  await build({
    stdin: {
      contents,
      resolveDir: dirname(script),
      sourcefile: 'perf-seed.mjs',
    },
    outfile: path,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  })
  return path
}

function plantDeletedSecret(f: ReturnType<typeof fixture>) {
  const db = new Database(f.source)
  try {
    db.pragma('secure_delete = OFF')
    db.exec('CREATE TABLE fixture_deleted (body TEXT)')
    db.prepare('INSERT INTO fixture_deleted VALUES (?)').run(
      deletedSecret.repeat(32_768),
    )
    db.exec('DELETE FROM fixture_deleted')
    expect(db.pragma('freelist_count', { simple: true })).toBeGreaterThan(0)
    expect(
      db.prepare('SELECT count(*) FROM fixture_deleted').pluck().get(),
    ).toBe(0)
    db.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    db.close()
  }
  expect(readFileSync(f.source).includes(Buffer.from(deletedSecret))).toBe(true)
}

function assertScrubbed(f: ReturnType<typeof fixture>, entry = script) {
  const before = hash(f.source)
  const result = run(f, entry)
  for (const secret of planted)
    expect(result.stdout + result.stderr).not.toContain(secret)
  expect(result.status, result.stderr).toBe(0)
  expect(hash(f.source)).toBe(before)
  const path = join(f.out, 'convergence.db')
  const db = new Database(path, { readonly: true })
  try {
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(
      db
        .prepare('SELECT auth_json FROM workboard_tracker_sources')
        .pluck()
        .get(),
    ).toBe('{}')
    expect(
      db.prepare('SELECT continuation_token FROM sessions').pluck().get(),
    ).toBeNull()
    expect(
      db.prepare('SELECT extra_token FROM fixture_extra').pluck().get(),
    ).toBeNull()
    expect(
      db.prepare('SELECT required_secret FROM fixture_extra').pluck().get(),
    ).toBe('')
    expect(
      db.prepare('SELECT id, exact FROM fixture_integer').safeIntegers().get(),
    ).toEqual({ id: 9007199254740993n, exact: 9007199254740995n })
    expect(
      db
        .prepare('SELECT value FROM app_state WHERE key = ?')
        .pluck()
        .get('fixture'),
    ).toBe('{"nested":[{"apiKey":"<scrubbed>"}]}')
    expect(
      db
        .prepare(
          'SELECT length(payload_json) FROM session_conversation_items ORDER BY sequence',
        )
        .pluck()
        .all(),
    ).toEqual(f.lengths)
    const payloads = db
      .prepare(
        'SELECT payload_json FROM session_conversation_items ORDER BY sequence',
      )
      .pluck()
      .all() as string[]
    for (const payload of payloads)
      expect(() => JSON.parse(payload)).not.toThrow()
    expect(JSON.parse(payloads[0])).toMatchObject({
      apiKey: 'x'.repeat(jsonSecret.length),
      env: { MY_SECRET: expect.stringMatching(/^x+$/) },
      max_tokens: 4096,
      input_tokens: 12,
      secret: false,
      token: null,
    })
    for (const { name } of db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]) {
      for (const row of db
        .prepare(`SELECT * FROM ${quote(name)}`)
        .raw()
        .iterate() as Iterable<unknown[]>) {
        for (const value of row)
          if (typeof value === 'string') expect(hasTokens(value)).toBe(false)
      }
    }
  } finally {
    db.close()
  }
  // Also catch remnants in free pages, not just live SQL values.
  const bytes = readFileSync(path)
  for (const secret of planted)
    expect(bytes.includes(Buffer.from(secret))).toBe(false)
  expect(readdirSync(f.out)).toEqual(['convergence.db'])
  return JSON.parse(result.stdout) as {
    maskSeconds: number
    elapsedSeconds: number
    rows: Record<string, number>
  }
}

function plantLateToken(f: ReturnType<typeof fixture>, value = tokens[0]) {
  const db = new Database(f.source)
  db.exec(`CREATE TABLE aaa_late (body TEXT); INSERT INTO aaa_late VALUES ('ordinary');
    CREATE TRIGGER fixture_late AFTER UPDATE OF payload_json ON session_conversation_items BEGIN
      UPDATE aaa_late SET body = '${value.replaceAll("'", "''")}';
    END;`)
  db.close()
}

const liveWriterBoundMs = 10_000
async function copyUnderLiveWriter(entry = script) {
  const f = fixture(true)
  const sourceBytes = statSync(f.source).size
  expect(sourceBytes).toBeGreaterThan(50 * 1024 ** 2)
  const db = new Database(f.source)
  db.exec(
    'CREATE TABLE fixture_heartbeat (value INTEGER); INSERT INTO fixture_heartbeat VALUES (0)',
  )
  db.close()
  const counter = new Int32Array(new SharedArrayBuffer(4))
  const sqlite = createRequire(import.meta.url).resolve('better-sqlite3')
  const writer = new Worker(
    `
    const { parentPort, workerData } = require('node:worker_threads')
    const Database = require(${JSON.stringify(sqlite)})
    const db = new Database(workerData.source)
    db.pragma('journal_mode = WAL')
    const update = db.prepare('UPDATE fixture_heartbeat SET value = value + 1')
    const counter = new Int32Array(workerData.counter)
    const tick = () => { update.run(); Atomics.add(counter, 0, 1) }
    tick()
    setInterval(tick, 20)
    parentPort.postMessage('ready')
  `,
    { eval: true, workerData: { source: f.source, counter: counter.buffer } },
  )
  try {
    await once(writer, 'message')
    const before = Atomics.load(counter, 0)
    const started = performance.now()
    const result = run(f, entry, liveWriterBoundMs)
    const elapsedMs = performance.now() - started
    const commits = Atomics.load(counter, 0) - before
    expect(commits).toBeGreaterThan(2)
    return { f, result, elapsedMs, commits, sourceBytes }
  } finally {
    await writer.terminate()
  }
}

function assertLiveCopy(copy: Awaited<ReturnType<typeof copyUnderLiveWriter>>) {
  expect(
    copy.result.error,
    'copy must finish before the live-writer deadline',
  ).toBeUndefined()
  expect(copy.result.status, copy.result.stderr).toBe(0)
  expect(copy.elapsedMs).toBeLessThan(liveWriterBoundMs)
  const db = new Database(join(copy.f.out, 'convergence.db'), {
    readonly: true,
  })
  try {
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(
      db
        .prepare('SELECT count(*) FROM session_conversation_items')
        .pluck()
        .get(),
    ).toBe(800)
    expect(
      db.prepare('SELECT value FROM fixture_heartbeat').pluck().get(),
    ).toBeGreaterThan(0)
  } finally {
    db.close()
  }
}

function assertRejected(f: ReturnType<typeof fixture>, entry = script) {
  const before = hash(f.source)
  const result = run(f, entry)
  expect(result.status).toBe(1)
  expect(hash(f.source)).toBe(before)
  expect(existsSync(join(f.out, 'convergence.db'))).toBe(false)
  expect(readdirSync(f.out)).toEqual([])
  for (const secret of planted)
    expect(result.stdout + result.stderr).not.toContain(secret)
}

afterEach(() => {
  closeDatabase()
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

describe('perf seed CLI on a generated real-schema database', () => {
  it('R1–R4 scrubs all fields, preserves payload lengths and source bytes, and reports no secrets', () => {
    const report = assertScrubbed(fixture())
    expect(report.rows).toEqual({
      sessions: 1,
      session_conversation_items: tokens.length,
    })
  })
  it('verification rejects a token introduced after its table was masked and deletes the copy', () => {
    const f = fixture()
    plantLateToken(f)
    assertRejected(f)
  })
  it.each(
    [...tokens.slice(16), secretPayload].map(
      (value, index) => [index, value] as const,
    ),
  )('verification rejects late secret shape %s', (_index, value) => {
    const f = fixture()
    plantLateToken(f, value)
    assertRejected(f)
  })
  it('raw-byte acceptance excludes deleted secrets from source free pages', () => {
    const f = fixture()
    plantDeletedSecret(f)
    assertScrubbed(f)
  })
  it('mutation: copy with the old backup() turns source-free-page raw-byte acceptance red', async () => {
    const entry = await mutant((source) =>
      source.replace(
        "sourceDb.prepare('VACUUM INTO ?').run(copy)",
        'await sourceDb.backup(copy)',
      ),
    )
    const f = fixture()
    plantDeletedSecret(f)
    expect(() => assertScrubbed(f, entry)).toThrow()
    expect(
      readFileSync(join(f.out, 'convergence.db')).includes(
        Buffer.from(deletedSecret),
      ),
    ).toBe(true)
  })
  it('mutation: skip mask pass turns R1–R4 acceptance red', async () => {
    const entry = await mutant((source) =>
      source.replace(
        '    maskDatabase(db, reader, tables, report)',
        '    // mask pass removed by test',
      ),
    )
    expect(() => assertScrubbed(fixture(), entry)).toThrow()
  })
  it.each(
    [tokens[0], secretPayload].map((value, index) => [index, value] as const),
  )(
    'mutation: skip verify pass turns late-secret rejection %s red and leaves the planted value',
    async (_index, value) => {
      const entry = await mutant((source) =>
        source.replace(
          '    verifyDatabase(db, tables)',
          '    // verification removed by test',
        ),
      )
      const f = fixture()
      plantLateToken(f, value)
      expect(() => assertRejected(f, entry)).toThrow()
      const db = new Database(join(f.out, 'convergence.db'), { readonly: true })
      try {
        expect(db.prepare('SELECT body FROM aaa_late').pluck().get()).toBe(
          value,
        )
      } finally {
        db.close()
      }
    },
  )
  it('refuses a held target and a source alias without changing either', () => {
    const f = fixture()
    assertScrubbed(f)
    const target = join(f.out, 'convergence.db'),
      before = hash(target)
    const db = new Database(target)
    try {
      expect(run(f).status).toBe(1)
      expect(hash(target)).toBe(before)
    } finally {
      db.close()
    }
    expect(run({ ...f, source: target }).status).toBe(1)
    expect(hash(target)).toBe(before)
  })
  it('fails closed on binary data stored in a declared TEXT column', () => {
    const f = fixture(),
      db = new Database(f.source)
    db.prepare('UPDATE fixture_extra SET body = ?').run(
      Buffer.from([0, 1, 2, 3]),
    )
    db.close()
    assertRejected(f)
  })
  it('backs up committed WAL data while the source remains open, then reseeds a closed target', () => {
    const f = fixture(),
      db = new Database(f.source)
    try {
      db.pragma('journal_mode = WAL')
      db.prepare('INSERT INTO app_state VALUES (?, ?)').run(
        'wal-fixture',
        JSON.stringify({ apiKey: 'fake-state-key' }),
      )
      const walHash = hash(f.source + '-wal')
      assertScrubbed(f)
      expect(hash(f.source + '-wal')).toBe(walHash)
      const output = new Database(join(f.out, 'convergence.db'), {
        readonly: true,
      })
      try {
        expect(
          output
            .prepare('SELECT value FROM app_state WHERE key = ?')
            .pluck()
            .get('wal-fixture'),
        ).toBe('{"apiKey":"<scrubbed>"}')
      } finally {
        output.close()
      }
      assertScrubbed(f)
    } finally {
      db.close()
    }
  })
  // Run explicitly so the large write cannot disturb the APFS clone test's
  // volume-wide free-space measurement in the normal parallel suite.
  it.runIf(process.env.PERF_SEED_BENCHMARK === '1')(
    'finishes a 50 MiB live-writer snapshot within 10 seconds with integrity ok',
    async () => {
      const copy = await copyUnderLiveWriter()
      assertLiveCopy(copy)
      console.log(
        JSON.stringify({
          liveWriterIntervalMs: 20,
          boundMs: liveWriterBoundMs,
          sourceBytes: copy.sourceBytes,
          commits: copy.commits,
          elapsedMs: copy.elapsedMs,
          ...JSON.parse(copy.result.stdout),
        }),
      )
    },
    20_000,
  )
  it.runIf(process.env.PERF_SEED_BENCHMARK === '1')(
    'mutation: old 100-page stepping turns live-writer completion red',
    async () => {
      const entry = await mutant((source) =>
        source.replace(
          "sourceDb.prepare('VACUUM INTO ?').run(copy)",
          'await sourceDb.backup(copy)',
        ),
      )
      const copy = await copyUnderLiveWriter(entry)
      expect(() => assertLiveCopy(copy)).toThrow()
      expect(copy.result.error).toMatchObject({ code: 'ETIMEDOUT' })
      console.log(
        JSON.stringify({
          mutation: 'old 100-page stepping',
          elapsedMs: copy.elapsedMs,
          commits: copy.commits,
          error: 'ETIMEDOUT',
        }),
      )
    },
    20_000,
  )
  it.runIf(process.env.PERF_SEED_BENCHMARK === '1')(
    'times roughly 50 MiB of generated payload and extrapolates to 1 GiB',
    () => {
      const f = fixture(true),
        report = assertScrubbed(f)
      const bytes = f.payloadBytes
      const extrapolated = (report.maskSeconds * 1024 ** 3) / bytes
      console.log(
        JSON.stringify({
          fixturePayloadBytes: bytes,
          maskSeconds: report.maskSeconds,
          elapsedSeconds: report.elapsedSeconds,
          extrapolatedGiBSeconds: extrapolated,
        }),
      )
      expect(bytes).toBeGreaterThan(50 * 1024 ** 2)
      expect(extrapolated).toBeLessThan(600)
    },
    120_000,
  )
})
