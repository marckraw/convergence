import type Database from 'better-sqlite3'
import { expect } from 'vitest'

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`
type Column = { name: string; type: string; notnull: number; pk: number }

// Discover constraints, including primary, partial and expression indexes, from
// the migrated schema. Fail on new expression/predicate shapes until exercised.
export function plantUniquePairs(db: Database.Database) {
  db.pragma('foreign_keys = OFF')
  const coverage = []
  let ordinal = 0
  for (const { name: table } of db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as { name: string }[]) {
    const columns = db
      .prepare('SELECT * FROM pragma_table_info(?)')
      .all(table) as Column[]
    const tableSql = (
      db.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(table) as {
        sql: string
      }
    ).sql
    const enums = new Map(
      [...tableSql.matchAll(/CHECK\s*\(\s*(\w+)\s+IN\s*\(\s*'([^']+)'/gi)].map(
        (match) => [match[1], match[2]],
      ),
    )
    const indices = db
      .prepare('SELECT * FROM pragma_index_list(?) WHERE "unique"=1')
      .all(table) as { name: string; partial: number }[]
    for (const index of indices) {
      const keys = db
        .prepare('SELECT * FROM pragma_index_xinfo(?) WHERE key=1')
        .all(index.name) as { name: string | null; cid: number }[]
      const sql = (
        db
          .prepare('SELECT sql FROM sqlite_master WHERE name=?')
          .get(index.name) as { sql: string | null }
      ).sql
      const names = keys.map((key) => {
        if (key.name) return key.name
        expect(sql).toContain("COALESCE(repo_root, '')")
        return 'repo_root'
      })
      const textKeys = columns.filter(
        (column) =>
          names.includes(column.name) && /TEXT|CHAR|CLOB/i.test(column.type),
      )
      if (!textKeys.length) continue
      const predicate = index.partial ? sql!.split(/\bWHERE\b/i)[1].trim() : '1'
      expect([
        '1',
        'lane_of IS NOT NULL',
        'is_primary = 1',
        'is_default = 1',
        'session_id IS NULL',
        'session_id IS NOT NULL',
      ]).toContain(predicate)
      const originals: string[] = []
      const rowids: number[] = []
      for (let row = 0; row < 2; row++) {
        const values = columns.map((column) => {
          if (predicate === `${column.name} IS NULL`) return null
          if (enums.has(column.name)) return enums.get(column.name)!
          if (column.name === 'is_primary' || column.name === 'is_default')
            return 1
          if (!/TEXT|CHAR|CLOB/i.test(column.type))
            return names.includes(column.name) ? 1 : ++ordinal
          const token = `ghp_${String(++ordinal).padStart(30, '0')}`
          // Both rows share the JSON wrapper: only the equally long secrets
          // distinguish them, so all-x masking must collide here too.
          const value =
            textKeys.includes(column) && textKeys.indexOf(column) === 0
              ? JSON.stringify({ token })
              : token
          originals.push(token, value)
          return value
        })
        const inserted = db
          .prepare(
            `INSERT INTO ${quote(table)} (${columns.map((column) => quote(column.name)).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
          )
          .run(...values)
        rowids.push(Number(inserted.lastInsertRowid))
      }
      expect(
        db
          .prepare(
            `SELECT count(*) FROM ${quote(table)} WHERE rowid IN (?, ?) AND (${predicate})`,
          )
          .pluck()
          .get(...rowids),
      ).toBe(2)
      coverage.push({ table, index: index.name, names, rowids, originals })
    }
  }
  return coverage
}

export function assertUniquePairs(
  db: Database.Database,
  coverage: ReturnType<typeof plantUniquePairs>,
) {
  for (const { table, index, names, rowids } of coverage) {
    const rows = db
      .prepare(
        `SELECT ${names.map(quote).join(',')} FROM ${quote(table)} WHERE rowid IN (?, ?)`,
      )
      .raw()
      .all(...rowids)
    expect(rows, index).toHaveLength(2)
    expect(rows[0], index).not.toEqual(rows[1])
  }
}
