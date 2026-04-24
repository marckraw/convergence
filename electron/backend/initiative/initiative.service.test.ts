import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { InitiativeService } from './initiative.service'

describe('InitiativeService', () => {
  let service: InitiativeService

  beforeEach(() => {
    const db = getDatabase()
    service = new InitiativeService(db)
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

  it('creates and updates a global initiative', () => {
    const created = service.create({
      title: ' Agent-native initiatives ',
      currentUnderstanding: '  rough idea  ',
    })

    expect(created.title).toBe('Agent-native initiatives')
    expect(created.status).toBe('exploring')
    expect(created.attention).toBe('none')
    expect(created.currentUnderstanding).toBe('rough idea')

    const updated = service.update(created.id, {
      status: 'implementing',
      attention: 'needs-decision',
      currentUnderstanding: 'implementation direction',
    })

    expect(updated.status).toBe('implementing')
    expect(updated.attention).toBe('needs-decision')
    expect(updated.currentUnderstanding).toBe('implementation direction')
  })

  it('rejects an empty title', () => {
    expect(() => service.create({ title: '   ' })).toThrow(
      'Initiative title is required',
    )
  })

  it('links sessions from different projects as attempts', () => {
    const initiative = service.create({ title: 'Cross-project feature' })

    const first = service.linkAttempt({
      initiativeId: initiative.id,
      sessionId: 's1',
      role: 'seed',
    })
    const second = service.linkAttempt({
      initiativeId: initiative.id,
      sessionId: 's2',
      role: 'implementation',
    })

    expect(first.isPrimary).toBe(true)
    expect(second.isPrimary).toBe(false)
    expect(service.listAttempts(initiative.id).map((a) => a.sessionId)).toEqual(
      ['s1', 's2'],
    )
  })

  it('prevents duplicate session links within one initiative', () => {
    const initiative = service.create({ title: 'Duplicate test' })
    service.linkAttempt({ initiativeId: initiative.id, sessionId: 's1' })

    expect(() =>
      service.linkAttempt({ initiativeId: initiative.id, sessionId: 's1' }),
    ).toThrow('Session is already linked to this Initiative')
  })

  it('sets one primary attempt transactionally', () => {
    const initiative = service.create({ title: 'Primary test' })
    const first = service.linkAttempt({
      initiativeId: initiative.id,
      sessionId: 's1',
    })
    const second = service.linkAttempt({
      initiativeId: initiative.id,
      sessionId: 's2',
    })

    service.setPrimaryAttempt(initiative.id, second.id)

    const attempts = service.listAttempts(initiative.id)
    expect(
      attempts
        .filter((attempt) => attempt.isPrimary)
        .map((attempt) => attempt.id),
    ).toEqual([second.id])
    expect(attempts.find((attempt) => attempt.id === first.id)?.isPrimary).toBe(
      false,
    )
  })

  it('updates and unlinks attempts', () => {
    const initiative = service.create({ title: 'Attempt updates' })
    const attempt = service.linkAttempt({
      initiativeId: initiative.id,
      sessionId: 's1',
    })

    expect(service.updateAttempt(attempt.id, { role: 'review' }).role).toBe(
      'review',
    )

    service.unlinkAttempt(attempt.id)
    expect(service.listAttempts(initiative.id)).toEqual([])
  })

  it('manages outputs', () => {
    const initiative = service.create({ title: 'Output test' })
    const output = service.addOutput({
      initiativeId: initiative.id,
      kind: 'pull-request',
      label: ' PR ',
      value: ' https://example.com/pr/1 ',
      sourceSessionId: 's1',
    })

    expect(output.label).toBe('PR')
    expect(output.value).toBe('https://example.com/pr/1')
    expect(output.status).toBe('planned')

    const updated = service.updateOutput(output.id, {
      status: 'merged',
      label: 'Merged PR',
    })
    expect(updated.status).toBe('merged')
    expect(updated.label).toBe('Merged PR')

    service.deleteOutput(output.id)
    expect(service.listOutputs(initiative.id)).toEqual([])
  })

  it('cascades attempts and outputs when an initiative is deleted', () => {
    const initiative = service.create({ title: 'Cascade test' })
    service.linkAttempt({ initiativeId: initiative.id, sessionId: 's1' })
    service.addOutput({
      initiativeId: initiative.id,
      kind: 'branch',
      label: 'Branch',
      value: 'feature/a',
    })

    service.delete(initiative.id)

    expect(service.getById(initiative.id)).toBeNull()
    const db = getDatabase()
    expect(
      db
        .prepare('SELECT id FROM initiative_attempts WHERE initiative_id = ?')
        .all(initiative.id),
    ).toEqual([])
    expect(
      db
        .prepare('SELECT id FROM initiative_outputs WHERE initiative_id = ?')
        .all(initiative.id),
    ).toEqual([])
  })
})
