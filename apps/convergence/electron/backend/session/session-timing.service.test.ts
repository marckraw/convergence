import Database from 'better-sqlite3'
import { expect, it } from 'vitest'
import { readSessionTurnTimings } from './session-timing.service'

it('reads the latest lifecycle per session in a batch and refuses old restart timestamps', () => {
  const db = new Database(':memory:')
  try {
    db.exec(
      'CREATE TABLE session_turns (id TEXT, session_id TEXT, sequence INTEGER, started_at TEXT, ended_at TEXT, status TEXT)',
    )
    const insert = db.prepare(
      'INSERT INTO session_turns VALUES (?, ?, ?, ?, ?, ?)',
    )
    insert.run(
      'old',
      'a',
      1,
      '2026-09-12T12:00:00Z',
      '2026-09-12T12:01:00Z',
      'completed',
    )
    insert.run('new', 'a', 2, '2026-09-12T12:02:00Z', null, 'running')
    insert.run(
      'recovered',
      'b',
      1,
      '2026-09-12T12:00:00Z',
      '2026-09-12 12:10:00',
      'errored',
    )
    const timings = readSessionTurnTimings(db, ['a', 'b', 'missing'])
    expect(timings.size).toBe(2)
    expect(timings.get('a')).toMatchObject({
      turnId: 'new',
      endedAt: null,
      status: 'running',
    })
    expect(timings.get('b')?.endedAt).toBeNull()
    expect(readSessionTurnTimings(db, []).size).toBe(0)
  } finally {
    db.close()
  }
})
