import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  closeDatabase,
  getDatabase,
  resetDatabase,
} from '../../database/database'
import { TerminalLayoutRepository } from './terminal-layout.repository'
import { TerminalLayoutService } from './terminal-layout.service'
import type { PersistedPaneTree } from './terminal-layout.types'

const validTree: PersistedPaneTree = {
  kind: 'split',
  id: 'split-1',
  direction: 'horizontal',
  sizes: [60, 40],
  children: [
    {
      kind: 'leaf',
      id: 'leaf-a',
      tabs: [{ id: 'tab-a', cwd: '/work', title: 'zsh' }],
      activeTabId: 'tab-a',
    },
    {
      kind: 'leaf',
      id: 'leaf-b',
      tabs: [{ id: 'tab-b', cwd: '/work/sub', title: 'zsh' }],
      activeTabId: 'tab-b',
    },
  ],
}

describe('TerminalLayoutService', () => {
  let db: Database.Database
  let service: TerminalLayoutService

  beforeEach(() => {
    db = getDatabase()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p', 'p', '/tmp/p')",
    ).run()
    db.prepare(
      `INSERT INTO sessions (id, project_id, provider_id, name, working_directory)
       VALUES ('s', 'p', 'shell', 'term', '/tmp/p')`,
    ).run()
    service = new TerminalLayoutService({
      repository: new TerminalLayoutRepository(db),
      now: () => '2026-04-23T12:00:00.000Z',
    })
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('returns null when no layout is stored', () => {
    expect(service.getLayout('s')).toBeNull()
  })

  it('round-trips a valid layout through save and get', () => {
    service.saveLayout('s', validTree)
    expect(service.getLayout('s')).toEqual(validTree)
  })

  it('overwrites an existing layout on save', () => {
    service.saveLayout('s', validTree)

    const updated: PersistedPaneTree = {
      kind: 'leaf',
      id: 'only-leaf',
      tabs: [{ id: 'only-tab', cwd: '/tmp/p', title: 'zsh' }],
      activeTabId: 'only-tab',
    }
    service.saveLayout('s', updated)

    expect(service.getLayout('s')).toEqual(updated)
  })

  it('clears layout when clearLayout is called', () => {
    service.saveLayout('s', validTree)
    service.clearLayout('s')
    expect(service.getLayout('s')).toBeNull()
  })

  it('cascades when the owning session is deleted', () => {
    service.saveLayout('s', validTree)
    db.prepare('DELETE FROM sessions WHERE id = ?').run('s')
    expect(service.getLayout('s')).toBeNull()
  })

  it('throws on malformed input during save', () => {
    expect(() =>
      service.saveLayout('s', { kind: 'leaf', id: 'l', tabs: [] }),
    ).toThrow()
  })

  it('drops stored layout if it becomes corrupt and returns null', () => {
    db.prepare(
      `INSERT INTO session_terminal_layout (session_id, layout_json, updated_at)
       VALUES (?, ?, ?)`,
    ).run('s', '{"kind":"leaf","id":"x","tabs":[]}', '2026-04-23T12:00:00.000Z')

    expect(service.getLayout('s')).toBeNull()
    // Corrupt row should be gone.
    const remaining = db
      .prepare('SELECT * FROM session_terminal_layout WHERE session_id = ?')
      .all('s')
    expect(remaining).toEqual([])
  })
})
