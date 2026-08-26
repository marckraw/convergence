import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { ExecutionHostEndpointRepository } from './execution-host-endpoint.repository'

/**
 * The read side of an Endpoint id's boundary (MAR-2642).
 *
 * The write path refuses an id that could carry a second keychain command, and
 * that would be the whole story if writing were the only way a row arrives.
 * It is not: this database is a file on disk, it outlives the version of the
 * code that wrote it, and an id read back off it reaches `security` exactly
 * like one typed today. So the check is at the read as well — and it refuses
 * rather than drops, because a dropped row hides a machine whose sessions still
 * name it, and a repaired id is that machine's Keychain account quietly
 * becoming somebody else's.
 */
describe('ExecutionHostEndpointRepository, reading rows back', () => {
  let db: Database.Database
  let repository: ExecutionHostEndpointRepository

  beforeEach(() => {
    db = getDatabase()
    repository = new ExecutionHostEndpointRepository(db)
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  /** Bypasses `replaceAll`, which is the only thing that validates on write. */
  function insertRow(id: string): void {
    db.prepare(
      `INSERT INTO execution_host_endpoints (id, label, base_url, position)
       VALUES (?, ?, ?, 0)`,
    ).run(id, 'Smuggled', 'https://daemon.test')
  }

  it('refuses a stored id that could start a second keychain command', () => {
    insertRow('kuba\ndelete-generic-password -a default')

    expect(() => repository.list()).toThrow(/is not usable/)
    expect(() =>
      repository.getById('kuba\ndelete-generic-password -a default'),
    ).toThrow(/is not usable/)
  })

  it('names the id it refused rather than reporting no endpoints', () => {
    insertRow('kuba vps')

    // Answering with an empty list would say the daemon is unconfigured, which
    // is a different and comforting untruth.
    expect(() => repository.list()).toThrow(/"kuba vps"/)
  })

  it('reads back an id this app could have written, unchanged', () => {
    repository.replaceAll([
      { id: 'kuba-vps', label: 'kuba', baseUrl: 'https://daemon.test' },
      { id: 'default', label: 'Remote daemon', baseUrl: 'https://old.test' },
    ])

    expect(repository.list().map((endpoint) => endpoint.id)).toEqual([
      'kuba-vps',
      'default',
    ])
    expect(repository.getById('default')?.id).toBe('default')
  })

  /**
   * The sweep asks this about accounts it read out of the Keychain, not out of
   * this table — including garbage filed before ids were bounded. A lookup that
   * validated its argument would throw inside the liveness question and leave
   * that garbage uncollectable, which is the opposite of the point.
   */
  it('answers a lookup for an id no row could hold, rather than refusing it', () => {
    repository.replaceAll([
      { id: 'kuba-vps', label: 'kuba', baseUrl: 'https://daemon.test' },
    ])

    expect(repository.getById('kuba vps')).toBeNull()
    expect(repository.getById('kuba\nrm -rf')).toBeNull()
  })
})
