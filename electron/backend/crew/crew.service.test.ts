import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { CrewService } from './crew.service'

describe('CrewService', () => {
  let service: CrewService

  beforeEach(() => {
    const db = getDatabase()
    service = new CrewService(db)
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'p1', '/tmp/p1')",
    ).run()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p2', 'p2', '/tmp/p2')",
    ).run()
    db.prepare(
      "INSERT INTO sessions (id, project_id, provider_id, name, working_directory) VALUES ('s1', 'p1', 'codex', 's1', '/tmp/p1')",
    ).run()
    db.prepare(
      "INSERT INTO sessions (id, project_id, provider_id, name, working_directory) VALUES ('s2', 'p2', 'claude-code', 's2', '/tmp/p2')",
    ).run()
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('creates a decorated crew and appends positions', () => {
    const first = service.create({
      name: '  Night shift  ',
      emoji: '🌙',
      accentColor: ' #7c3aed ',
    })
    const second = service.create({ name: 'Reviewers' })

    expect(first.name).toBe('Night shift')
    expect(first.emoji).toBe('🌙')
    expect(first.accentColor).toBe('#7c3aed')
    expect(first.sessionIds).toEqual([])
    expect(first.position).toBe(0)
    expect(second.position).toBe(1)
    expect(service.list().map((crew) => crew.id)).toEqual([first.id, second.id])
  })

  it('creates a crew with initial members', () => {
    const crew = service.create({
      name: 'Convoy',
      sessionIds: ['s1', 's1', 's2'],
    })
    expect(crew.sessionIds).toEqual(['s1', 's2'])
  })

  it('holds sessions from different projects in one crew', () => {
    const crew = service.create({ name: 'Cross-project' })
    service.addMember(crew.id, 's1')
    const withBoth = service.addMember(crew.id, 's2')

    expect(withBoth.sessionIds).toEqual(['s1', 's2'])
  })

  it('lets one session belong to many crews', () => {
    const masterminds = service.create({ name: 'Masterminds' })
    const workers = service.create({ name: 'Workers' })
    service.addMember(masterminds.id, 's1')
    service.addMember(workers.id, 's1')

    expect(service.list().map((crew) => crew.sessionIds)).toEqual([
      ['s1'],
      ['s1'],
    ])
  })

  it('treats adding an existing member as a no-op', () => {
    const crew = service.create({ name: 'Convoy' })
    service.addMember(crew.id, 's1')
    const again = service.addMember(crew.id, 's1')

    expect(again.sessionIds).toEqual(['s1'])
  })

  it('removes a member without touching the session', () => {
    const db = getDatabase()
    const crew = service.create({ name: 'Convoy', sessionIds: ['s1', 's2'] })
    const after = service.removeMember(crew.id, 's1')

    expect(after.sessionIds).toEqual(['s2'])
    expect(db.prepare('SELECT COUNT(*) AS count FROM sessions').get()).toEqual({
      count: 2,
    })
  })

  it('updates name and decoration, leaving untouched fields alone', () => {
    const crew = service.create({
      name: 'Convoy',
      emoji: '🐎',
      accentColor: 'violet',
    })
    const renamed = service.update(crew.id, { name: 'Stable' })
    expect(renamed.name).toBe('Stable')
    expect(renamed.emoji).toBe('🐎')
    expect(renamed.accentColor).toBe('violet')

    const undecorated = service.update(crew.id, {
      emoji: null,
      accentColor: null,
    })
    expect(undecorated.emoji).toBeNull()
    expect(undecorated.accentColor).toBeNull()
    expect(undecorated.name).toBe('Stable')
  })

  it('rejects a blank rename', () => {
    const crew = service.create({ name: 'Convoy' })
    expect(() => service.update(crew.id, { name: '  ' })).toThrow(
      /cannot be empty/,
    )
  })

  it('deletes memberships with the crew but never the sessions', () => {
    const db = getDatabase()
    const crew = service.create({ name: 'Convoy', sessionIds: ['s1', 's2'] })
    service.delete(crew.id)

    expect(service.list()).toEqual([])
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM session_crew_members').get(),
    ).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM sessions').get()).toEqual({
      count: 2,
    })
  })

  it('filters members whose session no longer exists', () => {
    const db = getDatabase()
    const crew = service.create({ name: 'Convoy', sessionIds: ['s1', 's2'] })
    db.prepare("DELETE FROM sessions WHERE id = 's1'").run()

    expect(service.list()[0]?.sessionIds).toEqual(['s2'])
    expect(service.getById(crew.id)?.sessionIds).toEqual(['s2'])
  })

  it('keeps archived sessions as valid members', () => {
    const db = getDatabase()
    const crew = service.create({ name: 'Convoy', sessionIds: ['s1'] })
    db.prepare(
      "UPDATE sessions SET archived_at = datetime('now') WHERE id = 's1'",
    ).run()

    expect(service.getById(crew.id)?.sessionIds).toEqual(['s1'])
  })

  it('throws when addressing a crew that does not exist', () => {
    expect(() => service.addMember('missing', 's1')).toThrow(/Crew not found/)
    expect(() => service.removeMember('missing', 's1')).toThrow(
      /Crew not found/,
    )
    expect(() => service.update('missing', { name: 'x' })).toThrow(
      /Crew not found/,
    )
    expect(service.getById('missing')).toBeNull()
  })

  it('deleting an unknown crew is a no-op', () => {
    const crew = service.create({ name: 'Convoy' })
    service.delete('missing')
    expect(service.list().map((entry) => entry.id)).toEqual([crew.id])
  })
})
