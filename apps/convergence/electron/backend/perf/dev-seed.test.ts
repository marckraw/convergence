import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

const script = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../tools/dev-seed.mjs',
)
const databaseModule = createRequire(import.meta.url).resolve('better-sqlite3')
const roots: string[] = []

function executable(path: string, contents: string) {
  writeFileSync(path, `#!${process.execPath}\n${contents}`, { mode: 0o755 })
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mar-4326-dev-seed-'))
  roots.push(root)
  const source = join(root, 'Library', 'Application Support', 'convergence')
  const sandbox = join(root, 'sandbox')
  const bin = join(root, 'bin')
  for (const dir of [source, sandbox, bin]) mkdirSync(dir, { recursive: true })
  for (const [dir, name] of [
    [source, 'source'],
    [sandbox, 'sandbox'],
  ]) {
    const db = new Database(join(dir, 'convergence.db'))
    db.exec('CREATE TABLE sessions (name TEXT)')
    db.prepare('INSERT INTO sessions VALUES (?)').run(name)
    db.close()
    for (const child of ['attachments', 'session-outputs']) {
      mkdirSync(join(dir, child))
      writeFileSync(join(dir, child, 'fixture'), name)
    }
  }
  // Exercise the CLI without requiring a system sqlite3 executable. This
  // stand-in performs a real SQLite backup and query, and records every call.
  const calls = join(root, 'sqlite-calls')
  executable(
    join(bin, 'sqlite3'),
    `const { appendFileSync } = require('node:fs')
const Database = require(${JSON.stringify(databaseModule)})
appendFileSync(${JSON.stringify(calls)}, 'called\\n')
const db = new Database(process.argv[2])
const command = process.argv[3]
if (command.startsWith(".backup '")) {
  db.backup(command.slice(9, -1).replaceAll("''", "'")).then(() => db.close())
} else {
  console.log(db.prepare(command).pluck().get())
  db.close()
}`,
  )
  return { root, source, sandbox, bin, calls }
}

function snapshot(dir: string) {
  return Object.fromEntries(
    readdirSync(dir, { recursive: true })
      .map(String)
      .filter((name) => statSync(join(dir, name)).isFile())
      .sort()
      .map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(join(dir, name)))
          .digest('hex'),
      ]),
  )
}

function run(f: ReturnType<typeof fixture>, args: string[] = []) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      HOME: f.root,
      CONVERGENCE_USER_DATA_DIR: f.sandbox,
      PATH: f.bin,
    },
  })
}

function realLsof(f: ReturnType<typeof fixture>) {
  const path = process.env.PATH?.split(delimiter)
    .map((dir) => join(dir, 'lsof'))
    .find((file) => existsSync(file))
  expect(path, 'dev-seed CLI tests require real lsof on PATH').toBeDefined()
  symlinkSync(path!, join(f.bin, 'lsof'))
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

describe('dev seed target checks', () => {
  it('refuses missing lsof while the sandbox is open and leaves all data untouched', () => {
    const f = fixture()
    const db = new Database(join(f.sandbox, 'convergence.db'))
    try {
      const before = snapshot(f.root)
      const result = run(f)
      expect(snapshot(f.root)).toEqual(before)
      expect(result.status, result.stderr).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('LSOF_UNAVAILABLE')
      expect(result.stderr).toContain('Install lsof and ensure it is on PATH')
      expect(existsSync(f.calls)).toBe(false)
    } finally {
      db.close()
    }
  })

  it.each([
    ['nonzero exit', 'process.exit(2)'],
    ['stderr', "console.error('cannot inspect target'); process.exit(1)"],
    ['signal', "process.kill(process.pid, 'SIGTERM')"],
  ])('refuses an inconclusive lsof check: %s', (_name, contents) => {
    const f = fixture()
    executable(join(f.bin, 'lsof'), contents)
    const before = snapshot(f.root)
    const result = run(f)
    expect(snapshot(f.root)).toEqual(before)
    expect(result.status, result.stderr).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('cannot check')
    expect(existsSync(f.calls)).toBe(false)
  })

  it('refuses when lsof exists but cannot be executed', () => {
    const f = fixture()
    const lsof = join(f.bin, 'lsof')
    executable(lsof, '')
    chmodSync(lsof, 0o644)
    const before = snapshot(f.root)
    const result = run(f)
    expect(snapshot(f.root)).toEqual(before)
    expect(result.status, result.stderr).toBe(1)
    expect(result.stderr).toContain('LSOF_UNAVAILABLE')
    expect(existsSync(f.calls)).toBe(false)
  })

  it('refuses an open sandbox with real lsof', () => {
    const f = fixture()
    realLsof(f)
    const db = new Database(join(f.sandbox, 'convergence.db'))
    try {
      const before = snapshot(f.root)
      const result = run(f)
      expect(snapshot(f.root)).toEqual(before)
      expect(result.status, result.stderr).toBe(1)
      expect(result.stderr).toContain('sandbox database is open by pid(s)')
      expect(result.stderr).toContain(String(process.pid))
      expect(existsSync(f.calls)).toBe(false)
    } finally {
      db.close()
    }
  })

  it.each(['closed target', 'initial seed', '--force'])(
    'continues to seed with %s',
    (mode) => {
      const f = fixture()
      if (mode === 'closed target') realLsof(f)
      if (mode === 'initial seed') rmSync(join(f.sandbox, 'convergence.db'))
      const before = snapshot(f.source)
      const result = run(f, mode === '--force' ? ['--force'] : [])
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toContain('done: snapshot holds 1 sessions')
      expect(snapshot(f.source)).toEqual(before)
      const db = new Database(join(f.sandbox, 'convergence.db'), {
        readonly: true,
      })
      try {
        expect(db.prepare('SELECT name FROM sessions').pluck().all()).toEqual([
          'source',
        ])
      } finally {
        db.close()
      }
      for (const dir of ['attachments', 'session-outputs'])
        expect(snapshot(join(f.sandbox, dir))).toEqual(
          snapshot(join(f.source, dir)),
        )
      expect(readFileSync(f.calls, 'utf8')).toBe('called\ncalled\n')
    },
  )
})
