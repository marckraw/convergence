#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import {
  SECRET_COLUMN,
  createTokenMasker,
  maskTokens,
  scrubStateJson,
} from '../electron/backend/perf/perf-seed.pure.ts'

const HELP = `Usage: npm run perf:seed -- [--source <db>] [--out <dir>]
Defaults: --source ~/Library/Application Support/convergence/convergence.db
          --out ~/.convergence-perf-seed/
Writes convergence.db: a consistent read-only-source backup, scrubbed and fully re-scanned.
Marcin or Fable runs real-data measurements; executors use generated temporary fixtures only.
No attachments or session-outputs are copied: database measurements do not need them.
Known secrets are blanked; token-shaped text and secret-keyed JSON strings are masked at equal length.
This is pattern-based scrubbing, not anonymization of arbitrary prose or personal data.
The target must be closed (checked with lsof); there is no force override.
Requires the Node version in .nvmrc and a Node-compatible better-sqlite3 build.
Reports counts only. On failure, the unpublished copy is deleted; an older output is preserved.`

const quote = (name) => `"${name.replaceAll('"', '""')}"`
function closedTarget(path) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const file = path + suffix
    if (!existsSync(file)) continue
    if (!lstatSync(file).isFile()) throw new Error('unsafe target')
    const result = spawnSync('lsof', ['-t', '--', file], { encoding: 'utf8' })
    if (
      result.error ||
      ![0, 1].includes(result.status) ||
      result.stderr?.trim() ||
      result.stdout?.trim()
    ) {
      throw new Error('target open or cannot check')
    }
    // An offline WAL may hold newer data. Do not replace its database underneath it.
    if (suffix) throw new Error('target has sidecars')
  }
}

function schema(db) {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map(({ name }) => {
      activeTable = name
      const columns = db.prepare('SELECT * FROM pragma_table_info(?)').all(name)
      const extended = db
        .prepare('SELECT * FROM pragma_table_xinfo(?)')
        .all(name)
      if (extended.some((column) => column.hidden))
        throw new Error('unsupported generated or virtual column')
      const rowid = ['rowid', '_rowid_', 'oid'].find(
        (key) => !columns.some((column) => column.name.toLowerCase() === key),
      )
      let keys
      try {
        if (!rowid) throw new Error('no rowid alias')
        db.prepare(`SELECT ${rowid} FROM ${quote(name)} LIMIT 0`).all()
        keys = [rowid]
      } catch {
        keys = columns
          .filter((column) => column.pk)
          .sort((a, b) => a.pk - b.pk)
          .map((column) => column.name)
        if (!keys.length) throw new Error('no row locator')
      }
      return { name, columns, keys }
    })
}

function blankSecrets(db, reader, tables, report) {
  db.transaction(() => {
    for (const table of tables) {
      activeTable = table.name
      const secrets = table.columns.flatMap((column) => {
        const auth =
          table.name === 'workboard_tracker_sources' &&
          column.name === 'auth_json'
        return auth || SECRET_COLUMN.test(column.name)
          ? [{ ...column, auth }]
          : []
      })
      if (!secrets.length) continue
      const required = secrets.filter(
        (column) => column.notnull && !column.auth,
      )
      let prefix = 'scrubbed-'
      if (required.length) {
        // Reserve a namespace absent from all originals so in-place UNIQUE
        // checks cannot collide with a row that has not been scrubbed yet.
        const occupied = db.prepare(
          `SELECT 1 FROM ${quote(table.name)} WHERE ${required.map((column) => `${quote(column.name)} LIKE ?`).join(' OR ')} LIMIT 1`,
        )
        while (occupied.get(...required.map(() => `${prefix}%`)))
          prefix = `scrubbed-${randomUUID()}-`
      }
      const update = db.prepare(
        `UPDATE ${quote(table.name)} SET ${secrets.map((column) => `${quote(column.name)} = ?`).join(', ')} WHERE ${table.keys.map((key) => `${quote(key)} IS ?`).join(' AND ')}`,
      )
      let rows = 0
      // The reader's snapshot holds original locators even when a secret is
      // itself a WITHOUT ROWID primary key. Ordinals never expose those keys.
      for (const keys of reader
        .prepare(
          `SELECT ${table.keys.map(quote).join(', ')} FROM ${quote(table.name)}`,
        )
        .safeIntegers()
        .raw()
        .iterate()) {
        const placeholder = `${prefix}${++rows}`
        update.run(
          ...secrets.map((column) =>
            column.auth ? '{}' : column.notnull ? placeholder : null,
          ),
          ...keys,
        )
      }
      for (const column of secrets) {
        report.blanked[maskTokens(`${table.name}.${column.name}`).value] = {
          rows,
          replacement: column.auth
            ? '{}'
            : column.notnull
              ? 'unique placeholder (NOT NULL)'
              : 'NULL',
        }
      }
    }
    if (tables.some((table) => table.name === 'app_state')) {
      activeTable = 'app_state'
      const update = db.prepare('UPDATE app_state SET value = ? WHERE key = ?')
      let rows = 0
      for (const row of reader
        .prepare('SELECT key, value FROM app_state')
        .iterate()) {
        if (typeof row.value !== 'string') throw new Error('binary app_state')
        const value = scrubStateJson(row.value)
        if (value !== row.value) {
          update.run(value, row.key)
          rows++
        }
      }
      report.blanked['app_state.value'] = {
        rows,
        replacement: 'JSON secret keys scrubbed',
      }
    }
  })()
}

// A separate WAL reader keeps row identities stable even when a masked column
// is a primary key. Only a bounded batch of changed cells is held in memory.
function maskDatabase(db, reader, tables, report, masker) {
  // Reserve original matches before allocating fillers, including short JSON
  // secrets made entirely of punctuation. Only matches are retained, not rows.
  for (const table of tables) {
    activeTable = table.name
    for (const row of reader
      .prepare(`SELECT * FROM ${quote(table.name)}`)
      .raw()
      .iterate()) {
      for (const value of row)
        if (typeof value === 'string') masker.reserve(value)
    }
  }
  for (const table of tables) {
    activeTable = table.name
    const select = [
      ...table.keys,
      ...table.columns.map((column) => column.name),
    ]
      .map(quote)
      .join(', ')
    const update = db.prepare(
      `UPDATE ${quote(table.name)} SET ${table.columns.map((column) => `${quote(column.name)} = ?`).join(', ')} WHERE ${table.keys.map((key) => `${quote(key)} IS ?`).join(' AND ')}`,
    )
    let batch = [],
      bytes = 0
    const flush = db.transaction(() => {
      for (const item of batch) update.run(...item.values, ...item.keys)
    })
    for (const row of reader
      .prepare(`SELECT ${select} FROM ${quote(table.name)}`)
      .safeIntegers()
      .raw()
      .iterate()) {
      const values = row.slice(table.keys.length)
      let changed = false
      for (let index = 0; index < table.columns.length; index++) {
        const value = row[table.keys.length + index]
        // SQLite can store text in any declared affinity, so inspect runtime types too.
        if (
          Buffer.isBuffer(value) &&
          /TEXT|CHAR|CLOB/i.test(table.columns[index].type)
        )
          throw new Error('binary value in text column')
        if (typeof value !== 'string') continue
        const masked = masker.maskTokens(value)
        if (!masked.count) continue
        const label = maskTokens(
          `${table.name}.${table.columns[index].name}`,
        ).value
        report.masked[label] = (report.masked[label] ?? 0) + masked.count
        values[index] = masked.value
        changed = true
        bytes += masked.value.length * 2
      }
      if (changed) batch.push({ values, keys: row.slice(0, table.keys.length) })
      if (batch.length >= 128 || bytes >= 4 * 1024 * 1024) {
        flush()
        batch = []
        bytes = 0
      }
    }
    flush()
  }
}

function verifyDatabase(db, tables, masker) {
  for (const table of tables) {
    activeTable = table.name
    for (const row of db
      .prepare(`SELECT * FROM ${quote(table.name)}`)
      .raw()
      .iterate()) {
      for (const value of row) {
        if (typeof value === 'string' && masker.hasTokens(value))
          throw new Error('verification failed')
      }
    }
  }
}

let phase = 'arguments and target checks'
let activeTable
async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log(HELP)
    return
  }
  let source = join(
    homedir(),
    'Library',
    'Application Support',
    'convergence',
    'convergence.db',
  )
  let out = join(homedir(), '.convergence-perf-seed')
  for (let index = 0; index < args.length; index += 2) {
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error('invalid arguments')
    if (args[index] === '--source') source = resolve(value)
    else if (args[index] === '--out') out = resolve(value)
    else throw new Error('invalid arguments')
  }
  const started = performance.now()
  const target = join(out, 'convergence.db')
  const sourceStat = statSync(source)
  if (existsSync(target)) {
    const targetStat = statSync(target)
    if (sourceStat.dev === targetStat.dev && sourceStat.ino === targetStat.ino)
      throw new Error('source equals target')
  }
  closedTarget(target)
  mkdirSync(out, { recursive: true, mode: 0o700 })
  const staging = mkdtempSync(join(out, '.scrubbing-'))
  chmodSync(staging, 0o700)
  const copy = join(staging, 'convergence.db')
  let sourceDb, db, reader
  try {
    phase = 'read-only backup'
    const copyStarted = performance.now()
    sourceDb = new Database(source, { readonly: true, fileMustExist: true })
    // One snapshot under concurrent writes; deleted source pages never enter the copy.
    sourceDb.prepare('VACUUM INTO ?').run(copy)
    sourceDb.close()
    sourceDb = undefined
    const copySeconds = (performance.now() - copyStarted) / 1000
    chmodSync(copy, 0o600)
    db = new Database(copy)
    db.pragma('trusted_schema = OFF')
    db.pragma('foreign_keys = OFF')
    db.pragma('secure_delete = ON')
    db.pragma('journal_mode = WAL')
    phase = 'schema inspection'
    const tables = schema(db)
    const report = {
      blanked: {},
      masked: {},
      rows: {},
      bytes: 0,
      maskSeconds: 0,
      copySeconds,
      elapsedSeconds: 0,
    }
    reader = new Database(copy, { readonly: true })
    phase = 'blanking'
    blankSecrets(db, reader, tables, report)
    const masker = createTokenMasker()
    const maskStarted = performance.now()
    phase = 'masking'
    maskDatabase(db, reader, tables, report, masker)
    report.maskSeconds = (performance.now() - maskStarted) / 1000
    reader.close()
    reader = undefined
    phase = 'verification'
    verifyDatabase(db, tables, masker)
    for (const name of ['sessions', 'session_conversation_items']) {
      if (tables.some((table) => table.name === name))
        report.rows[name] = db
          .prepare(`SELECT count(*) AS count FROM ${quote(name)}`)
          .get().count
    }
    // VACUUM INTO excluded source free pages; secure_delete erases pages we free.
    // Rebuild after index updates too: secure_delete alone can leave old index
    // separator bytes outside live SQL rows.
    phase = 'compaction'
    activeTable = undefined
    db.exec('VACUUM')
    // Checkpoint/truncate the WAL before publishing the scrubbed database.
    phase = 'checkpoint'
    activeTable = undefined
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.pragma('journal_mode = DELETE')
    db.close()
    db = undefined
    phase = 'publication'
    closedTarget(target)
    renameSync(copy, target)
    report.bytes = statSync(target).size
    report.elapsedSeconds = (performance.now() - started) / 1000
    console.log(JSON.stringify(report, null, 2))
  } finally {
    reader?.close()
    db?.close()
    sourceDb?.close()
    rmSync(staging, { recursive: true, force: true })
  }
}

try {
  await main()
} catch (error) {
  // SQLite errors, paths and command arguments can contain row data or credentials.
  const table =
    activeTable === undefined ? '(none)' : maskTokens(activeTable).value
  const code =
    typeof error?.code === 'string' && /^SQLITE_[A-Z_]+$/.test(error.code)
      ? error.code
      : 'NON_SQLITE'
  console.error(
    `perf:seed failed during ${phase}; table=${JSON.stringify(table)}; code=${code}; unpublished copy removed. No source values are reported.`,
  )
  process.exitCode = 1
}
